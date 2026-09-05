import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export interface SakChunkItem {
  id: string;
  section: string;
  chunkIndex: number;
  title: string;
  paragraphRange: string;
  content: string;
}

export interface SakChapter {
  bab: number;
  title: string;
  description: string;
  chunks: SakChunkItem[];
}

export const SAK_BAB_METADATA: Record<number, { title: string; description: string }> = {
  1: {
    title: "Ruang Lingkup",
    description: "Kriteria dan definisi entitas mikro, kecil, dan menengah (EMKM) pengguna standar.",
  },
  2: {
    title: "Konsep dan Prinsip Pervasif",
    description: "Tujuan laporan keuangan, posisi keuangan, kinerja, pengakuan akrual, dan biaya historis.",
  },
  3: {
    title: "Penyajian Laporan Keuangan",
    description: "Penyajian wajar, kepatuhan SAK, kelangsungan usaha, dan komponen lengkap laporan keuangan.",
  },
  4: {
    title: "Laporan Posisi Keuangan",
    description: "Klasifikasi aset, liabilitas, dan ekuitas serta pos-pos minimal neraca.",
  },
  5: {
    title: "Laporan Laba Rugi",
    description: "Penyajian pendapatan, beban keuangan, beban pajak, dan laba/rugi neto.",
  },
  6: {
    title: "Catatan atas Laporan Keuangan (CALK)",
    description: "Penjelasan kebijakan akuntansi, informasi tambahan, dan rincian pos laporan keuangan.",
  },
  7: {
    title: "Kebijakan Akuntansi, Estimasi, dan Kesalahan",
    description: "Panduan pemilihan kebijakan akuntansi, perubahan estimasi, dan koreksi kesalahan periode lalu.",
  },
  8: {
    title: "Aset dan Liabilitas Keuangan",
    description: "Pengakuan dan pengukuran kas, piutang, pinjaman, dan utang usaha pada biaya perolehan.",
  },
  9: {
    title: "Persediaan",
    description: "Pengukuran persediaan sebesar biaya perolehan (FIFO atau Rata-Rata Tertimbang).",
  },
  10: {
    title: "Investasi pada Ventura Bersama",
    description: "Pencatatan ventura bersama dengan metode biaya perolehan.",
  },
  11: {
    title: "Aset Tetap",
    description: "Pengakuan aset tetap, penyusutan (Garis Lurus / Saldo Menurun), pelepasan, dan penghentian.",
  },
  12: {
    title: "Aset Takberwujud",
    description: "Pengakuan aset takberwujud yang diperoleh, amortisasi, dan umur manfaat.",
  },
  13: {
    title: "Liabilitas dan Ekuitas",
    description: "Pembedaan kewajiban masa kini dan hak residual pemilik atas aset entitas.",
  },
  14: {
    title: "Pendapatan dan Beban",
    description: "Pengakuan penjualan barang/jasa, bunga, royalti, dividen, dan beban operasional.",
  },
  15: {
    title: "Pajak Penghasilan",
    description: "Pengakuan kewajiban pajak kini sesuai peraturan perpajakan yang berlaku di Indonesia.",
  },
  16: {
    title: "Transaksi dalam Mata Uang Asing",
    description: "Pencatatan transaksi valas pada kurs spot tanggal transaksi dan pelaporan akhir periode.",
  },
  17: {
    title: "Ketentuan Transisi",
    description: "Penerapan pertama kali SAK EMKM secara retrospektif atau prospektif yang diperkenankan.",
  },
  18: {
    title: "Tanggal Efektif",
    description: "Masa berlaku efektif SAK Indonesia untuk EMKM sejak 1 Januari 2024.",
  },
};

