const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function sebut(n: bigint): string {
  if (n < 0n) return `minus ${sebut(-n)}`;
  if (n < 12n) return SATUAN[Number(n)];
  if (n < 20n) return `${sebut(n - 10n)} belas`;
  if (n < 100n) {
    const rest = n % 10n;
    return `${sebut(n / 10n)} puluh${rest > 0n ? ` ${sebut(rest)}` : ""}`;
  }
  if (n < 200n) {
    const rest = n - 100n;
    return `seratus${rest > 0n ? ` ${sebut(rest)}` : ""}`;
  }
  if (n < 1000n) {
    const rest = n % 100n;
    return `${sebut(n / 100n)} ratus${rest > 0n ? ` ${sebut(rest)}` : ""}`;
  }
  if (n < 2000n) {
    const rest = n - 1000n;
    return `seribu${rest > 0n ? ` ${sebut(rest)}` : ""}`;
  }
  if (n < 1_000_000n) {
    const rest = n % 1000n;
    return `${sebut(n / 1000n)} ribu${rest > 0n ? ` ${sebut(rest)}` : ""}`;
  }
  if (n < 1_000_000_000n) {
    const rest = n % 1_000_000n;
    return `${sebut(n / 1_000_000n)} juta${rest > 0n ? ` ${sebut(rest)}` : ""}`;
  }
  if (n < 1_000_000_000_000n) {
    const rest = n % 1_000_000_000n;
    return `${sebut(n / 1_000_000_000n)} miliar${rest > 0n ? ` ${sebut(rest)}` : ""}`;
  }
  const rest = n % 1_000_000_000_000n;
  return `${sebut(n / 1_000_000_000_000n)} triliun${rest > 0n ? ` ${sebut(rest)}` : ""}`;
}

function kapital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Terbilang nominal minor (1/100 rupiah): 1000000n → "Sepuluh ribu rupiah".
 * Sen disebut hanya bila ada sisa sen.
 */
export function terbilangRupiah(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / 100n;
  const sen = abs % 100n;
  const words = whole === 0n && sen === 0n ? "nol" : sebut(whole);
  const senWords = sen > 0n ? ` ${sebut(sen)} sen` : "";
  return kapital(`${neg ? "minus " : ""}${words} rupiah${senWords}`);
}
