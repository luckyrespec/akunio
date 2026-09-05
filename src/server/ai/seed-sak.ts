import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { chunkIfsSection } from "./chunking";
import { embed } from "./embeddings";
import { registerSakSource } from "@/server/db/repos/sak.repo";

export async function seedSakChunks(
  sourcePath: string,
  opts?: { docId?: string; version?: string; embedText?: (t: string) => Promise<number[]> },
): Promise<{ chunks: number; docId: string; version: string }> {
  const raw = readFileSync(sourcePath, "utf8");
  const embedText = opts?.embedText ?? embed;
  const docId = opts?.docId ?? "SAK-EMKM-2024";
  const version = opts?.version ?? "v2024.1";

  // Pecah per BAB; teks sebelum BAB pertama jadi Pembuka.
  const parts: Array<{ bab: string; text: string }> = [];
  const re = /^BAB\s+(\d+)\s*$/gim;
  let lastIdx = 0, lastBab = "Pembuka", m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > lastIdx) parts.push({ bab: lastBab, text: raw.slice(lastIdx, m.index) });
    lastBab = `Bab${m[1]}`;
    lastIdx = m.index;
  }
  parts.push({ bab: lastBab, text: raw.slice(lastIdx) });

  let total = 0;
  await db.transaction(async (tx) => {
    for (const part of parts) {
      if (!part.text.trim()) continue;
      const section = `SAK-EMKM-${part.bab}`;
      for (const [i, c] of chunkIfsSection(part.text, section).entries()) {
        if (!c.content.trim()) continue;
        const embedding = await embedText(c.content);
        await tx.execute(sql`
          INSERT INTO ifrs_chunks (section, chunk_index, content, embedding, tsv)
          VALUES (${section}, ${String(i)}, ${c.content}, ${JSON.stringify(embedding)}, to_tsvector('english', ${c.content}))
        `);
        total++;
      }
    }
    await registerSakSource(tx as never, { docId, version, effectiveDate: new Date().toISOString().slice(0, 10) });
  });
  return { chunks: total, docId, version };
}
