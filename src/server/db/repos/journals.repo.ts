import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { journalEntries, journalLines } from "../schema/journal";
import { accounts } from "../schema/org";
import { documents, journalDocuments } from "../schema/ai";
import type { Queryable } from "./queryable";
import { findPeriodByDate } from "./periods.repo";
import { postingMetaMap } from "./accounts.repo";
import { isRagTenantIndexingEnabled } from "@/server/ai/rag-worker";
import {
  validateEntry, checkPostingAccounts, journalNumber,
} from "@/core/journals/validate";
import type { JournalEntryInput } from "@/core/journals/types";
import { validateSubledgerControl, moduleLabelForKind } from "@/core/subledger/guard";
import { getControlKindByAccount, insertSubledgerLinks, listLinksForEntry } from "./subledger.repo";
import type { SubledgerKind } from "../schema/subledger";

export class PostingError extends Error {
  constructor(readonly issues: Array<Record<string, unknown>>) {
    super(`VALIDASI_GAGAL: ${issues.map((i) => String(i.code ?? "?")).join(",")}`);
  }
}

async function assertSubledgerControl(
  q: Queryable,
  orgId: string,
  input: JournalEntryInput,
  orgAccounts: Array<{ id: string; code: string }>,
): Promise<void> {
  const controlByAccountId = await getControlKindByAccount(q, orgId);
  const issues = validateSubledgerControl({
    lines: input.lines.map((l) => ({
      accountId: l.accountId,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      links: l.subledgerLinks,
    })),
    controlByAccountId,
    source: input.source ?? "MANUAL",
    isOpeningBalance: input.isOpeningBalance,
    isLegacyReversal: input.isLegacyReversal,
  });
  if (issues.length === 0) return;
  const first = issues[0];
  const code = orgAccounts.find((a) => a.id === input.lines[first.index].accountId)?.code ?? "?";
  if (first.code === "AKUN_KONTROL_WAJIB_VIA_MODUL") {
    throw new Error(`AKUN_KONTROL_WAJIB_VIA_MODUL: akun ${code} hanya boleh dimutasi via ${moduleLabelForKind(first.kind)}, bukan jurnal manual`);
  }
  if (first.code === "SUBLEDGER_REF_WAJIB") {
    throw new Error(`SUBLEDGER_REF_WAJIB: baris ${code} wajib membawa rincian ${first.kind}`);
  }
  if (first.code === "SUBLEDGER_KIND_TIDAK_COCOK") {
    throw new Error(`SUBLEDGER_KIND_TIDAK_COCOK: baris ${code} mengharapkan ${first.expected}, dapat ${first.actual}`);
  }
  throw new Error(`SUBLEDGER_TOTAL_TIDAK_COCok: total rincian tidak sama dengan nominal baris ${code}`);
}

async function persistSubledgerLinks(
  q: Queryable,
  orgId: string,
  lineIdsByPosition: Map<number, string>,
  input: JournalEntryInput,
): Promise<void> {
  const rows: Array<{ journalLineId: string; kind: SubledgerKind; refId: string; amountMinor: bigint; qty?: number }> = [];
  input.lines.forEach((l, i) => {
    for (const link of l.subledgerLinks ?? []) {
      rows.push({ journalLineId: lineIdsByPosition.get(i)!, kind: link.kind, refId: link.refId, amountMinor: link.amountMinor, qty: link.qty });
    }
  });
  await insertSubledgerLinks(q, orgId, rows);
}

// numeric(18,2) text form from minor units — no float math.
export function dec(minor: bigint): string {
  const neg = minor < 0n;
  const v = neg ? -minor : minor;
  return `${neg ? "-" : ""}${v / 100n}.${String(v % 100n).padStart(2, "0")}`;
}

export function toMinor(numericStr: string): bigint {
  const neg = numericStr.startsWith("-");
  const s = neg ? numericStr.slice(1) : numericStr;
  const [w, f = ""] = s.split(".");
  const v = BigInt(w) * 100n + BigInt(f.padEnd(2, "0").slice(0, 2));
  return neg ? -v : v;
}

