import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import {
  getTaxSettings,
  saveTaxSettings,
  getMonthlyGrossRevenue,
  upsertMonthlyTaxSummary,
  getTaxSummariesByYear,
  settleTaxPayment,
} from "@/server/db/repos/tax.repo";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("tax.repo integration tests", () => {
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
    orgId = (await makeOrg("Bengkel Barokah")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll().catch(() => {});
    await admin.end();
  });

  it("reads default tax settings and updates them", async () => {
    const defaults = await getTaxSettings(db, orgId);
    expect(defaults.taxpayerType).toBe("INDIVIDUAL");
    expect(defaults.pphFinalEnabled).toBe(true);

    await saveTaxSettings(db, orgId, {
      taxpayerType: "CORPORATE",
      npwp: "01.234.567.8-901.000",
    });

    const updated = await getTaxSettings(db, orgId);
    expect(updated.taxpayerType).toBe("CORPORATE");
    expect(updated.npwp).toBe("01.234.567.8-901.000");

    // Reset to INDIVIDUAL for subsequent tests
    await saveTaxSettings(db, orgId, { taxpayerType: "INDIVIDUAL" });
  });

  it("aggregates monthly revenue from posted sales entries", async () => {
    const kasId = await getAccountId("1110");
    const revId = await getAccountId("4100");

    // Post Penjualan Januari 2026: Rp 100.000.000
    await postJournalEntry(db, orgId, "owner@barokah.com", {
      dateISO: "2026-01-15",
      memo: "Penjualan servis dan suku cadang Jan",
      lines: [
        { accountId: kasId, debitMinor: toMinor(100_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(100_000_000) },
      ],
    });

    // Post Penjualan Februari 2026: Rp 150.000.000
    await postJournalEntry(db, orgId, "owner@barokah.com", {
      dateISO: "2026-02-20",
      memo: "Penjualan servis Feb",
      lines: [
        { accountId: kasId, debitMinor: toMinor(150_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(150_000_000) },
      ],
    });

    const revMap = await getMonthlyGrossRevenue(db, orgId, 2026);
    expect(revMap.get("2026-01")).toBe(toMinor(100_000_000));
    expect(revMap.get("2026-02")).toBe(toMinor(150_000_000));
    expect(revMap.get("2026-03") ?? 0n).toBe(0n);
  });

  it("upserts monthly tax summary with accurate cumulative revenue & threshold", async () => {
    // Januari: 100jt (kumulatif 100jt <= 500jt) -> pajak 0
    const sumJan = await upsertMonthlyTaxSummary(db, orgId, "2026-01");
    expect(sumJan.periodMonth).toBe("2026-01");
    expect(sumJan.grossRevenueMinor).toBe(toMinor(100_000_000));
    expect(sumJan.cumulativeYearRevenueMinor).toBe(toMinor(100_000_000));
    expect(sumJan.taxableRevenueMinor).toBe(0n);
    expect(sumJan.taxDueMinor).toBe(0n);

    // Februari: 150jt (kumulatif 250jt <= 500jt) -> pajak 0
    const sumFeb = await upsertMonthlyTaxSummary(db, orgId, "2026-02");
    expect(sumFeb.grossRevenueMinor).toBe(toMinor(150_000_000));
    expect(sumFeb.cumulativeYearRevenueMinor).toBe(toMinor(250_000_000));
    expect(sumFeb.taxDueMinor).toBe(0n);

    // Tambah penjualan Maret: Rp 350.000.000 -> total kumulatif 600jt (> 500jt)
    const kasId = await getAccountId("1110");
    const revId = await getAccountId("4100");
    await postJournalEntry(db, orgId, "owner@barokah.com", {
      dateISO: "2026-03-25",
      memo: "Penjualan besar Maret",
      lines: [
        { accountId: kasId, debitMinor: toMinor(350_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(350_000_000) },
      ],
    });

    const sumMar = await upsertMonthlyTaxSummary(db, orgId, "2026-03");
    expect(sumMar.grossRevenueMinor).toBe(toMinor(350_000_000));
    expect(sumMar.cumulativeYearRevenueMinor).toBe(toMinor(600_000_000));
    // Bebas pajak: 500jt - 250jt = 250jt. Kena pajak: 350jt - 250jt = 100jt
    expect(sumMar.taxableRevenueMinor).toBe(toMinor(100_000_000));
    // Pajak 0,5% dari 100jt = Rp 500.000
    expect(sumMar.taxDueMinor).toBe(toMinor(500_000));

    const list = await getTaxSummariesByYear(db, orgId, 2026);
    expect(list.length).toBe(3);
  });

  it("settles tax payment with NTPN and creates settlement journal", async () => {
    const bankId = await getAccountId("1120");

    const paymentResult = await settleTaxPayment(db, orgId, {
      periodMonth: "2026-03",
      ntpn: "NTPN9876543210ABCDEF",
      paidAtISO: "2026-04-10",
      bankAccountId: bankId,
      actorEmail: "owner@barokah.com",
    });

    expect(paymentResult.paymentEntryId).toBeDefined();

    // Verifikasi status tax_summaries berubah menjadi PAID
    const list = await getTaxSummariesByYear(db, orgId, 2026);
    const mar = list.find((s) => s.periodMonth === "2026-03");
    expect(mar?.status).toBe("PAID");
    expect(mar?.ntpn).toBe("NTPN9876543210ABCDEF");
    expect(mar?.paymentJournalEntryId).toBe(paymentResult.paymentEntryId);

    // Verifikasi jurnal pelunasan di database: Debit Utang PPh 2300, Kredit Bank 1120
    const lines = await admin.query<{ debit: string; credit: string; code: string }>(
      `SELECT jl.debit, jl.credit, a.code
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.entry_id = $1
       ORDER BY jl.position`,
      [paymentResult.paymentEntryId]
    );
    expect(lines.rows.length).toBe(2);
    // Debit Utang PPh 500.000
    expect(lines.rows[0].code).toBe("2300");
    expect(lines.rows[0].debit).toBe("500000.00");
    // Kredit Bank 500.000
    expect(lines.rows[1].code).toBe("1120");
    expect(lines.rows[1].credit).toBe("500000.00");
  });

  it("freezes tax calculation when status is PAID even if backdated transactions occur", async () => {
    const kasId = await getAccountId("1110");
    const revId = await getAccountId("4100");

    // Catat transaksi penjualan susulan di bulan Maret 2026 (yang statusnya sudah PAID)
    await postJournalEntry(db, orgId, "owner@barokah.com", {
      dateISO: "2026-03-30",
      memo: "Penjualan susulan Maret setelah setor NTPN",
      lines: [
        { accountId: kasId, debitMinor: toMinor(50_000_000), creditMinor: 0n },
        { accountId: revId, debitMinor: 0n, creditMinor: toMinor(50_000_000) },
      ],
    });

    // Panggil upsert ulang untuk periode yang sudah PAID
    const frozenSummary = await upsertMonthlyTaxSummary(db, orgId, "2026-03");

    // Nominal harus tetap beku (frozen) sesuai data pelunasan NTPN sebelumnya
    expect(frozenSummary.status).toBe("PAID");
    expect(frozenSummary.ntpn).toBe("NTPN9876543210ABCDEF");
    expect(frozenSummary.grossRevenueMinor).toBe(toMinor(350_000_000));
    expect(frozenSummary.taxDueMinor).toBe(toMinor(500_000));
  });
});
