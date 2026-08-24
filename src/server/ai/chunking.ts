export interface ChunkMeta {
  section: string;
  chunk_index: number;
}

export interface Chunk {
  content: string;
  metadata: ChunkMeta;
}

const CHUNK_TOKENS = 400;
const OVERLAP_TOKENS = 60;

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function chunkIfsSection(text: string, section: string): Chunk[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [{ content: "", metadata: { section, chunk_index: 0 } }];
  if (tokens.length <= CHUNK_TOKENS) {
    return [{ content: tokens.join(" "), metadata: { section, chunk_index: 0 } }];
  }
  const chunks: Chunk[] = [];
  let start = 0;
  let idx = 0;
  const step = CHUNK_TOKENS - OVERLAP_TOKENS;
  while (start < tokens.length) {
    const slice = tokens.slice(start, start + CHUNK_TOKENS);
    chunks.push({ content: slice.join(" "), metadata: { section, chunk_index: idx } });
    idx++;
    start += step;
    if (start + CHUNK_TOKENS > tokens.length && start < tokens.length) {
      // Last chunk: ensure we cover the tail, but avoid tiny final chunk
      // The loop naturally handles it; if remaining tokens < step, break after
    }
    if (start >= tokens.length) break;
  }
  // Adjust for the 1000-token test: 400, 400, 320 with 60 overlap gives 3 chunks
  // Our step logic yields: start 0 (0-400), 340 (340-740), 680 (680-1000) → 3 chunks correct
  return chunks;
}

export function chunkJournal(entry: {
  number: string;
  entryDate: string;
  memo: string;
  lines: Array<{ accountCode: string; debitText: string; creditText: string }>;
}): string {
  const lines = entry.lines
    .map((l) => `${l.accountCode} ${l.debitText || "-"} / ${l.creditText || "-"}`)
    .join("; ");
  return `Jurnal ${entry.number} tanggal ${entry.entryDate} memo ${entry.memo} garis ${lines}`;
}

export function chunkAccount(acc: { code: string; name: string; type: string; normal: string }): string {
  return `Akun ${acc.code} ${acc.name} tipe ${acc.type} normal ${acc.normal}`;
}

export function chunkPeriodSummary(period: {
  name: string;
  totalDebit: string;
  totalCredit: string;
  netIncome: string;
}): string {
  return `Ringkasan periode ${period.name} total debit ${period.totalDebit} total kredit ${period.totalCredit} laba ${period.netIncome}`;
}
