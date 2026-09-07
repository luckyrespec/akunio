import { describe, it, expect } from "vitest";
import { stockStatus, buildContactCard, formatQty, avgCost } from "@/core/subledger/cards";

describe("formatQty", () => {
  it("memangkas nol desimal", () => {
    expect(formatQty("8.0000")).toBe("8");
    expect(formatQty("2.5000")).toBe("2.5");
    expect(formatQty("0")).toBe("0");
  });
});

describe("avgCost", () => {
  it("total/qty dibulatkan ke bawah", () => {
    expect(avgCost(400_000n, "8.0000")).toBe(50_000n);
    expect(avgCost(0n, "8.0000")).toBe(0n);
    expect(avgCost(100n, "0.0000")).toBe(0n);
  });
});

describe("stockStatus", () => {
  it("habis saat nol", () => {
    expect(stockStatus(0, 10)).toBe("HABIS");
    expect(stockStatus(-2, 10)).toBe("HABIS");
  });
  it("menipis saat <= minimum", () => {
    expect(stockStatus(10, 10)).toBe("MENIPIS");
    expect(stockStatus(5, 10)).toBe("MENIPIS");
  });
  it("aman di atas minimum; minimum 0 selalu aman bila ada stok", () => {
    expect(stockStatus(11, 10)).toBe("AMAN");
    expect(stockStatus(1, 0)).toBe("AMAN");
  });
});

describe("buildContactCard", () => {
  it("piutang: tagihan debit, bayar kredit, saldo berjalan", () => {
    const rows = buildContactCard("PIUTANG",
      [{ side: "BILL", date: "2026-09-01", desc: "Faktur INV-1", ref: "INV-1", amountMinor: 1_000_000n }],
      [{ side: "PAYMENT", date: "2026-09-05", desc: "Bayar INV-1", ref: "INV-1", amountMinor: 400_000n }],
    );
    expect(rows.map((r) => [r.debitMinor, r.creditMinor, r.balanceMinor])).toEqual([
      [1_000_000n, 0n, 1_000_000n],
      [0n, 400_000n, 600_000n],
    ]);
  });

  it("utang: tagihan kredit, bayar debit, saldo positif", () => {
    const rows = buildContactCard("UTANG",
      [{ side: "BILL", date: "2026-09-01", desc: "Tagihan BILL-1", ref: "BILL-1", amountMinor: 2_000_000n }],
      [{ side: "PAYMENT", date: "2026-09-03", desc: "Bayar BILL-1", ref: "BILL-1", amountMinor: 2_000_000n }],
    );
    expect(rows.map((r) => [r.debitMinor, r.creditMinor, r.balanceMinor])).toEqual([
      [0n, 2_000_000n, 2_000_000n],
      [2_000_000n, 0n, 0n],
    ]);
  });

  it("urut tanggal walau input acak", () => {
    const rows = buildContactCard("PIUTANG",
      [{ side: "BILL", date: "2026-09-10", desc: "b", ref: "b", amountMinor: 1n }],
      [{ side: "PAYMENT", date: "2026-09-01", desc: "a", ref: "a", amountMinor: 2n }],
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-09-01", "2026-09-10"]);
    expect(rows[0].balanceMinor).toBe(-2n);
    expect(rows[1].balanceMinor).toBe(-1n);
  });
});
