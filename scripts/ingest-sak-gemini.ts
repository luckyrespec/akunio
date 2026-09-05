import { readFileSync, existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { GoogleGenAI } from "@google/genai";
import { registerSakSource } from "@/server/db/repos/sak.repo";

interface ParsedChunk {
  bab: number;
  sectionTitle: string;
  paragraphRange: string;
  content: string;
}

const DEFAULT_PATH = "docs/SAK EMKM 2024.md";
const SAK_PATH = process.argv[2] || process.env.SAK_SOURCE_PATH || DEFAULT_PATH;
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-2";

export function parseAuthenticSakDocument(filePath: string): ParsedChunk[] {
  const md = readFileSync(filePath, "utf8");

  const bab1Idx = md.indexOf("###### **BAB 1**");
  const dkIdx = md.indexOf("###### **DASAR KESIMPULAN**");
  const body = md.slice(bab1Idx, dkIdx);

  // Pecah per Bab
  const babRegex = /######\s*\*\*BAB\s+(\d+)\*\*\s*[\r\n]+######\s*\*\*([^\*]+)\*\*/gi;
  const babStarts: Array<{ bab: number; babTitle: string; matchIndex: number; start: number; end: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = babRegex.exec(body)) !== null) {
    babStarts.push({
      bab: parseInt(m[1], 10),
      babTitle: m[2].trim(),
      matchIndex: m.index,
      start: m.index + m[0].length,
      end: 0,
    });
  }

  for (let i = 0; i < babStarts.length; i++) {
    babStarts[i].end = babStarts[i + 1] ? babStarts[i + 1].matchIndex : body.length;
  }

  const allChunks: ParsedChunk[] = [];

  for (const b of babStarts) {
    const babText = body.slice(b.start, b.end).trim();

    // Pecah berdasarkan sub-heading "###### **Sub Judul**"
    const sectionSplitRegex = /(?:^|\n)######\s*\*\*([^\*]+)\*\*\s*\n+/g;
    const sections: Array<{ title: string; content: string }> = [];

    let lastIdx = 0;
    let lastTitle = b.babTitle;
    let sMatch: RegExpExecArray | null;

    while ((sMatch = sectionSplitRegex.exec(babText)) !== null) {
      const textBefore = babText.slice(lastIdx, sMatch.index).trim();
      if (textBefore) {
        sections.push({ title: lastTitle, content: textBefore });
      }
      lastTitle = sMatch[1].trim();
      lastIdx = sMatch.index + sMatch[0].length;
    }

    const remainingText = babText.slice(lastIdx).trim();
    if (remainingText) {
      sections.push({ title: lastTitle, content: remainingText });
    }

    for (const sec of sections) {
      // Bersihkan kebocoran heading bab berikutnya dan buang baris pemisah dash kosong
      const cleanContent = sec.content
        .replace(/[\r\n]+######\s*\**\s*B(?:AB\s+\d+[^\r\n]*)?[\s*]*$/i, "")
        .split("\n")
        .filter((l) => !/^[ \t]*[-•*_—–]+[ \t]*$/.test(l))
        .join("\n")
        .trim();

      // Abaikan jika bagian ini hanya transisi ke bab berikutnya atau kosong
      if (
        !cleanContent ||
        sec.title.startsWith("BAB ") ||
        cleanContent.startsWith("###### **BAB ")
      ) {
        continue;
      }

      // Cari nomor paragraf yang dicakup
      const pNums: string[] = [];
      const pRegex = new RegExp(`(?:^|\\s)(${b.bab}\\.\\d+)\\.`, "g");
      let pMatch: RegExpExecArray | null;
      while ((pMatch = pRegex.exec(cleanContent)) !== null) {
        if (!pNums.includes(pMatch[1])) {
          pNums.push(pMatch[1]);
        }
      }

      let pRange = "";
      if (pNums.length === 1) {
        pRange = pNums[0];
      } else if (pNums.length > 1) {
        pRange = `${pNums[0]}-${pNums[pNums.length - 1]}`;
      }

      allChunks.push({
        bab: b.bab,
        sectionTitle: sec.title,
        paragraphRange: pRange,
        content: cleanContent,
      });
    }
  }

  return allChunks;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("ERROR: GEMINI_API_KEY is not set in environment.");
    process.exit(1);
  }

  if (!existsSync(SAK_PATH)) {
    console.error(`ERROR: File not found at ${SAK_PATH}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`[1/4] Membaca & Mem-parsing dokumen SAK EMKM dari: ${SAK_PATH}`);
  const chunks = parseAuthenticSakDocument(SAK_PATH);
  console.log(`Total chunk semantik resmi: ${chunks.length}`);

  const ai = new GoogleGenAI({ apiKey });

  const preparedChunks: Array<{ section: string; chunkIndex: number; fullContent: string }> = [];
  const babCounters = new Map<number, number>();

  for (const c of chunks) {
    const idx = babCounters.get(c.bab) ?? 0;
    babCounters.set(c.bab, idx + 1);

    const section = `SAK-EMKM-Bab${c.bab}`;
    const pLabel = c.paragraphRange ? ` (Paragraf ${c.paragraphRange})` : "";
    const fullContent = `[SAK EMKM BAB ${c.bab}: ${c.sectionTitle}]${pLabel}\n${c.content}`;

    preparedChunks.push({
      section,
      chunkIndex: idx,
      fullContent,
    });
  }

  console.log(`\n[2/4] Membersihkan database lama & Menghasilkan Embedding (${EMBED_MODEL})...`);
  console.log(`Total embedding yang akan diproses: ${preparedChunks.length}`);

  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM ifrs_chunks WHERE section LIKE 'SAK-EMKM-%'`);

    let embeddedCount = 0;
    for (const chunk of preparedChunks) {
      process.stdout.write(`\rEmbedding chunk ${embeddedCount + 1}/${preparedChunks.length} (${chunk.section} #${chunk.chunkIndex})...`);

      const embRes = await ai.models.embedContent({
        model: EMBED_MODEL,
        contents: [{ role: "user", parts: [{ text: chunk.fullContent }] }],
        config: { outputDimensionality: 768 } as never,
      });

      const embValues = (embRes as unknown as { embeddings?: Array<{ values: number[] }> }).embeddings?.[0]?.values
        ?? (embRes as unknown as { embedding?: { values: number[] } }).embedding?.values;

      if (!embValues || embValues.length !== 768) {
        throw new Error(`Gagal menghasilkan embedding 768 dimensi untuk ${chunk.section} #${chunk.chunkIndex}`);
      }

      await tx.execute(sql`
        INSERT INTO ifrs_chunks (
          section,
          chunk_index,
          content,
          embedding,
          tsv
        ) VALUES (
          ${chunk.section},
          ${String(chunk.chunkIndex)},
          ${chunk.fullContent},
          ${JSON.stringify(embValues)},
          to_tsvector('english', ${chunk.fullContent})
        )
      `);

      embeddedCount++;
    }

    console.log(`\nSemua ${embeddedCount} chunk berhasil disimpan ke ifrs_chunks.`);

    await registerSakSource(tx as never, {
      docId: "SAK-EMKM-2024",
      version: "v2024.1",
      effectiveDate: "2024-01-01",
    });
    console.log(`Sumber resmi SAK-EMKM-2024 v2024.1 berhasil didaftarkan ke sak_sources.`);
  });

  console.log(`\n[5/5] Selesai! Menguji kueri pencarian RAG...`);
  const testQuery = "koreksi kesalahan periode lalu";
  const testEmbRes = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: [{ role: "user", parts: [{ text: testQuery }] }],
    config: { outputDimensionality: 768 } as never,
  });
  const testEmb = (testEmbRes as unknown as { embeddings?: Array<{ values: number[] }> }).embeddings?.[0]?.values
    ?? (testEmbRes as unknown as { embedding?: { values: number[] } }).embedding?.values;

  const { hybridSearch } = await import("@/server/db/repos/rag-search");
  const hits = await hybridSearch("00000000-0000-0000-0000-000000000000", testEmb!, testQuery, 3);

  console.log(`\nHasil pengujian RAG untuk '${testQuery}':`);
  hits.forEach((h, idx) => {
    console.log(`\nHit #${idx + 1} (Score: ${h.score.toFixed(4)}, Section: ${h.section}):`);
    console.log(h.content.slice(0, 250) + "...");
  });

  console.log(`\n======================================================`);
  console.log(`BERHASIL: SAK EMKM 2024 kini aktif ter-RAG global di Neon DB!`);
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL ERROR:", e);
  process.exit(1);
});
