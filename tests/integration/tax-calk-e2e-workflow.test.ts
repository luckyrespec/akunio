import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { getDraft } from "@/server/db/repos/drafts.repo";
import { acceptDraftAction } from "@/server/actions/ai.actions";
import {
  saveTaxSettings,
  upsertMonthlyTaxSummary,
  getTaxSummaryByMonth,
} from "@/server/db/repos/tax.repo";
import {
  generateTaxAccrualDraftAction,
  recordTaxPaymentAction,
} from "@/server/actions/tax.actions";
import {
  aggregateCalkFinancialData,
  generateCalkNarrative,
} from "@/server/reports/calk-ai";
import { buildCalkDocx } from "@/server/reports/calk-docx";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("tax and calk end-to-end workflow", () => {
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
    orgId = (await makeOrg("Toko Berkah Mandiri")).orgId;
    process.env.TEST_CTX_ORG = orgId;
    process.env.AI_MOCK = "1";
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    delete process.env.AI_MOCK;
    await truncateAll().catch(() => {});
    await admin.end();
  });

  it("executes the full lifecycle: omzet crossing 500M -> tax calculation -> accrual draft review gate -> NTPN settlement -> CALK narrative & docx export", async () => {
    // 1. Inisialisasi pengaturan pajak: Wajib Pajak Orang Pribadi
    await saveTaxSettings(db, orgId, {
      taxpayerType: "INDIVIDUAL",
      npwp: "31.456.789.0-123.000",
      pphFinalEnabled: true,
      autoMonthlyAccrual: true,
    });

    const kasId = await getAccountId("1110");
    const bankId = await getAccountId("1120");
    const revId = await getAccountId("4100");
    const bebanPajakId = await getAccountId("5700");
    const utangPphId = await getAccountId("2300");

    // 2. Bulan 1 (Januari 2026): Omzet Rp 300.000.000 (belum lewat batas Rp 500 juta)
    await postJournalEntry(db, orgId, "owner@berkah.id", {
      dateISO: "2026-01-15",
      memo: "Penjualan Barang Dagang Januari",
      lines: [
        { accountId: kasId, debitMinor: toMinor(300_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(300_000_000) },
      ],
    });

    const sumJan = await upsertMonthlyTaxSummary(db, orgId, "2026-01");
    expect(sumJan.grossRevenueMinor).toBe(toMinor(300_000_000));
    expect(sumJan.cumulativeYearRevenueMinor).toBe(toMinor(300_000_000));
    expect(sumJan.taxableRevenueMinor).toBe(0n);
    expect(sumJan.taxDueMinor).toBe(0n); // Bebas pajak penuh

    // 3. Bulan 2 (Februari 2026): Omzet Rp 350.000.000 (Kumulatif Rp 650.000.000)
    // Melewati batas 500jt. Selisih kena pajak = Rp 150.000.000. PPh 0,5% = Rp 750.000
    await postJournalEntry(db, orgId, "owner@berkah.id", {
      dateISO: "2026-02-18",
      memo: "Penjualan Barang Dagang Februari",
      lines: [
        { accountId: bankId, debitMinor: toMinor(350_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(350_000_000) },
      ],
    });

    const draftRes = await generateTaxAccrualDraftAction({ periodMonth: "2026-02" });
    expect(draftRes.ok).toBe(true);
    expect(draftRes.draftId).toBeDefined();

    // Verifikasi Review Gate: Draf tersimpan di aiDrafts dengan status PENDING
    const draft = await getDraft(db, orgId, draftRes.draftId!);
    expect(draft?.status).toBe("PENDING");

    const sumFeb = await getTaxSummaryByMonth(db, orgId, "2026-02");
    expect(sumFeb?.status).toBe("DRAFTED");
    expect(sumFeb?.taxDueMinor).toBe(toMinor(750_000));

    // 4. User menyetujui draf akrual pajak (Review Gate Approval)
    const acceptRes = await acceptDraftAction(draftRes.draftId!, {
      dateISO: "2026-02-28",
      memo: "Akrual PPh Final PP 55/2022 Masa 2026-02",
      lines: [
        { accountId: bebanPajakId, debitText: "750.000", creditText: "" },
        { accountId: utangPphId, debitText: "", creditText: "750.000" },
      ],
    });
    expect(acceptRes.ok).toBe(true);

    // 5. User melakukan pembayaran dan mencatat bukti setor NTPN
    const ntpnCode = "NTPN202602FEBMANDIRI";
    const payRes = await recordTaxPaymentAction({
      periodMonth: "2026-02",
      ntpn: ntpnCode,
      paidAtISO: "2026-03-10",
      bankAccountId: bankId,
    });
    expect(payRes.ok).toBe(true);

    const sumFebPaid = await getTaxSummaryByMonth(db, orgId, "2026-02");
    expect(sumFebPaid?.status).toBe("PAID");
    expect(sumFebPaid?.ntpn).toBe(ntpnCode);

    // 6. Agregasi data & narasi CALK SAK EMKM Bab 6 & Bab 15
    const finData = await aggregateCalkFinancialData(db, orgId, "2026-02-28");
    expect(finData.totalRevenueMinor).toBe(toMinor(650_000_000));
    expect(finData.totalGrossRevenueMinor).toBe(toMinor(650_000_000));
    expect(finData.taxDueMinor).toBe(toMinor(750_000));
    expect(finData.taxPaidMinor).toBe(toMinor(750_000));
    expect(finData.ntpnList).toContain(ntpnCode);

    const narrative = await generateCalkNarrative(db, orgId, "2026-02-28");
    expect(narrative.generalInfo).toContain("Toko Berkah Mandiri");
    expect(narrative.accountingBasis).toContain("SAK EMKM");
    expect(narrative.incomeTaxNote).toContain("PP No. 55 Tahun 2022");
    expect(narrative.incomeTaxNote).toContain(ntpnCode);
    expect(narrative.incomeTaxNote).toContain("tidak mengakui aset atau liabilitas pajak tangguhan");

    // Verifikasi Caching Narasi: pemanggilan kedua tanpa forceRefresh mengambil dari cache
    const cachedNarrative = await generateCalkNarrative(db, orgId, "2026-02-28");
    expect(cachedNarrative.generalInfo).toBe(narrative.generalInfo);

    // Pemanggilan dengan forceRefresh: true berhasil memperbarui cache
    const refreshedNarrative = await generateCalkNarrative(db, orgId, "2026-02-28", { forceRefresh: true });
    expect(refreshedNarrative.generalInfo).toBeDefined();

    // 7. Ekspor dokumen Word (.docx)
    const docxBuffer = await buildCalkDocx({
      ...finData,
      narrative,
    });
    expect(docxBuffer).toBeDefined();
    expect(docxBuffer.length).toBeGreaterThan(1000);
    expect(docxBuffer[0]).toBe(0x50); // 'P'
    expect(docxBuffer[1]).toBe(0x4b); // 'K'
  });
});
