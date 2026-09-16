import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { getGeminiModel } from "./models";
import { getSakChapterByBab } from "@/server/db/repos/sak-docs.repo";

const MAX_RETRIES = 2;
/** SAK EMKM Bab 12 = Aset Takberwujud. */
const SAK_INTANGIBLE_BAB = 12;
/** Batas konteks RAG agar prompt tetap ramping. */
const MAX_CONTEXT_CHARS = 8000;

export type IntangibleCategory =
  | "LISENSI_SOFTWARE"
  | "HAK_CIPTA"
  | "PATEN"
  | "MEREK_DAGANG"
  | "GOODWILL"
  | "LAINNYA";

export interface IntangibleSakRecommendation {
  category: IntangibleCategory;
  usefulLifeMonths: number;
  analysis: string;
  sakRef: string;
  /** true bila berasal dari heuristik luring (AI tak tersedia atau gagal). */
  heuristic: boolean;
}

const RecommendationSchema = z.object({
  category: z.enum(["LISENSI_SOFTWARE", "HAK_CIPTA", "PATEN", "MEREK_DAGANG", "GOODWILL", "LAINNYA"]),
  usefulLifeMonths: z.number().int().min(1).max(600),
  analysis: z.string().min(1),
});

const recommendationJsonSchema = {
  type: "object",
  properties: {
    category: {
      type: "string",
      enum: ["LISENSI_SOFTWARE", "HAK_CIPTA", "PATEN", "MEREK_DAGANG", "GOODWILL", "LAINNYA"],
      description: "Kategori aset takberwujud SAK EMKM yang paling sesuai",
    },
    usefulLifeMonths: {
      type: "number",
      description: "Estimasi masa manfaat dalam bulan (jangkar: lisensi ikut masa berlaku, software ~48, merek ~120)",
    },
    analysis: {
      type: "string",
      description: "Analisis 2-4 kalimat Bahasa Indonesia: alasan kategori, masa manfaat, dan rujukan Bab 12",
    },
  },
  required: ["category", "usefulLifeMonths", "analysis"],
} as const;

const KEYWORDS: Array<{ category: IntangibleCategory; months: number; words: string[] }> = [
  { category: "LISENSI_SOFTWARE", months: 48, words: ["lisensi", "software", "aplikasi", "subs", "saas"] },
  { category: "HAK_CIPTA", months: 60, words: ["cipta", "buku", "lagu", "film", "karya"] },
  { category: "PATEN", months: 120, words: ["paten"] },
  { category: "MEREK_DAGANG", months: 120, words: ["merek", "brand", "logo", "trademark"] },
  { category: "GOODWILL", months: 60, words: ["goodwill"] },
];

function heuristicCategory(name: string): { category: IntangibleCategory; months: number } {
  const lower = name.toLowerCase();
  for (const k of KEYWORDS) {
    if (k.words.some((w) => lower.includes(w))) return { category: k.category, months: k.months };
  }
  return { category: "LAINNYA", months: 60 };
}

async function loadSakContext(): Promise<string> {
  try {
    const chapter = await getSakChapterByBab(SAK_INTANGIBLE_BAB);
    if (!chapter || chapter.chunks.length === 0) return "";
    const text = chapter.chunks
      .map((c) => `[${c.title}${c.paragraphRange ? ` (${c.paragraphRange})` : ""}]\n${c.content}`)
      .join("\n\n");
    return text.slice(0, MAX_CONTEXT_CHARS);
  } catch (e) {
    console.warn("intangible-recommend RAG gagal, lanjut tanpa konteks:", (e as Error).message);
    return "";
  }
}

function buildPrompt(name: string, userCategory: string, sakContext: string): string {
  return `Anda adalah penasihat aset takberwujud SAK EMKM untuk UMKM Indonesia di aplikasi Akunio.

Aset: "${name}"
Kategori pilihan pengguna: ${userCategory} (boleh dikoreksi bila jelas keliru)

${sakContext ? `Konteks SAK EMKM Bab 12 — Aset Takberwujud:\n${sakContext}\n` : "Konteks Bab 12 tidak tersedia — jawab dari ketentuan umum SAK EMKM tentang aset takberwujud.\n"}
Tugas: tentukan kategori (LISENSI_SOFTWARE/HAK_CIPTA/PATEN/MEREK_DAGANG/GOODWILL/LAINNYA) dan estimasi masa manfaat bulan yang wajar untuk UMKM. Amortisasi selalu garis lurus; lisensi mengikuti masa berlaku kontrak.

Aturan:
- Bahasa Indonesia. Kembalikan JSON valid sesuai schema, hanya itu.
- analysis 2-4 kalimat: alasan kategori, masa manfaat, dan rujukan eksplisit ke SAK EMKM Bab 12.
- Jangan halusinasi nomor paragraf spesifik bila konteks tidak menyebutkannya; rujuk "Bab 12" saja.`;
}

function heuristicFallback(name: string): IntangibleSakRecommendation {
  const { category, months } = heuristicCategory(name);
  return {
    category,
    usefulLifeMonths: months,
    analysis:
      "Mode luring (AI tidak tersedia): nama mengarah ke kategori tersebut menurut pola umum " +
      "SAK EMKM Bab 12 tentang aset takberwujud. Estimasi masa manfaat mengikuti praktik wajar " +
      "dengan amortisasi garis lurus. Sesuaikan manual bila perlu.",
    sakRef: "SAK EMKM Bab 12",
    heuristic: true,
  };
}

async function callGemini(name: string, userCategory: string): Promise<IntangibleSakRecommendation> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const sakContext = await loadSakContext();
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(name, userCategory, sakContext);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const interaction = await ai.interactions.create({
        // Model via models.ts — default gemini-3.5-flash-lite, jangan hardcode.
        model: getGeminiModel(),
        input: [{ type: "user_input", content: [{ type: "text", text: prompt }] } as never],
        store: false,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: recommendationJsonSchema as never,
        },
      } as never);
      const raw =
        (interaction as unknown as { output_text?: string }).output_text ?? "";
      const parsed = RecommendationSchema.parse(JSON.parse(raw));
      return {
        category: parsed.category,
        usefulLifeMonths: Math.min(600, Math.max(1, Math.floor(parsed.usefulLifeMonths))),
        analysis: parsed.analysis,
        sakRef: "SAK EMKM Bab 12",
        heuristic: false,
      };
    } catch (e) {
      lastError = e;
      console.warn(`intangible-recommend attempt ${attempt + 1} failed:`, (e as Error).message);
    }
  }
  console.error("intangible-recommend failed after retries:", lastError);
  throw new Error("AI_TIDAK_TERSEDIA");
}

/**
 * Rekomendasi kategori + masa manfaat via LLM + RAG Bab 12.
 * Tanpa kunci API / AI_MOCK=1 / gagal total → heuristik luring yang jujur.
 */
export async function recommendIntangibleWithSak(
  name: string,
  userCategory: string,
): Promise<IntangibleSakRecommendation> {
  if (process.env.AI_MOCK === "1") return heuristicFallback(name);
  try {
    return await callGemini(name, userCategory);
  } catch (e) {
    if (e instanceof Error && e.message === "AI_TIDAK_TERSEDIA") return heuristicFallback(name);
    throw e;
  }
}