// Penomoran JE-YYYY-NNNN year-scoped per org; dipakai postJournalEntry +
// createDraftJournalEntry agar kedua jalur berbagi satu sumber penomoran.
export async function nextJournalNumber(
  q: Queryable,
  orgId: string,
  period: { id: string; name: string },
): Promise<{ seq: number; number: string }> {
  // Numbers are year-scoped (JE-YYYY-NNNN unique per org) while counters are
  // stored per period; the xact lock makes the cross-period read-modify-write
  // atomic against other postings in the same org-year.
  const year = period.name.slice(0, 4);
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:${year}`}))`);
  const counterRes = await q.execute(sql`
    INSERT INTO journal_seq_counters (org_id, period_id, last)
    VALUES (${orgId}, ${period.id}, 1)
    ON CONFLICT (org_id, period_id)
    DO UPDATE SET last = journal_seq_counters.last + 1
    RETURNING last
  `);
  const periodSeq = Number((counterRes.rows?.[0] as { last: number } | undefined)?.last ?? 1);
  const baseRes = await q.execute<{ base: number }>(sql`
    SELECT COALESCE(SUM(c.last), 0)::int AS base
    FROM journal_seq_counters c
    JOIN fiscal_periods p ON p.id = c.period_id
    WHERE c.org_id = ${orgId} AND left(p.name, 4) = ${year} AND c.period_id <> ${period.id}
  `);
  const seq = periodSeq + Number(baseRes.rows?.[0]?.base ?? 0);
  return { seq, number: journalNumber(period.name, seq) };
}

export interface LineView {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo: string | null;
}

export interface EntryView {
  id: string;
  number: string;
  entryDate: string;
  memo: string;
  status: string;
  reversalOfId: string | null;
  lines: LineView[];
}

async function assemble(
  q: Queryable,
  where: SQL | undefined,
  limit?: number,
  offset?: number,
): Promise<EntryView[]> {
  let query = q.select().from(journalEntries).where(where).$dynamic();
  if (offset) query = query.offset(offset);
  if (limit) query = query.limit(limit);
  const entries = await query.orderBy(desc(journalEntries.entryDate), desc(journalEntries.seq));
  if (entries.length === 0) return [];
  const lineRows = await q.select({
    id: journalLines.id,
    entryId: journalLines.entryId,
    accountId: journalLines.accountId,
    position: journalLines.position,
    debit: journalLines.debit,
    credit: journalLines.credit,
    memo: journalLines.memo,
    accountCode: accounts.code,
    accountName: accounts.name,
  })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(inArray(journalLines.entryId, entries.map((e) => e.id)))
    .orderBy(asc(journalLines.position));

  const byEntry = new Map<string, EntryView>();
  for (const e of entries) {
    byEntry.set(e.id, {
      id: e.id, number: e.number, entryDate: e.entryDate, memo: e.memo,
      status: e.status, reversalOfId: e.reversalOfId, lines: [],
    });
  }
  for (const l of lineRows) {
    byEntry.get(l.entryId)!.lines.push({
      id: l.id, accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName,
      debitMinor: toMinor(l.debit), creditMinor: toMinor(l.credit), memo: l.memo,
    });
  }
  return [...byEntry.values()];
}

export async function listEntriesWithLines(
  q: Queryable, orgId: string, limit = 50, offset = 0,
): Promise<EntryView[]> {
  return assemble(q, eq(journalEntries.orgId, orgId), limit, offset);
}

export interface EntryListFilter {
  dateFrom?: string;
  dateTo?: string;
  /** Kode akun COA persis (mis. "5-1010"): hanya entri yang menyentuh akun ini. */
  accountCode?: string;
  status?: "DRAFT" | "POSTED";
}

