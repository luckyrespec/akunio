import type { JournalSource } from "@/core/journals/types";

export type SubledgerKind = "PIUTANG" | "UTANG" | "PERSEDIAAN" | "ASET_TETAP" | "DIMUKA";

export interface SubledgerLinkInput {
  kind: SubledgerKind;
  refId: string;
  amountMinor: bigint;
  qty?: number;
}

export interface GuardLineInput {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  links?: SubledgerLinkInput[];
}

export type SubledgerIssue =
  | { code: "AKUN_KONTROL_WAJIB_VIA_MODUL"; index: number; kind: SubledgerKind }
  | { code: "SUBLEDGER_REF_WAJIB"; index: number; kind: SubledgerKind }
  | { code: "SUBLEDGER_KIND_TIDAK_COCok"; index: number; expected: SubledgerKind; actual: SubledgerKind }
  | { code: "SUBLEDGER_TOTAL_TIDAK_COCok"; index: number; expectedMinor: bigint; actualMinor: bigint };

export const MANUAL_SOURCES: ReadonlySet<JournalSource> = new Set([
  "MANUAL", "AI", "IMPORT",
]);

export function moduleLabelForKind(kind: SubledgerKind): string {
  if (kind === "PIUTANG") return "Faktur Penjualan";
  if (kind === "UTANG") return "Tagihan Pembelian";
  if (kind === "DIMUKA") return "Sewa Dibayar di Muka";
  if (kind === "ASET_TETAP") return "Aset Tetap";
  return "Persediaan/Opname";
}

function lineAmount(l: GuardLineInput): bigint {
  return l.debitMinor !== 0n ? l.debitMinor : l.creditMinor;
}

export function validateSubledgerControl(args: {
  lines: GuardLineInput[];
  controlByAccountId: Map<string, SubledgerKind>;
  source: JournalSource;
  isOpeningBalance?: boolean;
  isLegacyReversal?: boolean;
}): SubledgerIssue[] {
  const issues: SubledgerIssue[] = [];
  if (args.isOpeningBalance) return issues;
  // Reversal atas entri warisan (tanpa links) neto nol terhadap aslinya:
  // diizinkan agar koreksi masa transisi tidak terkunci. Reversal atas
  // jurnal modul (ber-links) tetap wajib via modul.
  if (args.isLegacyReversal) return issues;
  const manual = MANUAL_SOURCES.has(args.source);
  args.lines.forEach((l, index) => {
    const kind = args.controlByAccountId.get(l.accountId);
    if (!kind) return;
    if (manual) {
      issues.push({ code: "AKUN_KONTROL_WAJIB_VIA_MODUL", index, kind });
      return;
    }
    const links = l.links ?? [];
    if (links.length === 0) {
      issues.push({ code: "SUBLEDGER_REF_WAJIB", index, kind });
      return;
    }
    for (const link of links) {
      if (link.kind !== kind) {
        issues.push({ code: "SUBLEDGER_KIND_TIDAK_COCok", index, expected: kind, actual: link.kind });
        return;
      }
    }
    const total = links.reduce((a, x) => a + x.amountMinor, 0n);
    if (total !== lineAmount(l)) {
      issues.push({ code: "SUBLEDGER_TOTAL_TIDAK_COCok", index, expectedMinor: lineAmount(l), actualMinor: total });
    }
  });
  return issues;
}
