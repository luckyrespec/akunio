import type { BusinessType } from "@/core/accounts/business-types";
import type { AccountType } from "@/core/accounts/types";
import type { ReferralSource, RevenueRange } from "@/server/db/schema/onboarding";
import type { OnboardingStep } from "@/server/db/schema/onboarding";

/**
 * Deterministic Indonesian-language parsers for the onboarding state machine.
 * These are the SOURCE OF TRUTH for field values — the LLM (when available)
 * only polishes reply phrasing, never values. Priority order inside each
 * parser is load-bearing (e.g. "toko online" must hit ONLINE_RESALE before
 * DAGANG); the eval in tests/eval/onboarding-mapping.test.ts locks it.
 */

const norm = (s: string): string => s.toLowerCase().trim();

const BUSINESS_TYPE_RULES: Array<{ type: BusinessType; res: RegExp[] }> = [
  {
    type: "KOS_PROPERTI",
    res: [/kos\b/, /kost/, /kontrakan/, /petak/, /apartemen/, /indekos/, /properti/],
  },
  {
    type: "KULINER",
    res: [
      /warteg/, /warung makan/, /warung kopi/, /kopi/, /coffee/, /kafe/, /cafe/,
      /resto/, /restoran/, /rumah makan/, /kuliner/, /makanan/, /minuman/,
      /katering/, /catering/, /bakso/, /\bmie\b/, /soto/, /sate/, /geprek/,
      /depot/, /kantin/, /f&b/, /angkringan/, /seafood/,
    ],
  },
  {
    type: "ONLINE_RESALE",
    res: [
      /shopee/, /tokopedia/, /tiktok/, /online/, /reseller/, /dropship/,
      /marketplace/, /lazada/, /blibli/, /afiliasi/, /e-?commerce/,
    ],
  },
  {
    type: "MANUFAKTUR",
    res: [/pabrik/, /manufaktur/, /produksi/, /konveksi/, /garmen/, /mebel/, /furniture/, /percetakan/],
  },
  {
    type: "JASA",
    res: [
      /\bjasa\b/, /bengkel/, /salon/, /laundry/, /cucian/, /servis/, /service/,
      /konsultan/, /desain/, /design/, /fotografi/, /\bfoto\b/, /barber/,
      /pangkas/, /bimbel/, /kursus/, /\bles\b/, /travel/, /\btour\b/,
      /notaris/, /arsitek/, /cleaning/, /reparasi/,
    ],
  },
  {
    type: "DAGANG",
    res: [
      /toko/, /dagang/, /warung/, /kelontong/, /ritel/, /retail/, /grosir/,
      /distributor/, /minimarket/, /kios/, /konter/, /agen pulsa/, /sembako/,
    ],
  },
];

export function parseBusinessType(input: string): BusinessType | null {
  const t = norm(input);
  if (!t) return null;
  for (const { type, res } of BUSINESS_TYPE_RULES) {
    if (res.some((re) => re.test(t))) return type;
  }
  return null;
}

/** Parse "20.000.000" / "2,5" style Indonesian numbers. */
function parseIdNumber(s: string): number | null {
  const cleaned = s.replace(/\./g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function bucketRevenue(rp: number): RevenueRange {
  if (rp < 10_000_000) return "LT_10JT";
  if (rp < 50_000_000) return "R_10_50JT";
  if (rp < 200_000_000) return "R_50_200JT";
  return "GT_200JT";
}

export function parseRevenue(input: string): RevenueRange | null {
  const t = norm(input);
  if (!t) return null;
  // Chips first (exact chip strings from the engine).
  if (t.includes(">200")) return "GT_200JT";
  if (t.includes("50") && t.includes("200")) return "R_50_200JT";
  if (t.includes("10") && t.includes("50")) return "R_10_50JT";
  if (t.includes("<10")) return "LT_10JT";
  // Free text with explicit money unit.
  const m = /(\d[\d.,]*)\s*(miliar|milyar|juta|jt|ribu|rb|\bk\b|\bm\b)/i.exec(t);
  if (m) {
    const n = parseIdNumber(m[1]);
    if (n === null) return null;
    const unit = m[2].toLowerCase();
    const mult =
      unit.startsWith("mili") ? 1_000_000_000
      : unit === "juta" || unit === "jt" ? 1_000_000
      : 1_000;
    return bucketRevenue(n * mult);
  }
  // "rp 20.000.000" style.
  const rp = /rp\.?\s*([\d.,]+)/i.exec(t);
  if (rp) {
    const n = parseIdNumber(rp[1]);
    if (n !== null) return bucketRevenue(n);
  }
  return null;
}

/**
 * Bare numbers WITHOUT a money unit mean headcount here (e.g. "3" → 3
 * employees). Revenue always needs a unit ("20 juta") or a chip — the engine
 * re-asks whichever piece is still missing, so this never silently mislabels.
 */
export function parseEmployees(input: string): number | null {
  const t = norm(input);
  if (!t) return null;
  if (/sendiri/.test(t)) return 1;
  if (t.includes("2") && t.includes("5")) return 3;
  if (t.includes("6") && t.includes("20") && !t.includes(">")) return 10;
  if (t.includes(">20") || t.includes("20+") || /di atas 20|lebih dari 20/.test(t)) return 30;
  const k = /karyawan\s*(\d+)|(\d+)\s*(orang|karyawan|pekerja|staff|staf|tim|anggota)/i.exec(t);
  if (k) {
    const n = Number(k[1] ?? k[2]);
    if (Number.isInteger(n) && n >= 1 && n <= 10000) return n;
  }
  const bare = /^(\d{1,5})$/.exec(t);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 1 && n <= 10000) return n;
  }
  return null;
}

