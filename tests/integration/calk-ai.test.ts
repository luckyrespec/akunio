import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { saveTaxSettings, upsertMonthlyTaxSummary, settleTaxPayment } from "@/server/db/repos/tax.repo";
import {
  aggregateCalkFinancialData,
  generateCalkNarrative,
  buildDeterministicCalkMock,
} from "@/server/reports/calk-ai";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("calk-ai integration tests", () => {
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
    orgId = (await makeOrg("CV Mitra Abadi")).orgId;
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

  it("aggregates financial data and generates compliant CALK narrative for Corporate taxpayer", async () => {
    // 1. Setup Tax Settings sebagai Badan Usaha
    await saveTaxSettings(db, orgId, {
      taxpayerType: "CORPORATE",
      npwp: "01.234.567.8-901.000",
    });

    const kasId = await getAccountId("1110");
    const bankId = await getAccountId("1120");
    const revId = await getAccountId("4100");
    const cogsId = await getAccountId("5100");

    // 2. Post transaksi penjualan & beban
    await postJournalEntry(db, orgId, "owner@test.id", {
      dateISO: "2026-03-15",
      memo: "Penjualan produk ritel Maret",
      lines: [
        { accountId: bankId, debitMinor: toMinor(200_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(200_000_000) },
      ],
    });

    await postJournalEntry(db, orgId, "owner@test.id", {
      dateISO: "2026-03-20",
      memo: "Harga Pokok Penjualan",
      lines: [
        { accountId: cogsId, debitMinor: toMinor(120_000_000), creditMinor: 0n },
        { accountId: kasId, debitMinor: 0n, creditMinor: toMinor(120_000_000) },
      ],
    });

    // 3. Upsert tax summary dan pelunasan dengan NTPN
    await upsertMonthlyTaxSummary(db, orgId, "2026-03");
    await settleTaxPayment(db, orgId, {
      periodMonth: "2026-03",
      ntpn: "NTPN9876543210ABCDEF",
      paidAtISO: "2026-04-10",
      bankAccountId: bankId,
      actorEmail: "owner@test.id",
    });

    // 4. Agregasi data CALK
    const finData = await aggregateCalkFinancialData(db, orgId, "2026-03-31");
    expect(finData.entityName).toBeDefined();
    expect(finData.taxpayerType).toBe("CORPORATE");
    expect(finData.totalRevenueMinor).toBe(toMinor(200_000_000));
    expect(finData.grossProfitMinor).toBe(toMinor(80_000_000));
    expect(finData.taxDueMinor).toBe(toMinor(1_000_000)); // 0.5% dari 200jt
    expect(finData.taxPaidMinor).toBe(toMinor(1_000_000));
    expect(finData.ntpnList).toContain("NTPN9876543210ABCDEF");

    // 5. Generate CALK Narrative
    const narrative = await generateCalkNarrative(db, orgId, "2026-03-31");

    // Bab 1 & 2
    expect(narrative.generalInfo).toContain(finData.entityName);
    expect(narrative.accountingBasis).toContain("SAK EMKM");
    expect(narrative.accountingBasis).toContain("biaya historis");

    // Bab 3: Kebijakan
    expect(narrative.policies.cash).toBeDefined();
    expect(narrative.policies.receivables).toBeDefined();
    expect(narrative.policies.inventory).toBeDefined();
    expect(narrative.policies.fixedAssets).toBeDefined();
    expect(narrative.policies.revenueExpense).toBeDefined();

    // Bab 4: Catatan pos neraca
    expect(narrative.accountNotes.cashAndBank).toBeDefined();
    expect(narrative.accountNotes.fixedAssets).toBeDefined();
    expect(narrative.accountNotes.liabilities).toBeDefined();

    // Bab 15: Catatan Pajak Penghasilan SAK EMKM
    expect(narrative.incomeTaxNote).toContain("PP No. 55 Tahun 2022");
    expect(narrative.incomeTaxNote).toContain("NTPN9876543210ABCDEF");
    expect(narrative.incomeTaxNote).toContain("tidak mengakui aset atau liabilitas pajak tangguhan");
    expect(narrative.incomeTaxNote).toContain("Rp1.000.000");
  });

  it("generates compliant CALK narrative for Individual taxpayer with 500M threshold", async () => {
    await saveTaxSettings(db, orgId, {
      taxpayerType: "INDIVIDUAL",
    });

    const finData = await aggregateCalkFinancialData(db, orgId, "2026-03-31");
    expect(finData.taxpayerType).toBe("INDIVIDUAL");

    const mockNarrative = buildDeterministicCalkMock(finData);
    expect(mockNarrative.incomeTaxNote).toContain("Rp 500.000.000,00");
    expect(mockNarrative.incomeTaxNote).toContain("Wajib Pajak Orang Pribadi");
  });
});