/** listEntriesWithLines + filter tanggal/akun/status untuk tool AI agregasi. */
export async function listEntriesWithLinesFiltered(
  q: Queryable, orgId: string, filter: EntryListFilter = {}, limit = 50, offset = 0,
): Promise<EntryView[]> {
  if (filter.accountCode) {
    const ids = await q
      .selectDistinct({ entryId: journalLines.entryId })
      .from(journalLines)
      .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(eq(journalEntries.orgId, orgId), eq(accounts.code, filter.accountCode)));
    if (ids.length === 0) return [];
    return assemble(
      q,
      and(
        eq(journalEntries.orgId, orgId),
        inArray(journalEntries.id, ids.map((r) => r.entryId)),
        ...(filter.dateFrom ? [gte(journalEntries.entryDate, filter.dateFrom)] : []),
        ...(filter.dateTo ? [lte(journalEntries.entryDate, filter.dateTo)] : []),
        ...(filter.status ? [eq(journalEntries.status, filter.status)] : []),
      ),
      limit,
      offset,
    );
  }
  return assemble(
    q,
    and(
      eq(journalEntries.orgId, orgId),
      ...(filter.dateFrom ? [gte(journalEntries.entryDate, filter.dateFrom)] : []),
      ...(filter.dateTo ? [lte(journalEntries.entryDate, filter.dateTo)] : []),
      ...(filter.status ? [eq(journalEntries.status, filter.status)] : []),
    ),
    limit,
    offset,
  );
}

export async function countEntries(q: Queryable, orgId: string): Promise<number> {
  const [row] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(eq(journalEntries.orgId, orgId));
  return row?.n ?? 0;
}

function entrySearchWhere(orgId: string, lineEntryIds: string[], term: string): SQL {
  const like = `%${term}%`;
  return and(
    eq(journalEntries.orgId, orgId),
    or(
      ilike(journalEntries.number, like),
      ilike(journalEntries.memo, like),
      ...(lineEntryIds.length > 0 ? [inArray(journalEntries.id, lineEntryIds)] : []),
    ),
  ) as SQL;
}

async function findLineEntryIds(q: Queryable, orgId: string, term: string): Promise<string[]> {
  const like = `%${term}%`;
  const rows = await q
    .selectDistinct({ entryId: journalLines.entryId })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        or(ilike(accounts.code, like), ilike(accounts.name, like)),
      ),
    );
  return rows.map((r) => r.entryId);
}

export async function searchEntriesWithLines(
  q: Queryable, orgId: string, term: string, limit = 25, offset = 0,
): Promise<EntryView[]> {
  const ids = await findLineEntryIds(q, orgId, term);
  return assemble(q, entrySearchWhere(orgId, ids, term), limit, offset);
}

export async function countSearchEntries(
  q: Queryable, orgId: string, term: string,
): Promise<number> {
  const ids = await findLineEntryIds(q, orgId, term);
  const [row] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(entrySearchWhere(orgId, ids, term));
  return row?.n ?? 0;
}

/** Cari entri berdasar nominal total (debit = kredit = amount). */
export async function searchEntriesByAmount(
  q: Queryable, orgId: string, amountMinor: bigint, limit = 10,
): Promise<EntryView[]> {
  const rows = await q
    .select({ entryId: journalLines.entryId })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(eq(journalEntries.orgId, orgId))
    .groupBy(journalLines.entryId)
    .having(sql`SUM(${journalLines.debit}) = ${dec(amountMinor)}::numeric`)
    .limit(limit);
  if (rows.length === 0) return [];
  return assemble(
    q,
    and(eq(journalEntries.orgId, orgId), inArray(journalEntries.id, rows.map((r) => r.entryId))),
    limit,
  );
}

export async function getPostedEntry(
  q: Queryable, orgId: string, entryId: string,
): Promise<EntryView | null> {
  const rows = await assemble(q, and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)));
  const entry = rows[0] ?? null;
  if (entry && entry.status !== "POSTED") throw new Error("BUKAN_JURNAL_POSTED");
  return entry;
}

/** Ambil satu entri beserta barisnya tanpa memandang status (untuk panel terkait temuan). */
export async function getEntryWithLines(
  q: Queryable, orgId: string, entryId: string,
): Promise<EntryView | null> {
  const rows = await assemble(q, and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)));
  return rows[0] ?? null;
}