export function sanitizeChunkContent(raw: string): string {
  if (!raw) return "";

  // 1. Buang kebocoran judul bab berikutnya di akhir teks (misal: "\n\n###### **BAB 5**" atau "\n\n###### **B...")
  let cleaned = raw.replace(/[\r\n]+######\s*\**\s*B(?:AB\s+\d+[^\r\n]*)?[\s*]*$/i, "");

  // 2. Buang baris-baris pemisah kosong atau tanda hubung sendirian di awal/tengah
  const lines = cleaned.split("\n");
  const filteredLines: string[] = [];
  for (const l of lines) {
    // Abaikan jika baris hanya tanda minus/bullet tanpa karakter alfanumerik
    if (/^[ \t]*[-•*_—–]+[ \t]*$/.test(l)) {
      continue;
    }
    filteredLines.push(l);
  }

  return filteredLines.join("\n").trim();
}

export function parseSakChunkContent(rawContent: string): { title: string; paragraphRange: string; content: string } {
  // Format khas: "[SAK EMKM BAB X: Judul Topik] (Paragraf Y.Z)\nIsi Aturan..."
  const headerMatch = /^\[SAK EMKM BAB \d+:\s*([^\]]+)\]\s*(?:\((Paragraf [^\)]+)\))?\s*[\r\n]+([\s\S]*)$/i.exec(rawContent.trim());
  if (headerMatch) {
    const rawBody = headerMatch[3]?.trim() || rawContent;
    return {
      title: headerMatch[1]?.trim() || "Aturan SAK",
      paragraphRange: headerMatch[2]?.trim() || "",
      content: sanitizeChunkContent(rawBody),
    };
  }

  // Fallback jika tidak sesuai pola ketat
  const lines = rawContent.split("\n");
  const firstLine = lines[0] ?? "";
  const rest = lines.slice(1).join("\n").trim();
  return {
    title: firstLine.replace(/[\[\]]/g, ""),
    paragraphRange: "",
    content: sanitizeChunkContent(rest || rawContent),
  };
}

export async function getAllSakChapters(): Promise<SakChapter[]> {
  const res = await db.execute(sql`
    SELECT id, section, chunk_index, content
    FROM ifrs_chunks
    WHERE section LIKE 'SAK-EMKM-Bab%'
    ORDER BY
      NULLIF(regexp_replace(section, '\\D', '', 'g'), '')::int,
      chunk_index::int
  `);

  const rows = (res as unknown as {
    rows: Array<{ id: string; section: string; chunk_index: string; content: string }>;
  }).rows ?? [];

  const chaptersMap = new Map<number, SakChunkItem[]>();

  for (const row of rows) {
    const babNumMatch = /SAK-EMKM-Bab(\d+)/i.exec(row.section);
    if (!babNumMatch) continue;
    const babNum = parseInt(babNumMatch[1], 10);

    const parsed = parseSakChunkContent(row.content);
    const item: SakChunkItem = {
      id: row.id,
      section: row.section,
      chunkIndex: parseInt(row.chunk_index, 10) || 0,
      title: parsed.title,
      paragraphRange: parsed.paragraphRange,
      content: parsed.content,
    };

    if (!chaptersMap.has(babNum)) {
      chaptersMap.set(babNum, []);
    }
    chaptersMap.get(babNum)!.push(item);
  }

  const result: SakChapter[] = [];
  for (let b = 1; b <= 18; b++) {
    const meta = SAK_BAB_METADATA[b] ?? { title: `Bab ${b}`, description: "" };
    const chunks = chaptersMap.get(b) ?? [];
    result.push({
      bab: b,
      title: meta.title,
      description: meta.description,
      chunks,
    });
  }

  return result;
}

