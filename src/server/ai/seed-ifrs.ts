import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { ifrsChunks } from "@/server/db/schema/rag";
import { chunkIfsSection } from "./chunking";
import { embed } from "./embeddings";
import { SAMPLE_IFRS_SECTIONS } from "./ifrs-fixture";

export async function seedIfsChunks(): Promise<number> {
  const existing = await db.execute(sql`SELECT count(*)::int AS n FROM ifrs_chunks`);
  const n = (existing as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0;
  if (n > 0) return n;

  let total = 0;
  for (const sec of SAMPLE_IFRS_SECTIONS) {
    const chunks = chunkIfsSection(sec.content, sec.section);
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const embedding = await embed(c.content);
      await db.execute(sql`
        INSERT INTO ifrs_chunks (section, chunk_index, content, embedding, tsv)
        VALUES (${c.metadata.section}, ${String(c.metadata.chunk_index)}, ${c.content}, ${JSON.stringify(embedding)}, to_tsvector('english', ${c.content}))
      `);
      total++;
    }
  }
  return total;
}
