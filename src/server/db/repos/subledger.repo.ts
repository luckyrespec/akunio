import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { accounts } from "../schema/org";
import { journalEntries, journalLines } from "../schema/journal";
import { invoices } from "../schema/invoicing";
import { inventoryItems } from "../schema/inventory";
import { fixedAssets, assetDepreciationLines } from "../schema/assets";
import { prepaidContracts } from "../schema/prepaid";
import { aiFindings } from "../schema/doctor";
import { subledgerControls, subledgerJournalLinks, type SubledgerKind } from "../schema/subledger";

export async function getSubledgerControls(q: Queryable, orgId: string) {
  return q.select().from(subledgerControls).where(eq(subledgerControls.orgId, orgId));
}

export async function getControlKindByAccount(q: Queryable, orgId: string): Promise<Map<string, SubledgerKind>> {
  const rows = await getSubledgerControls(q, orgId);
  return new Map(rows.map((r) => [r.controlAccountId, r.kind as SubledgerKind]));
}

export async function seedSubledgerControls(
  q: Queryable,
  orgId: string,
  ids: { receivableAccountId?: string | null; payableAccountId?: string | null; inventoryAccountId?: string | null; dimukaAccountId?: string | null; assetAccountId?: string | null },
): Promise<void> {
  const rows = [
    ids.receivableAccountId ? { orgId, kind: "PIUTANG", controlAccountId: ids.receivableAccountId } : null,
    ids.payableAccountId ? { orgId, kind: "UTANG", controlAccountId: ids.payableAccountId } : null,
    ids.inventoryAccountId ? { orgId, kind: "PERSEDIAAN", controlAccountId: ids.inventoryAccountId } : null,
    ids.dimukaAccountId ? { orgId, kind: "DIMUKA", controlAccountId: ids.dimukaAccountId } : null,
    ids.assetAccountId ? { orgId, kind: "ASET_TETAP", controlAccountId: ids.assetAccountId } : null,
  ].filter((r): r is { orgId: string; kind: "PIUTANG" | "UTANG" | "PERSEDIAAN" | "DIMUKA" | "ASET_TETAP"; controlAccountId: string } => r !== null);
  if (rows.length === 0) return;
  await q.insert(subledgerControls).values(rows)
    .onConflictDoNothing({ target: [subledgerControls.orgId, subledgerControls.kind] });
}

export interface NewSubledgerLink {
  journalLineId: string;
  kind: SubledgerKind;
  refId: string;
  amountMinor: bigint;
  qty?: number;
}

export async function insertSubledgerLinks(q: Queryable, orgId: string, links: NewSubledgerLink[]): Promise<void> {
  if (links.length === 0) return;
  await q.insert(subledgerJournalLinks).values(links.map((l) => ({
    orgId,
    journalLineId: l.journalLineId,
    kind: l.kind,
    refId: l.refId,
    amountMinor: l.amountMinor,
    qty: l.qty == null ? null : String(l.qty),
  })));
}

export async function listLinksForEntry(q: Queryable, orgId: string, entryId: string) {
  return q.select({
    lineId: journalLines.id,
    position: journalLines.position,
    accountId: journalLines.accountId,
    linkId: subledgerJournalLinks.id,
    kind: subledgerJournalLinks.kind,
    refId: subledgerJournalLinks.refId,
    amountMinor: subledgerJournalLinks.amountMinor,
  })
    .from(journalLines)
    .leftJoin(subledgerJournalLinks, eq(subledgerJournalLinks.journalLineId, journalLines.id))
    .where(and(eq(journalLines.orgId, orgId), eq(journalLines.entryId, entryId)));
}

/** Saldo akun kontrol dari baris POSTED saja, memperhatikan normal D/K.
 *  Kind ASET_TETAP memakai mode famili: kontrol menunjuk root (1500) dan
 *  saldo dihitung dari seluruh daun 15xx (bruto) dikurangi kontra 159x,
 *  karena perolehan disusutkan per daun (mis. 1510). */
