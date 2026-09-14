const SCALE = 100n;

export class MoneyError extends Error {}

export class Money {
  private constructor(readonly minor: bigint) {}

  static zero(): Money {
    return new Money(0n);
  }

  static fromMinor(v: bigint | string): Money {
    return new Money(typeof v === "string" ? BigInt(v) : v);
  }

  // Accepts "1250000", "Rp 1.250.000", "1250000,5"; max 2 decimals.
  static parseIdr(input: string): Money {
    let s = input.toLowerCase().replaceAll("rp", "").replace(/\s+/g, "");
    s = s.replaceAll(".", "").replace(",", ".");
    const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) throw new MoneyError(`FORMAT_UANG_TIDAK_VALID: ${input}`);
    const sign = m[1] ? -1n : 1n;
    const whole = BigInt(m[2]);
    const frac = m[3] ? BigInt(m[3].padEnd(2, "0")) : 0n;
    return new Money(sign * (whole * SCALE + frac));
  }

  add(b: Money): Money { return new Money(this.minor + b.minor); }
  sub(b: Money): Money { return new Money(this.minor - b.minor); }
  negate(): Money { return new Money(-this.minor); }
  abs(): Money { return new Money(this.minor < 0n ? -this.minor : this.minor); }
  scaleBy(k: number | bigint): Money {
    if (!Number.isInteger(k) && typeof k === "number") throw new MoneyError("scale must be integer");
    return new Money(this.minor * BigInt(k));
  }
  isZero(): boolean { return this.minor === 0n; }
  isNegative(): boolean { return this.minor < 0n; }
  cmp(b: Money): -1 | 0 | 1 {
    return this.minor < b.minor ? -1 : this.minor > b.minor ? 1 : 0;
  }

  static formatIdr(v: bigint | string | Money): string {
    if (v instanceof Money) return v.formatIdr();
    return Money.fromMinor(v).formatIdr();
  }

  formatIdr(): string {
    const neg = this.minor < 0n;
    const abs = neg ? -this.minor : this.minor;
    const whole = abs / SCALE;
    const frac = abs % SCALE;
    const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const body = frac === 0n ? grouped : `${grouped},${frac.toString().padStart(2, "0")}`;
    return `${neg ? "-" : ""}Rp${body}`;
  }
}

// Nominal desimal Rupiah (number|string, mis. 100.5 atau "100.5") → minor
// eksak; null bila format tak valid. Tanpa Number()*100 agar sen tak
// terpotong (Number("1.005")*100 = 100.49999… → 100n SALAH). Aturan: digit
// bulat + maks 2 digit sen, tanpa tanda minus, dan NOL ditolak (domain
// pemakaian: amount positif; kuantitas/diskon-nol JANGAN lewat sini).
export function parseDecimalToMinor(raw: unknown): bigint | null {
  const s = typeof raw === "number" ? String(raw) : raw;
  if (typeof s !== "string") return null;
  const t = s.trim().replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const minor = BigInt(m[1]) * SCALE + BigInt((m[2] ?? "0").padEnd(2, "0"));
  return minor > 0n ? minor : null;
}
