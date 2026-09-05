import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { getDraft } from "@/server/db/repos/drafts.repo";
import { acceptDraftAction } from "@/server/actions/ai.actions";
import {
  generateTaxAccrualDraftAction,
  recordTaxPaymentAction,
  updateTaxSettingsAction,
} from "@/server/actions/tax.actions";
import { getTaxSummaryByMonth, getTaxSettings } from "@/server/db/repos/tax.repo";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("tax.actions integration tests", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgId: string;
  const toMinor = (rp: number) => BigInt(rp) * 100n;

  async function getAccountId(code: string): Promise<string> {
    const r = await admin.query<{ id: string }>(
      `SELECT id FROM accounts WHERE org_id=$1 AND code=$2`,
      [orgId, code]
    );
    if (r.rows.length === 0) throw new Error(`COA ${code} tidak ditemukan`);
    return r.rows[0].id;
  }

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("Klinik Sehat")).orgId;
    process.env.TEST_CTX_ORG = orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    await truncateAll().catch(() => {});
    await admin.end();
  });

  it("updates tax settings via action", async () => {
    const res = await updateTaxSettingsAction({
      taxpayerType: "INDIVIDUAL",
      npwp: "1234567890123456",
      autoMonthlyAccrual: true,
      ppnEnabled: true,
      ppnRatePercent: 12,
    });
    expect(res.ok).toBe(true);

    const s = await getTaxSettings(db, orgId);
    expect(s.npwp).toBe("1234567890123456");
    expect(s.ppnEnabled).toBe(true);
  });

  it("generates tax accrual draft and enforces review gate before posting", async () => {
    const kasId = await getAccountId("1110");
    const revId = await getAccountId("4100");

    // Post pendapatan Januari 2026: Rp 600.000.000 (langsung tembus 500jt)
    await postJournalEntry(db, orgId, "test@test.id", {
      dateISO: "2026-01-20",
      memo: "Penerimaan layanan kesehatan Januari",
      lines: [
        { accountId: kasId, debitMinor: toMinor(600_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(600_000_000) },
      ],
    });

    // PPh 0,5% dari 100jt (600jt - 500jt) = Rp 500.000
    const draftRes = await generateTaxAccrualDraftAction({ periodMonth: "2026-01" });
    expect(draftRes.ok).toBe(true);
    expect(draftRes.draftId).toBeDefined();

    // Verifikasi draf tersimpan di aiDrafts dengan status PENDING
    const draft = await getDraft(db, orgId, draftRes.draftId!);
    expect(draft).not.toBeNull();
    expect(draft?.status).toBe("PENDING");

    // Verifikasi tax_summaries berstatus DRAFTED
    const summary = await getTaxSummaryByMonth(db, orgId, "2026-01");
    expect(summary?.status).toBe("DRAFTED");
    expect(summary?.accrualDraftId).toBe(draftRes.draftId);
    expect(summary?.taxDueMinor).toBe(toMinor(500_000));

    // Pengguna me-review dan menyetujui draf melalui acceptDraftAction
    const raw = draft!.draft as {
      dateISO: string;
      memo: string;
      lines: Array<{ accountCode: string; debitText: string; creditText: string }>;
      mapping?: { lines: Array<{ accountId: string | null }> };
    };

    const bebanPajakId = await getAccountId("5700");
    const utangPphId = await getAccountId("2300");

    const acceptRes = await acceptDraftAction(draftRes.draftId!, {
      dateISO: raw.dateISO,
      memo: raw.memo,
      lines: [
        { accountId: bebanPajakId, debitText: "500.000", creditText: "" },
        { accountId: utangPphId, debitText: "", creditText: "500.000" },
      ],
    });
    expect(acceptRes.ok).toBe(true);
    expect(acceptRes.number).toBeDefined();

    // Jurnal berhasil diposting
    const updatedDraft = await getDraft(db, orgId, draftRes.draftId!);
    expect(updatedDraft?.status).toBe("ACCEPTED");
    expect(updatedDraft?.postedEntryId).toBeDefined();
  });

  it("records payment with NTPN and marks summary PAID", async () => {
    const bankId = await getAccountId("1120");

    const payRes = await recordTaxPaymentAction({
      periodMonth: "2026-01",
      ntpn: "NTPN1234567890ABCDEF",
      paidAtISO: "2026-02-10",
      bankAccountId: bankId,
    });

    expect(payRes.ok).toBe(true);
    expect(payRes.paymentEntryId).toBeDefined();

    const sum = await getTaxSummaryByMonth(db, orgId, "2026-01");
    expect(sum?.status).toBe("PAID");
    expect(sum?.ntpn).toBe("NTPN1234567890ABCDEF");
  });
});
