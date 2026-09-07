/** Pure helpers kartu buku pembantu — tanpa DB, gampang di-unit-test. */

/** Harga rata-rata implisit dari total & qty saldo (display kartu). */
export function avgCost(totalMinor: bigint, qtyStr: string): bigint {
  const q = Math.round(Number(qtyStr) * 10000);
  if (!Number.isFinite(q) || q <= 0 || totalMinor <= 0n) return 0n;
  return (totalMinor * 10000n) / BigInt(q);
}

export type StockStatus = "AMAN" | "MENIPIS" | "HABIS";

/** "8.0000" → "8", "2.5000" → "2.5" — display only, bukan uang. */
export function formatQty(raw: string): string {
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

export const SUBLEDGER_LIST_ROUTE: Record<"PERSEDIAAN" | "PIUTANG" | "UTANG", string> = {
  PERSEDIAAN: "/buku-pembantu/persediaan",
  PIUTANG: "/buku-pembantu/piutang",
  UTANG: "/buku-pembantu/utang",
};

export const SUBLEDGER_KIND_LABEL: Record<"PERSEDIAAN" | "PIUTANG" | "UTANG", string> = {
  PERSEDIAAN: "Persediaan per SKU",
  PIUTANG: "Piutang Usaha per Pelanggan",
  UTANG: "Utang Usaha per Pemasok",
};

export function stockStatus(currentQty: number, minAlert: number): StockStatus {
  if (currentQty <= 0) return "HABIS";
  if (Number.isFinite(minAlert) && minAlert > 0 && currentQty <= minAlert) return "MENIPIS";
  return "AMAN";
}

export interface ContactLedgerInput {
  side: "BILL" | "PAYMENT";
  date: string;
  desc: string;
  ref: string;
  amountMinor: bigint;
}

export interface ContactLedgerEntry {
  date: string;
  desc: string;
  ref: string;
  debitMinor: bigint;
  creditMinor: bigint;
  balanceMinor: bigint;
}

/**
 * Gabung tagihan + pembayaran jadi kartu kronologis dengan saldo berjalan.
 * PIUTANG (normal D): tagihan menambah, bayar mengurangi.
 * UTANG (normal K): tagihan menambah utang, bayar mengurangi.
 */
export function buildContactCard(
  control: "PIUTANG" | "UTANG",
  bills: ContactLedgerInput[],
  payments: ContactLedgerInput[],
): ContactLedgerEntry[] {
  const all = [...bills, ...payments].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.ref < b.ref ? -1 : 1,
  );
  let balance = 0n;
  return all.map((e) => {
    const entry: ContactLedgerEntry = e.side === "BILL"
      ? control === "PIUTANG"
        ? { ...base(e), debitMinor: e.amountMinor, creditMinor: 0n, balanceMinor: 0n }
        : { ...base(e), debitMinor: 0n, creditMinor: e.amountMinor, balanceMinor: 0n }
      : control === "PIUTANG"
        ? { ...base(e), debitMinor: 0n, creditMinor: e.amountMinor, balanceMinor: 0n }
        : { ...base(e), debitMinor: e.amountMinor, creditMinor: 0n, balanceMinor: 0n };
    balance += entry.debitMinor - entry.creditMinor;
    entry.balanceMinor = control === "PIUTANG" ? balance : -balance;
    return entry;
  });
}

function base(e: ContactLedgerInput): Pick<ContactLedgerEntry, "date" | "desc" | "ref"> {
  return { date: e.date, desc: e.desc, ref: e.ref };
}