export interface EntryDocument {
  id: string;
  fileName: string | null;
  mime: string;
  sizeBytes: number;
  createdAt: Date;
}

export async function linkDocumentToEntry(
  q: Queryable,
  input: { orgId: string; entryId: string; documentId: string; fileName?: string },
): Promise<void> {
  const [doc] = await q.select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.orgId, input.orgId), eq(documents.id, input.documentId)))
    .limit(1);
  if (!doc) throw new Error("DOKUMEN_TIDAK_DITEMUKAN");
  const [entry] = await q.select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, input.orgId), eq(journalEntries.id, input.entryId)))
    .limit(1);
  if (!entry) throw new Error("JURNAL_TIDAK_DITEMUKAN");
  await q.insert(journalDocuments).values({
    orgId: input.orgId,
    entryId: input.entryId,
    documentId: input.documentId,
    fileName: input.fileName ?? null,
  }).onConflictDoNothing();
}

export async function listEntryDocuments(
  q: Queryable, orgId: string, entryId: string,
): Promise<EntryDocument[]> {
  const rows = await q.select({
    id: documents.id,
    fileName: journalDocuments.fileName,
    mime: documents.mime,
    sizeBytes: documents.sizeBytes,
    createdAt: journalDocuments.createdAt,
  })
    .from(journalDocuments)
    .innerJoin(documents, eq(documents.id, journalDocuments.documentId))
    .where(and(eq(journalDocuments.orgId, orgId), eq(journalDocuments.entryId, entryId)))
    .orderBy(asc(journalDocuments.createdAt));
  return rows;
}

/** Jurnal pembalik yang menunjuk ke entri ini (biasanya 0–1 baris). */
export async function findReversalEntries(
  q: Queryable, orgId: string, entryId: string,
): Promise<Array<{ id: string; number: string; entryDate: string }>> {
  return q.select({
    id: journalEntries.id,
    number: journalEntries.number,
    entryDate: journalEntries.entryDate,
  })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.reversalOfId, entryId)))
    .orderBy(desc(journalEntries.entryDate));
}

export interface PostResult { id: string; number: string }

/** Cari jurnal existing berdasar kunci idempotency (kontrak: key sama → record sama). */
export async function findEntryByIdempotencyKey(
  q: Queryable, orgId: string, key: string,
): Promise<PostResult | null> {
  const [dupe] = await q.select({ id: journalEntries.id, number: journalEntries.number })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.idempotencyKey, key)))
    .limit(1);
  return dupe ?? null;
}

/** True bila error adalah pelanggaran unik je_org_idem_uq (jendela race double-submit). */
function isIdemConflict(e: unknown): boolean {
  const pg = e as { code?: unknown; constraint?: unknown } | null;
  if (!pg || typeof pg !== "object" || pg.code !== "23505") return false;
  if (pg.constraint === "je_org_idem_uq") return true;
  return e instanceof Error && e.message.includes("je_org_idem_uq");
}

