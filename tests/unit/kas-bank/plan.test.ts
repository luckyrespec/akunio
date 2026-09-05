import { describe, it, expect } from "vitest";
import { planCashJournal, cashNumber } from "@/core/kas-bank/kas-bank";

describe("planCashJournal", () => {
  it("bayar: debit lawan, kredit kas", () => {
    const p = planCashJournal("BAYAR", {
      cashAccountId: "kas",
      counterAccountId: "beban",
      cashIsCash: true,
      counterIsCash: false,
      memo: "ATK",
    });
    expect(p.debitAccountId).toBe("beban");
    expect(p.creditAccountId).toBe("kas");
  });
  it("terima: debit kas, kredit lawan", () => {
    const p = planCashJournal("TERIMA", {
      cashAccountId: "bank",
      counterAccountId: "pendapatan",
      cashIsCash: true,
      counterIsCash: false,
      memo: "Jasa",
    });
    expect(p.debitAccountId).toBe("bank");
    expect(p.creditAccountId).toBe("pendapatan");
  });
  it("transfer: debit tujuan, kredit asal, keduanya kas", () => {
    const p = planCashJournal("TRANSFER", {
      cashAccountId: "kas",
      counterAccountId: "bank",
      cashIsCash: true,
      counterIsCash: true,
      memo: "Setor",
    });
    expect(p.debitAccountId).toBe("bank");
    expect(p.creditAccountId).toBe("kas");
  });
  it("menolak akun kas yang sama", () => {
    expect(() =>
      planCashJournal("TRANSFER", {
        cashAccountId: "kas",
        counterAccountId: "kas",
        cashIsCash: true,
        counterIsCash: true,
        memo: "x",
      })
    ).toThrow("AKUN_SAMA");
  });
  it("menolak akun bayar yang bukan kas", () => {
    expect(() =>
      planCashJournal("BAYAR", {
        cashAccountId: "piutang",
        counterAccountId: "beban",
        cashIsCash: false,
        counterIsCash: false,
        memo: "x",
      })
    ).toThrow("BUKAN_AKUN_KAS");
  });
  it("nomor bukti memakai prefix benar", () => {
    expect(cashNumber("BAYAR", "2026", 7)).toBe("BBK-2026-0007");
    expect(cashNumber("TERIMA", "2026", 7)).toBe("BBM-2026-0007");
    expect(cashNumber("TRANSFER", "2026", 7)).toBe("TKB-2026-0007");
  });
});
