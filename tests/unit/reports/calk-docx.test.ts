import { describe, it, expect } from "vitest";
import { buildCalkDocx, type CalkDocxData } from "@/server/reports/calk-docx";

describe("calk-docx unit test", () => {
  it("generates a valid non-empty docx buffer with PK zip signature", async () => {
    const mockData: CalkDocxData = {
      entityName: "PT Sumber Rejeki Makmur",
      businessType: "Perdagangan Umum & Jasa",
      city: "Surabaya",
      periodName: "2026-12",
      periodEndsOn: "2026-12-31",
      totalAssetsMinor: 500_000_000_00n,
      totalLiabilitiesMinor: 150_000_000_00n,
      totalEquityMinor: 350_000_000_00n,
      totalRevenueMinor: 1_200_000_000_00n,
      grossProfitMinor: 400_000_000_00n,
      netIncomeMinor: 250_000_000_00n,
      taxpayerType: "CORPORATE",
      npwp: "01.234.567.8-901.000",
      totalGrossRevenueMinor: 1_200_000_000_00n,
      taxableRevenueMinor: 1_200_000_000_00n,
      taxDueMinor: 6_000_000_00n,
      taxPaidMinor: 6_000_000_00n,
      ntpnList: ["NTPN11223344AABBCCDD"],
      narrative: {
        generalInfo: "PT Sumber Rejeki Makmur didirikan di Surabaya.",
        accountingBasis: "Disusun berpedoman pada SAK EMKM dan biaya historis.",
        policies: {
          cash: "Kas dan bank dicatat sebesar nilai nominal.",
          receivables: "Piutang usaha dicatat sebesar tagihan neto.",
          inventory: "Persediaan diukur dengan biaya perolehan FIFO.",
          fixedAssets: "Aset tetap disusutkan dengan metode garis lurus.",
          revenueExpense: "Pendapatan dan beban diakui dengan basis akrual.",
        },
        accountNotes: {
          cashAndBank: "Saldo kas dan bank mencukupi operasional entitas.",
          receivables: "Kolektibilitas piutang usaha lancar.",
          inventory: "Kondisi persediaan barang dagang baik.",
          fixedAssets: "Peralatan operasional terpelihara baik.",
          liabilities: "Utang usaha dilunasi tepat waktu.",
        },
        incomeTaxNote:
          "Beban pajak penghasilan dihitung berdasarkan PP 55/2022 tanpa mengakui pajak tangguhan.",
      },
    };

    const buffer = await buildCalkDocx(mockData);

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);

    // Verifikasi DOCX ZIP signature: PK\x03\x04
    expect(buffer[0]).toBe(0x50); // 'P'
    expect(buffer[1]).toBe(0x4b); // 'K'
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });
});