export async function getSakChapterByBab(babNumber: number): Promise<SakChapter | null> {
  const section = `SAK-EMKM-Bab${babNumber}`;
  const res = await db.execute(sql`
    SELECT id, section, chunk_index, content
    FROM ifrs_chunks
    WHERE section = ${section}
    ORDER BY chunk_index::int
  `);

  const rows = (res as unknown as {
    rows: Array<{ id: string; section: string; chunk_index: string; content: string }>;
  }).rows ?? [];

  const meta = SAK_BAB_METADATA[babNumber];
  if (!meta && rows.length === 0) return null;

  const chunks: SakChunkItem[] = rows.map((r) => {
    const parsed = parseSakChunkContent(r.content);
    return {
      id: r.id,
      section: r.section,
      chunkIndex: parseInt(r.chunk_index, 10) || 0,
      title: parsed.title,
      paragraphRange: parsed.paragraphRange,
      content: parsed.content,
    };
  });

  return {
    bab: babNumber,
    title: meta?.title || `Bab ${babNumber}`,
    description: meta?.description || "",
    chunks,
  };
}

export interface SakSearchResult {
  id: string;
  bab: number;
  babTitle: string;
  sectionTitle: string;
  paragraphRange: string;
  snippet: string;
  href: string;
}

export async function searchSakDocs(term: string, limit = 5): Promise<SakSearchResult[]> {
  const q = term.trim().toLowerCase();
  if (!q || q.length < 2) return [];

  const results: SakSearchResult[] = [];
  const seenBabs = new Set<number>();

  // 1. Cek kecocokan di metadata Bab (Judul / Deskripsi Bab)
  for (let b = 1; b <= 18; b++) {
    const meta = SAK_BAB_METADATA[b];
    if (!meta) continue;
    const babStr = `bab ${b}`;
    if (
      meta.title.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q) ||
      babStr.includes(q) ||
      `bab${b}`.includes(q)
    ) {
      results.push({
        id: `sak-bab-${b}`,
        bab: b,
        babTitle: meta.title,
        sectionTitle: `Bab ${b}: ${meta.title}`,
        paragraphRange: "",
        snippet: meta.description,
        href: `/aturan?bab=${b}`,
      });
      seenBabs.add(b);
      if (results.length >= limit) return results;
    }
  }

  // 2. Cari di ifrs_chunks melalui ILIKE
  const likePattern = `%${term.trim()}%`;
  const res = await db.execute(sql`
    SELECT id, section, chunk_index, content
    FROM ifrs_chunks
    WHERE section LIKE 'SAK-EMKM-Bab%'
      AND content ILIKE ${likePattern}
    ORDER BY NULLIF(regexp_replace(section, '\\D', '', 'g'), '')::int, chunk_index::int
    LIMIT ${limit * 2}
  `);

  const rows = (res as unknown as {
    rows: Array<{ id: string; section: string; chunk_index: string; content: string }>;
  }).rows ?? [];

  for (const row of rows) {
    if (results.length >= limit) break;

    const babNumMatch = /SAK-EMKM-Bab(\d+)/i.exec(row.section);
    if (!babNumMatch) continue;
    const babNum = parseInt(babNumMatch[1], 10);

    const parsed = parseSakChunkContent(row.content);
    const meta = SAK_BAB_METADATA[babNum];
    const babTitle = meta?.title ?? `Bab ${babNum}`;

    // Cari snippet teks di sekitar kata kunci
    const lowerContent = parsed.content.toLowerCase();
    const matchIdx = lowerContent.indexOf(q);
    let snippet = "";
    if (matchIdx !== -1) {
      const start = Math.max(0, matchIdx - 40);
      const end = Math.min(parsed.content.length, matchIdx + q.length + 80);
      snippet = (start > 0 ? "..." : "") + parsed.content.slice(start, end).trim() + (end < parsed.content.length ? "..." : "");
    } else {
      snippet = parsed.content.slice(0, 110) + "...";
    }

    results.push({
      id: `sak-chunk-${row.id}`,
      bab: babNum,
      babTitle,
      sectionTitle: parsed.title,
      paragraphRange: parsed.paragraphRange,
      snippet: snippet.replace(/\n+/g, " "),
      href: `/aturan?bab=${babNum}`,
    });
  }

  return results.slice(0, limit);
}