export async function postJournalEntry(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  input: JournalEntryInput,
  opts: { reversalOfId?: string } = {},
): Promise<PostResult> {
  if (input.idempotencyKey) {
    // Serikan double-submit konkuren per org+key: yang kalah menunggu lock,
    // lalu pre-check di bawah melihat baris pemenang yang sudah komit.
    await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:idem:${input.idempotencyKey}`}))`);
    const dupe = await findEntryByIdempotencyKey(q, orgId, input.idempotencyKey);
    if (dupe) return dupe;
  }

  const period = await findPeriodByDate(q, orgId, input.dateISO);
  if (!period) throw new PostingError([{ code: "PERIODE_TIDAK_DITEMUKAN" }]);

  const issues = validateEntry(input, period.status);
  if (issues.length > 0) throw new PostingError(issues);

  const orgAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const acctIssues = checkPostingAccounts(input.lines, postingMetaMap(orgAccounts));
  if (acctIssues.length > 0) throw new PostingError(acctIssues);

  // Reversal atas entri warisan (tanpa links subledger) diizinkan menyentuh
  // akun kontrol — neto nol terhadap aslinya. Reversal jurnal modul tetap wajib via modul.
  let legacyReversal = false;
  if (opts.reversalOfId) {
    const origLinks = await listLinksForEntry(q, orgId, opts.reversalOfId);
    legacyReversal = !origLinks.some((r) => r.linkId);
  }
  await assertSubledgerControl(q, orgId, { ...input, isLegacyReversal: legacyReversal }, orgAccounts);

  const { seq, number } = await nextJournalNumber(q, orgId, period);

  let entry: { id: string };
  try {
    [entry] = await q.insert(journalEntries).values({
      orgId,
      periodId: period.id,
      seq,
      number,
      entryDate: input.dateISO,
      memo: input.memo,
      source: input.source ?? "MANUAL",
      status: "DRAFT",
      reversalOfId: opts.reversalOfId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    }).returning({ id: journalEntries.id });
  } catch (e) {
    // Jendela race sisa (key ditulis jalur lain tanpa lock): kembalikan
    // record existing, bukan error mentah. Di dalam transaksi yang sudah
    // abort, SELECT ikut gagal — jatuhkan error asli bila begitu.
    if (input.idempotencyKey && isIdemConflict(e)) {
      try {
        const existing = await findEntryByIdempotencyKey(q, orgId, input.idempotencyKey);
        if (existing) return existing;
      } catch {}
    }
    throw e;
  }

  const insertedLines = await q.insert(journalLines).values(input.lines.map((l, i) => ({
    orgId,
    entryId: entry.id,
    accountId: l.accountId,
    position: i,
    debit: dec(l.debitMinor),
    credit: dec(l.creditMinor),
    memo: l.memo ?? null,
  }))).returning({ id: journalLines.id, position: journalLines.position });
  await persistSubledgerLinks(q, orgId, new Map(insertedLines.map((r) => [r.position, r.id])), input);

  await q.update(journalEntries)
    .set({ status: "POSTED", postedAt: new Date(), postedBy: actorEmail })
    .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.status, "DRAFT")));

  // Enqueue for RAG indexing (real-time, best-effort, kill-switch via env)
  if (isRagTenantIndexingEnabled()) {
    try {
      await q.execute(sql`INSERT INTO rag_queue (org_id, kind, ref_id) VALUES (${orgId}, 'JOURNAL', ${entry.id})`);
    } catch {}
  }

  // Enqueue for Doctor scan (best-effort, never blocks posting)
  try {
    const { enqueueDoctorScan } = await import("@/server/ai/doctor-queue");
    await enqueueDoctorScan(orgId, entry.id);
  } catch {}

  return { id: entry.id, number };
}

export async function createDraftJournalEntry(
  q: Queryable,
  orgId: string,
  input: JournalEntryInput,
  opts: { reversalOfId?: string } = {},
): Promise<PostResult> {
  if (input.idempotencyKey) {
    await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${orgId}:idem:${input.idempotencyKey}`}))`);
    const dupe = await findEntryByIdempotencyKey(q, orgId, input.idempotencyKey);
    if (dupe) return dupe;
  }

  const period = await findPeriodByDate(q, orgId, input.dateISO);
  if (!period) throw new PostingError([{ code: "PERIODE_TIDAK_DITEMUKAN" }]);

  const issues = validateEntry(input, period.status);
  if (issues.length > 0) throw new PostingError(issues);

  const orgAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const acctIssues = checkPostingAccounts(input.lines, postingMetaMap(orgAccounts));
  if (acctIssues.length > 0) throw new PostingError(acctIssues);

  await assertSubledgerControl(q, orgId, input, orgAccounts);

  const { seq, number } = await nextJournalNumber(q, orgId, period);

  let entry: { id: string };
  try {
    [entry] = await q.insert(journalEntries).values({
      orgId,
      periodId: period.id,
      seq,
      number,
      entryDate: input.dateISO,
      memo: input.memo,
      source: input.source ?? "MANUAL",
      status: "DRAFT",
      reversalOfId: opts.reversalOfId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    }).returning({ id: journalEntries.id });
  } catch (e) {
    if (input.idempotencyKey && isIdemConflict(e)) {
      try {
        const existing = await findEntryByIdempotencyKey(q, orgId, input.idempotencyKey);
        if (existing) return existing;
      } catch {}
    }
    throw e;
  }

  const insertedDraftLines = await q.insert(journalLines).values(input.lines.map((l, i) => ({
    orgId,
    entryId: entry.id,
    accountId: l.accountId,
    position: i,
    debit: dec(l.debitMinor),
    credit: dec(l.creditMinor),
    memo: l.memo ?? null,
  }))).returning({ id: journalLines.id, position: journalLines.position });
  await persistSubledgerLinks(q, orgId, new Map(insertedDraftLines.map((r) => [r.position, r.id])), input);

  return { id: entry.id, number };
}

