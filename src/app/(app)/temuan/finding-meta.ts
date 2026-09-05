import { Money } from "@/core/money/money";

export type FindingSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface FindingView {
  id: string;
  type: string;
  severity: FindingSeverity;
  status: string;
  evidence: Record<string, unknown> | null;
  createdAt: string;
}

export function typeMetadata(t: string): { label: string; desc: string; standard: string; bab: number; babTitle: string } {
  switch (t) {
    case "abnormalBalances":
      return {
        label: "Saldo Abnormal",
        desc: "Posisi saldo buku berlawanan dengan saldo normal akun (debit/kredit terbalik atau saldo minus).",
        standard: "SAK EMKM Bab 2 & 3 (Konsep Pengakuan & Penyajian Saldo Wajar)",
        bab: 2,
        babTitle: "Konsep dan Prinsip Pervasif",
      };
    case "duplicates":
      return {
        label: "Transaksi Duplikat",
        desc: "Ditemukan jurnal dengan memo, nilai nominal, dan alokasi akun yang identik.",
        standard: "SAK EMKM Bab 7 Paragraf 7.16 (Koreksi Kesalahan Pencatatan Periode Berjalan)",
        bab: 7,
        babTitle: "Kebijakan Akuntansi, Estimasi, dan Kesalahan",
      };
    case "missingReceipts":
      return {
        label: "Bukti Transaksi Belum Terlampir",
        desc: "Pengeluaran material bernilai signifikan belum memiliki dokumen lampiran fisik atau faktur sah.",
        standard: "SAK EMKM Bab 2 Paragraf 2.14 & Bab 6 (Keandalan Bukti Transaksi & CALK)",
        bab: 2,
        babTitle: "Konsep dan Prinsip Pervasif",
      };
    case "oddDates":
      return {
        label: "Tanggal di Luar Periode Aktif",
        desc: "Tanggal transaksi berada di luar rentang kalender pembukuan fiskal yang berstatus OPEN.",
        standard: "SAK EMKM Bab 2 Paragraf 2.19 (Asumsi Dasar Akrual & Pisah Batas Periode)",
        bab: 2,
        babTitle: "Konsep dan Prinsip Pervasif",
      };
    case "ratioAnomalies":
      return {
        label: "Anomali Fluktuasi Mutasi",
        desc: "Lonjakan volume debit/kredit melebihi 2× deviasi rata-rata historis akun buku besar.",
        standard: "SAK EMKM Bab 2 Paragraf 2.17 (Materialitas & Signifikansi Transaksi)",
        bab: 2,
        babTitle: "Konsep dan Prinsip Pervasif",
      };
    default:
      return {
        label: t,
        desc: "Penyimpangan pencatatan terdeteksi oleh sistem pemeriksa jurnal otomatis.",
        standard: "Standar Akuntansi Keuangan EMKM 2024",
        bab: 1,
        babTitle: "Ruang Lingkup",
      };
  }
}

export function severityMeta(severity: FindingSeverity): {
  badgeClass: string;
  label: string;
  dot: string;
} {
  switch (severity) {
    case "HIGH":
      return {
        badgeClass: "bg-terra/12 text-terra border-terra/30",
        label: "Kritis (Tinggi)",
        dot: "bg-terra",
      };
    case "MEDIUM":
      return {
        badgeClass: "bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/30",
        label: "Perhatian (Sedang)",
        dot: "bg-amber-500",
      };
    case "LOW":
      return {
        badgeClass: "bg-ink-soft/10 text-ink-soft border-rule",
        label: "Informasi (Rendah)",
        dot: "bg-ink-soft",
      };
  }
}

export type RelatedKind = "journal" | "account";
export interface RelatedRef {
  kind: RelatedKind;
  /** journal entry id atau kode akun */
  ref: string;
  label: string;
}

/**
 * Petakan evidence temuan menjadi referensi data terkait.
 * Titik ekstensi: tambah branch baru (mis. invoiceId, assetId, itemId,
 * contactId) saat rule doctor baru menyimpan kunci tersebut.
 */
export function resolveRelatedRefs(evidence: Record<string, unknown> | null): RelatedRef[] {  if (!evidence) return [];
  const refs: RelatedRef[] = [];
  if (typeof evidence.entryId === "string" && evidence.entryId.length > 0) {
    const num = typeof evidence.entryNumber === "string" ? ` ${evidence.entryNumber}` : "";
    refs.push({ kind: "journal", ref: evidence.entryId, label: `Jurnal${num}` });
  }
  if (typeof evidence.code === "string" && evidence.code.length > 0) {
    refs.push({ kind: "account", ref: evidence.code, label: `Akun ${evidence.code}` });
  }
  return refs;
}

/** Label kunci evidence camelCase → kata terpisah ("entryNumber" → "Entry Number"). */
export function evidenceKeyLabel(k: string): string {
  const spaced = k.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Nilai evidence apa pun → string aman (objek diserialisasi, bukan "[object Object]"). */
export function evidenceValueText(v: unknown, asMoney: boolean): string {
  if (asMoney) {
    return Money.fromMinor(BigInt(String(v))).formatIdr();
  }
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v == null) {
    return String(v);
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Tanggal temuan → "12 Jan 2026", atau "—" bila tak valid. */
export function formatFindingDate(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
