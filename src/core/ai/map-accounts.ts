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

export function resolveDraftAccounts(
  draft: { lines: Array<{ accountCode: string }> },
  accounts: Array<{ id: string; code: string; name: string }>,
  minScore = 0.6,
): { lines: DraftAccountLine[]; warnings: string[] } {
  const warnings: string[] = [];
  const lines = draft.lines.map((l, i) => {
    const n = i + 1;
    const byCode = accounts.find((a) => a.code === l.accountCode)
      ?? accounts.find((a) => a.code.toLowerCase() === l.accountCode.toLowerCase());
    if (byCode) {
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