/** Posting jurnal DRAFT yang sudah ada (dipakai modul kas-bank untuk draft). */
export async function postDraftEntry(
  q: Queryable,
  orgId: string,
  actorEmail: string,
  entryId: string,
): Promise<PostResult> {
  const [entry] = await q.select().from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.id, entryId)))
    .limit(1);
  if (!entry) throw new PostingError([{ code: "JURNAL_TIDAK_DITEMUKAN" }]);
  if (entry.status === "POSTED") return { id: entry.id, number: entry.number };
  const period = await findPeriodByDate(q, orgId, entry.entryDate);
  if (!period || period.status !== "OPEN") throw new PostingError([{ code: "PERIODE_TUTUP" }]);
  const draftLineRows = await q.select().from(journalLines)
    .where(eq(journalLines.entryId, entry.id))
    .orderBy(asc(journalLines.position));
  const draftLinkRows = await listLinksForEntry(q, orgId, entry.id);
  const draftLinksByLine = new Map<string, Array<{ kind: "PIUTANG" | "UTANG" | "PERSEDIAAN"; refId: string; amountMinor: bigint }>>();
  for (const r of draftLinkRows) {
    if (!r.linkId) continue;
    const arr = draftLinksByLine.get(r.lineId) ?? [];
    arr.push({ kind: r.kind as "PIUTANG" | "UTANG" | "PERSEDIAAN", refId: r.refId!, amountMinor: r.amountMinor! });
    draftLinksByLine.set(r.lineId, arr);
  }
  const draftOrgAccounts = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  // Draf divalidasi ulang penuh saat posting: isinya bisa berubah sejak
  // pembuatan (draf editable) atau akunnya diarsip setelah draf dibuat.
  const draftInput: JournalEntryInput = {
    dateISO: entry.entryDate,
    memo: entry.memo,
    source: (entry.source ?? "MANUAL") as JournalEntryInput["source"],
    lines: draftLineRows.map((l) => ({
      accountId: l.accountId,
      debitMinor: toMinor(l.debit),
      creditMinor: toMinor(l.credit),
      subledgerLinks: draftLinksByLine.get(l.id) ?? [],
    })),
  };
  const draftIssues = validateEntry(draftInput, period.status);
  if (draftIssues.length > 0) throw new PostingError(draftIssues);
  const draftAcctIssues = checkPostingAccounts(draftInput.lines, postingMetaMap(draftOrgAccounts));
  if (draftAcctIssues.length > 0) throw new PostingError(draftAcctIssues);
  await assertSubledgerControl(q, orgId, draftInput, draftOrgAccounts);
  const [updated] = await q.update(journalEntries)
    .set({ status: "POSTED", postedAt: new Date(), postedBy: actorEmail })
    .where(and(eq(journalEntries.id, entry.id), eq(journalEntries.status, "DRAFT")))
    .returning({ id: journalEntries.id, number: journalEntries.number });
  if (!updated) throw new PostingError([{ code: "GAGAL_POSTING" }]);
  return updated;
}

