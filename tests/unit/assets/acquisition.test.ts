import { describe, it, expect } from "vitest";
import { buildAcquisitionJournal } from "@/core/assets/acquisition";

describe("Fixed Assets Acquisition Journal", () => {
  const base = {
    assetId: "asset-uuid-1",
    assetCode: "AST-2026-0001",
    assetName: "Laptop Kerja Kantor",
    assetAccountId: "acc-asset-1510",
    acquisitionDate: "2026-09-01",
  };

  it("membangun jurnal seimbang Dr Aset / Cr Kas untuk pembelian tunai", () => {
    // Harga perolehan: 15.000.000 (1.500.000.000 sen)
    const result = buildAcquisitionJournal({
      ...base,
      counterAccountId: "acc-cash-1110",
      acquisitionCostMinor: 1500000000n,
    });

    expect(result.dateISO).toBe("2026-09-01");
    expect(result.source).toBe("MANUAL");
    expect(result.idempotencyKey).toBe("asset-acq-asset-uuid-1");
    expect(result.memo).toContain("AST-2026-0001");
    expect(result.lines).toHaveLength(2);

    const [debit, credit] = result.lines;
    expect(debit.accountId).toBe("acc-asset-1510");
    expect(debit.debitMinor).toBe(1500000000n);
    expect(debit.creditMinor).toBe(0n);
    expect(credit.accountId).toBe("acc-cash-1110");
    expect(credit.debitMinor).toBe(0n);
    expect(credit.creditMinor).toBe(1500000000n);

    const totalDebit = result.lines.reduce((acc, l) => acc + l.debitMinor, 0n);
    const totalCredit = result.lines.reduce((acc, l) => acc + l.creditMinor, 0n);
    expect(totalDebit).toBe(totalCredit);
  });

  it("mendukung akun lawan utang dan ekuitas (migrasi saldo awal)", () => {
    const utang = buildAcquisitionJournal({
      ...base,
      counterAccountId: "acc-payable-2110",
      acquisitionCostMinor: 500000000n,
    });
    expect(utang.lines[1].accountId).toBe("acc-payable-2110");
    expect(utang.lines[1].creditMinor).toBe(500000000n);

    const modal = buildAcquisitionJournal({
      ...base,
      counterAccountId: "acc-equity-3110",
      acquisitionCostMinor: 500000000n,
    });
    expect(modal.lines[1].accountId).toBe("acc-equity-3110");
  });

  it("menolak harga nol dan akun lawan yang sama dengan akun aset", () => {
    expect(() =>
      buildAcquisitionJournal({ ...base, counterAccountId: "acc-cash-1110", acquisitionCostMinor: 0n }),
    ).toThrow("lebih besar dari Rp 0");

    expect(() =>
      buildAcquisitionJournal({ ...base, counterAccountId: "acc-asset-1510", acquisitionCostMinor: 1000n }),
    ).toThrow("tidak boleh sama");
  });
});
