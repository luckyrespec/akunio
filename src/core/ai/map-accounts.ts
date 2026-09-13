function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  const norm = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let i = 0; i < norm.length - 1; i++) out.add(norm.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export interface DraftAccountLine {
  accountCode: string;
  accountId: string | null;
  matchedName: string | null;
  unresolved: boolean;
}

export interface ResolverAccount {
  id: string;
  code: string;
  name: string;
  /** Kode induk (null = kandidat leaf). Dibutuhkan untuk deteksi akun GROUP. */
  parentCode?: string | null;
  /** Terisi = diarsipkan → tidak bisa diposting (kriteria isPostableAccount). */
  archivedAt?: Date | string | null;
}

export function resolveDraftAccounts(
  draft: { lines: Array<{ accountCode: string }> },
  accounts: ResolverAccount[],
  minScore = 0.6,
): { lines: DraftAccountLine[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = draft.lines.map((l, i) => {
    const n = i + 1;
    const byCode = accounts.find((a) => a.code === l.accountCode)
      ?? accounts.find((a) => a.code.toLowerCase() === l.accountCode.toLowerCase());
    if (byCode) {
      // Kode cocok tetapi tak bisa diposting (induk/grup atau arsip — kriteria
      // identik guard GROUP_ACCOUNT): tandai unresolved sejak dini agar review
      // memblokir dengan pesan jelas, bukan gagal saat posting.
      if (accounts.some((a) => a.parentCode === byCode.code)) {
        warnings.push(
          `Baris ${n}: akun ${l.accountCode} (${byCode.name}) adalah akun induk (GROUP) — pilih akun detail yang bisa diposting`,
        );
        return {
          accountCode: l.accountCode, accountId: null,
          matchedName: byCode.name, unresolved: true,
        };
      }
      if (byCode.archivedAt) {
        warnings.push(
          `Baris ${n}: akun ${l.accountCode} (${byCode.name}) sudah diarsipkan — pilih akun aktif`,
        );
        return {
          accountCode: l.accountCode, accountId: null,
          matchedName: byCode.name, unresolved: true,
        };
      }
      return {
        accountCode: l.accountCode, accountId: byCode.id,
        matchedName: byCode.name, unresolved: false,
      };
    }
    let best: { a: (typeof accounts)[number]; score: number } | null = null;
    for (const a of accounts) {
      const s = similarity(l.accountCode, a.name);
      if (!best || s > best.score) best = { a, score: s };
    }
    if (best && best.score >= minScore) {
      warnings.push(
        `Baris ${n}: akun ${l.accountCode} tidak dikenal, dipilih ${best.a.code} (${best.score.toFixed(2)})`,
      );
      return {
        accountCode: l.accountCode, accountId: best.a.id,
        matchedName: best.a.name, unresolved: false,
      };
    }
    warnings.push(`Baris ${n}: tidak ada akun yang cocok`);
    return { accountCode: l.accountCode, accountId: null, matchedName: null, unresolved: true };
  });
  return { lines, warnings };
}
