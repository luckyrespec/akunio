// Filter tanggal buku besar: query URL (?dari=&sampai=&preset=) → rentang
// untuk getLedger. Tanggal rusak diabaikan (tampil semua); dari > sampai
// juga tampil semua agar tak ada tabel kosong yang membingungkan.

export type LedgerPreset = "bulan-ini" | "bulan-lalu" | "tahun-berjalan" | "semua";

export interface LedgerRangeInput {
  dari?: string;
  sampai?: string;
  preset?: string;
  /** ISO YYYY-MM-DD; default hari ini. Di-inject agar bisa diuji. */
  today?: string;
}

export interface LedgerRange {
  from?: string;
  to?: string;
}

function validDate(s: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return undefined;
  }
  return s;
}

function lastDay(y: number, m: number): string {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}-${String(last).padStart(2, "0")}`;
}

export function resolveLedgerRange(input: LedgerRangeInput): LedgerRange | undefined {
  const from = input.dari !== undefined ? validDate(input.dari.trim()) : undefined;
  const to = input.sampai !== undefined ? validDate(input.sampai.trim()) : undefined;
  if (from !== undefined || to !== undefined) {
    if (from !== undefined && to !== undefined && from > to) return undefined;
    return { from, to };
  }

  const todayStr =
    input.today && validDate(input.today) ? input.today : new Date().toISOString().slice(0, 10);
  const [y, m] = todayStr.split("-").map(Number);
  switch (input.preset) {
    case "bulan-ini": {
      const mm = String(m).padStart(2, "0");
      return { from: `${y}-${mm}-01`, to: lastDay(y, m) };
    }
    case "bulan-lalu": {
      const d = new Date(Date.UTC(y, m - 2, 1));
      const py = d.getUTCFullYear();
      const pm = d.getUTCMonth() + 1;
      const pmm = String(pm).padStart(2, "0");
      return { from: `${py}-${pmm}-01`, to: lastDay(py, pm) };
    }
    case "tahun-berjalan":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return undefined;
  }
}
