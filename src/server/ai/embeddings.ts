import { GoogleGenAI } from "@google/genai";

const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-2";

export async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: { outputDimensionality: 768 } as never,
  });
  const values = (res as unknown as { embeddings?: Array<{ values: number[] }> }).embeddings?.[0]?.values
    ?? (res as unknown as { embedding?: { values: number[] } }).embedding?.values;
  if (!values) throw new Error("AI_TIDAK_TERSEDIA");
  return values;
}