export async function getControlGlBalance(q: Queryable, orgId: string, controlAccountId: string, kind?: SubledgerKind): Promise<bigint> {
  const [acc] = await q.select({ normal: accounts.normal, code: accounts.code }).from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, controlAccountId))).limit(1);
  if (!acc) throw new Error("KONTROL_BELUM_DIPETAKAN: akun kontrol tidak ditemukan di org ini");
  if (kind === "ASET_TETAP") {
    const prefix = acc.code.slice(0, 2);
    const res = await q.execute<{ bal: string }>(sql`
      SELECT COALESCE(SUM((${journalLines.debit} - ${journalLines.credit}) * 100), 0)::bigint AS bal
      FROM ${journalLines}
      JOIN ${journalEntries} ON ${journalEntries.id} = ${journalLines.entryId}
      JOIN ${accounts} ON ${accounts.id} = ${journalLines.accountId}
      WHERE ${journalLines.orgId} = ${orgId}
        AND ${accounts.orgId} = ${orgId}
        AND ${accounts.code} LIKE ${prefix + "%"}
        AND ${journalEntries.status} = 'POSTED'
    `);
    return BigInt(res.rows?.[0]?.bal ?? "0");
  }
  const res = await q.execute<{ bal: string }>(sql`
    SELECT COALESCE(SUM((${journalLines.debit} - ${journalLines.credit}) * 100), 0)::bigint AS bal
    FROM ${journalLines}
    JOIN ${journalEntries} ON ${journalEntries.id} = ${journalLines.entryId}
    WHERE ${journalLines.orgId} = ${orgId}
      AND ${journalLines.accountId} = ${controlAccountId}
      AND ${journalEntries.status} = 'POSTED'
  `);
  const signed = BigInt(res.rows?.[0]?.bal ?? "0");
  return acc.normal === "D" ? signed : -signed;
}

export async function subledgerTotalFor(q: Queryable, orgId: string, kind: SubledgerKind): Promise<bigint> {
  if (kind === "PERSEDIAAN") {
    const res = await q.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(${inventoryItems.totalCostMinor}), 0)::bigint AS total
      FROM ${inventoryItems}
      WHERE ${inventoryItems.orgId} = ${orgId}
        AND ${inventoryItems.isActive} = true
        AND ${inventoryItems.itemType} = 'BARANG'
    `);
    return BigInt(res.rows?.[0]?.total ?? "0");
  }
  if (kind === "DIMUKA") {
    const res = await q.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(${prepaidContracts.remainingMinor}), 0)::bigint AS total
      FROM ${prepaidContracts}
      WHERE ${prepaidContracts.orgId} = ${orgId}
        AND ${prepaidContracts.status} = 'ACTIVE'
    `);
    return BigInt(res.rows?.[0]?.total ?? "0");
  }
  if (kind === "ASET_TETAP") {
    // Nilai buku = biaya perolehan − susut yang SUDAH diposting (jadwal
    // SCHEDULED masa depan belum ada di GL, jadi tidak ikut).
    const res = await q.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(
        ${fixedAssets.acquisitionCostMinor} - COALESCE((
          SELECT SUM(${assetDepreciationLines.depreciationAmountMinor})
          FROM ${assetDepreciationLines}
          WHERE ${assetDepreciationLines.assetId} = ${fixedAssets.id}
            AND ${assetDepreciationLines.status} = 'POSTED'
        ), 0)
      ), 0)::bigint AS total
      FROM ${fixedAssets}
      WHERE ${fixedAssets.orgId} = ${orgId}
        AND ${fixedAssets.status} IN ('ACTIVE', 'FULLY_DEPRECIATED')
    `);
    return BigInt(res.rows?.[0]?.total ?? "0");
  }
  const type = kind === "PIUTANG" ? "INVOICE" : "BILL";
  const res = await q.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(${invoices.totalMinor} - ${invoices.amountPaidMinor}), 0)::bigint AS total
    FROM ${invoices}
    WHERE ${invoices.orgId} = ${orgId}
      AND ${invoices.type} = ${type}
      AND ${invoices.status} <> 'VOID'
  `);
  return BigInt(res.rows?.[0]?.total ?? "0");
}

export interface ReconRow {
  kind: SubledgerKind;
  controlAccountId: string;
  controlBalanceMinor: bigint;
  subledgerTotalMinor: bigint;
  differenceMinor: bigint;
}

export async function reconcileSubledger(q: Queryable, orgId: string): Promise<ReconRow[]> {
  const controls = await getSubledgerControls(q, orgId);
  const out: ReconRow[] = [];
  for (const c of controls) {
    const kind = c.kind as SubledgerKind;
    const controlBalanceMinor = await getControlGlBalance(q, orgId, c.controlAccountId, kind);
    const subledgerTotalMinor = await subledgerTotalFor(q, orgId, kind);
    out.push({ kind, controlAccountId: c.controlAccountId, controlBalanceMinor, subledgerTotalMinor, differenceMinor: subledgerTotalMinor - controlBalanceMinor });
  }
  return out;
}

/** Catat temuan HIGH untuk tiap kind yang selisih (evidence string, bukan bigint). */
export async function reportSubledgerMismatch(q: Queryable, orgId: string, rows: ReconRow[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    if (r.differenceMinor === 0n) continue;
    await q.insert(aiFindings).values({
      orgId,
      type: "SUBLEDGER_MISMATCH",
      severity: "HIGH",
      status: "open",
      evidence: {
        kind: r.kind,
        controlAccountId: r.controlAccountId,
        controlBalanceMinor: r.controlBalanceMinor.toString(),
        subledgerTotalMinor: r.subledgerTotalMinor.toString(),
        differenceMinor: r.differenceMinor.toString(),
      },
    });
    n += 1;
  }
  return n;
}