export function parseReferral(input: string): ReferralSource | null {
  const t = norm(input);
  if (!t) return null;
  if (/teman|keluarga|saudara|rekomendasi|kerabat|kawan/.test(t)) return "TEMAN";
  if (/google|googling|search|iklan/.test(t)) return "GOOGLE";
  if (/instagram|\big\b|tiktok|facebook|\bfb\b|youtube|twitter|sosmed|medsos|whatsapp/.test(t))
    return "SOSMED";
  return "LAINNYA";
}

export function parseConfirm(input: string): boolean {
  return /^(ya|betul|benar|sudah|lanjut|oke|ok|setuju|yup|yoi|sip|mantap|boleh|gas)\b/i.test(
    norm(input),
  );
}

const UBAH_TARGETS: Array<{ step: OnboardingStep; res: RegExp[] }> = [
  { step: "USAHA", res: [/nama usaha/, /\busaha\b/] },
  { step: "NAMA", res: [/\bnama\b/, /panggil/] },
  { step: "JENIS", res: [/jenis/, /bidang/, /kategori/, /sektor/] },
  { step: "SKALA", res: [/omzet/, /omset/, /skala/, /karyawan/, /penghasilan/] },
  { step: "LOKASI", res: [/alamat/, /kota/, /lokasi/, /domisili/, /tempat/] },
  { step: "REFERRAL", res: [/referral/, /\btahu\b/, /dapat info/, /dari mana/, /sumber/] },
];

/** "ubah nama usaha" → USAHA. Returns null when no target is identifiable. */
export function parseUbahTarget(input: string): OnboardingStep | null {
  const t = norm(input);
  if (!/ubah|ganti|ralat|revisi|koreksi|salah/.test(t)) return null;
  for (const { step, res } of UBAH_TARGETS) {
    if (res.some((re) => re.test(t))) return step;
  }
  return null;
}

export type CoaIntent =
  | { kind: "confirm" }
  | { kind: "add"; name: string }
  | { kind: "remove"; query: string }
  | { kind: "show" }
  | { kind: "type"; type: AccountType }
  | { kind: "unknown" };

export function parseCoaIntent(input: string): CoaIntent {
  const t = norm(input);
  if (!t) return { kind: "unknown" };
  if (/^(ya|gunakan|pakai|lanjut|setuju|oke|ok|bagus|lanjutkan|sip|mantap|betul|benar|sudah|gas)\b/.test(t))
    return { kind: "confirm" };
  const add = /^(tambah(?:kan)?|buat(?:kan)?(?:\s+akun)?|bikin(?:\s+akun)?)\s+(.+)/.exec(t);
  if (add && add[2].trim()) {
    const name = add[2].replace(/^akun\s+/i, "").trim();
    if (name) return { kind: "add", name: titleCase(name) };
  }
  const del = /^(hapus|buang|hilangkan)\s+(.+)/.exec(t);
  if (del && del[2].trim()) return { kind: "remove", query: del[2].trim() };
  if (/^(lihat|tampilkan|tampil|tunjukkan|daftar|list|preview)/.test(t)) return { kind: "show" };
  const ty = /^(aset|aktiva|liabilitas|liability|ekuitas|ekuiti|modal|pendapatan|beban|biaya)/.exec(t);
  if (ty) {
    const w = ty[1];
    const type: AccountType =
      w.startsWith("aset") || w.startsWith("aktiva") ? "ASET"
      : w.startsWith("liab") ? "LIABILITAS"
      : w.startsWith("pendapatan") ? "PENDAPATAN"
      : w.startsWith("beban") || w.startsWith("biaya") ? "BEBAN"
      : "EKUITAS";
    return { kind: "type", type };
  }
  return { kind: "unknown" };
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
