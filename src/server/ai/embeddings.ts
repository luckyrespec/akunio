import { GoogleGenAI } from "@google/genai";

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding";

function hashToVector(text: string, dim = 768): number[] {
  // Deterministic mock: hash text into 768 floats in [-1, 1]
  const vec: number[] = new Array(dim);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let seed = h >>> 0;
  for (let i = 0; i < dim; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    vec[i] = (seed / 0xffffffff) * 2 - 1;
  }
  // Normalize to unit length for cosine
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}

export async function embed(text: string): Promise<number[]> {
  if (process.env.AI_MOCK === "1") {
    return hashToVector(text);
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
  });
  const values = (res as unknown as { embeddings?: Array<{ values: number[] }> }).embeddings?.[0]?.values
    ?? (res as unknown as { embedding?: { values: number[] } }).embedding?.values;
  if (!values) throw new Error("AI_TIDAK_TERSEDIA");
  return values;
}
