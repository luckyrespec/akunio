/** Pure helpers kartu buku pembantu — tanpa DB, gampang di-unit-test. */

export type StockStatus = "AMAN" | "MENIPIS" | "HABIS";

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
