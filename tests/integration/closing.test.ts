import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { toMinor } from "@/server/db/repos/journals.repo";
import { closePeriod } from "@/server/db/repos/periods-closing.repo";
import { aiDrafts } from "@/server/db/schema/ai";

// Server actions memanggil revalidatePath (Next runtime) — mock agar suite
// fokus pada logika tutup-buku, bukan cache Next.
vi.mock("next/cache", () => ({ revalidatePath: (_p: string) => {} }));

// Task D5 — Tutup tahun overhaul.
//
// ADAPTASI dari sketsa brief (diverifikasi terhadap signature aktual):
// - `closeYear(orgId, year)` TIDAK ADA — helper lokal di bawah memanggil
//   `closePeriod(q, { orgId, periodName: "YYYY-12", isYearEnd: true, ... })`.
// - Kode beban `6200` TIDAK ADA di COA dasar (lihat
//   `src/core/accounts/coa-template.ts`) — substitusi ekuivalen postable:
//   `5900` Beban Lain-lain (BEBAN/D, leaf). `3300` Prive (EKUITAS/D/contra)
//   dan `3200` Laba Ditahan (EKUITAS/K) sesuai template.
// - `executePeriodCloseAction`/`reopenPeriodAction` TIDAK melempar —
//   mengembalikan `{ ok: false, error }`. Aksi dipanggil langsung dengan
//   seam `TEST_CTX_ORG` (pola `tests/integration/ai.actions.test.ts`).
// - `reverse` = `reverseEntryAction` (jalur reversal A7, idempoten).
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("tutup tahun overhaul (D5)", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();
  const decName = `${year}-12`;

  beforeEach(async () => {
    await truncateAll();
  });
  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    await admin.end();
    await truncateAll();
  });

  async function setupOrg(name: string): Promise<{ orgId: string; byCode: Map<string, string> }> {
    const { orgId } = await makeOrg(name);
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`,
      [orgId],
    );
    const byCode = new Map(rows.rows.map((r) => [r.code, r.id]));
    const need = (code: string): string => {
      const v = byCode.get(code);
      if (!v) throw new Error(`AKUN_UJI_HILANG: ${code}`);
      return v;
    };
    for (const c of ["1110", "3200", "3300", "4100", "5900"]) need(c);
    return { orgId, byCode };
  }

  async function post(
    orgId: string,
    input: { dateISO: string; memo: string; lines: Array<{ accountId: string; debitMinor: bigint; creditMinor: bigint }> },
  ) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "test@test.id", {
        dateISO: input.dateISO,
        memo: input.memo,
        source: "MANUAL",
        lines: input.lines,
      } as never),
    );
  }

  /** Total debit & kredit POSTED per akun (asli + jurnal penutup). */
  async function postedTotals(orgId: string, accountId: string): Promise<{ debit: bigint; credit: bigint }> {
    const r = await admin.query<{ d: string; c: string }>(
      `SELECT COALESCE(SUM(l.debit),0)::text AS d, COALESCE(SUM(l.credit),0)::text AS c
         FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
        WHERE l.org_id=$1 AND l.account_id=$2 AND e.status='POSTED'`,
      [orgId, accountId],
    );
    return { debit: toMinor(r.rows[0].d), credit: toMinor(r.rows[0].c) };
  }

  /** Tutup tahun kalender: Desember + jurnal penutup satu-tahap ke Laba Ditahan. */
  async function closeYear(orgId: string, retainedEarningsAccountId: string) {
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      closePeriod(tx as never, {
        orgId,
        periodName: decName,
        actorEmail: "test@test.id",
        isYearEnd: true,
        retainedEarningsAccountId,
      }),
    );
  }

  async function decPeriodId(orgId: string): Promise<string> {
    const r = await admin.query<{ id: string }>(
      `SELECT id FROM fiscal_periods WHERE org_id=$1 AND name=$2`,
      [orgId, decName],
    );
    if (!r.rows[0]) throw new Error(`PERIODE_UJI_HILANG: ${decName}`);
    return r.rows[0].id;
  }

  it("tutup menolkan beban bersaldo abnormal + prive", async () => {
    const { orgId, byCode } = await setupOrg("PT Tutup Abnormal");
    const id = (c: string): string => byCode.get(c)!;

    const REV = 100_000_000n; // Rp1.000.000 (minor)
    const ABN = 5_000_000n; // Rp50.000 kredit abnormal di beban
    const PRIVE = 10_000_000n; // Rp100.000 prive debit

    await post(orgId, {
      dateISO: `${year}-06-10`, memo: "Jasa tunai",
      lines: [
        { accountId: id("1110"), debitMinor: REV, creditMinor: 0n },
        { accountId: id("4100"), debitMinor: 0n, creditMinor: REV },
      ],
    });
    // Beban bersaldo KREDIT (abnormal), mis. retur beban dibayar tunai.
    await post(orgId, {
      dateISO: `${year}-06-11`, memo: "Koreksi beban tunai",
      lines: [
        { accountId: id("1110"), debitMinor: ABN, creditMinor: 0n },
        { accountId: id("5900"), debitMinor: 0n, creditMinor: ABN },
      ],
    });
    await post(orgId, {
      dateISO: `${year}-06-12`, memo: "Prive tunai",
      lines: [
        { accountId: id("3300"), debitMinor: PRIVE, creditMinor: 0n },
        { accountId: id("1110"), debitMinor: 0n, creditMinor: PRIVE },
      ],
    });

    const res = await closeYear(orgId, id("3200"));
    expect(res.period.status).toBe("CLOSED");
    if (!res.closingJournalId) throw new Error("JURNAL_PENUTUP_TIDAK_TERBUAT");

    const rev = await postedTotals(orgId, id("4100"));
    expect(rev.credit - rev.debit).toBe(0n);
    const exp = await postedTotals(orgId, id("5900"));
    expect(exp.debit - exp.credit).toBe(0n);
    const prive = await postedTotals(orgId, id("3300"));
    expect(prive.debit - prive.credit).toBe(0n);

    // Laba bersih = REV - (-ABN); dikurangi prive yang ikut ditutup.
    const re = await postedTotals(orgId, id("3200"));
    expect(re.credit - re.debit).toBe(REV + ABN - PRIVE);
  });

  it("closePeriod tanpa isReady ditolak server", async () => {
    const { orgId } = await setupOrg("PT Tutup Belum Siap");
    const { db } = await import("@/server/db");
    await db.insert(aiDrafts).values({
      orgId, kind: "TEXT", draft: { garis: "besar" }, model: "uji",
    });

    process.env.TEST_CTX_ORG = orgId;
    try {
      const mod = await import("@/server/actions/periods.actions");
      const res = await mod.executePeriodCloseAction({ periodName: `${year}-03` });
      expect(res.ok).toBe(false);
      if (res.ok) throw new Error("SEHARUSNYA_DITOLAK");
      expect(res.error).toContain("BELUM_SIAP");
    } finally {
      delete process.env.TEST_CTX_ORG;
    }
  });

  it("reopen Desember terkunci sampai closing direversal", async () => {
    const { orgId, byCode } = await setupOrg("PT Tutup Kunci");
    const id = (c: string): string => byCode.get(c)!;

    await post(orgId, {
      dateISO: `${year}-06-10`, memo: "Jasa tunai",
      lines: [
        { accountId: id("1110"), debitMinor: 50_000_000n, creditMinor: 0n },
        { accountId: id("4100"), debitMinor: 0n, creditMinor: 50_000_000n },
      ],
    });

    const closed = await closeYear(orgId, id("3200"));
    if (!closed.closingJournalId) throw new Error("JURNAL_PENUTUP_TIDAK_TERBUAT");
    const decId = await decPeriodId(orgId);

    process.env.TEST_CTX_ORG = orgId;
    try {
      const mod = await import("@/server/actions/periods.actions");
      const locked = await mod.reopenPeriodAction(decId);
      expect(locked.ok).toBe(false);
      if (locked.ok) throw new Error("SEHARUSNYA_TERKUNCI");
      expect(locked.error).toContain("TUTUP_BUKU_BELUM_REVERSAL");

      const jmod = await import("@/server/actions/journal.actions");
      const reversed = await jmod.reverseEntryAction(closed.closingJournalId, `${year}-11-15`);
      expect(reversed.ok).toBe(true);

      const reopened = await mod.reopenPeriodAction(decId);
      expect(reopened.ok).toBe(true);
    } finally {
      delete process.env.TEST_CTX_ORG;
    }
  });
});
