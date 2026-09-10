import { GoogleGenAI } from "@google/genai";
import { chatModel } from "./models";

export const DEFAULT_THREAD_TITLE = "Percakapan Baru";

/** Heuristik judul awal (dipakai saat thread dibuat + fallback bila AI gagal). */
export function generateSmartTitle(prompt: string): string {
  if (!prompt) return DEFAULT_THREAD_TITLE;
  const clean = prompt
    .replace(/^(tolong|mohon|bisa|coba|tolong buatkan|catat transaksi|tampilkan|apakah|bagaimana|cek|lihat)\s+/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();

  const words = clean.split(/\s+/).slice(0, 3);
  if (words.length === 0 || !words[0]) return DEFAULT_THREAD_TITLE;

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Judul sesi dari Gemini (gemini-3.5-flash-lite via chatModel()) berbasis
 * konteks awal percakapan. Fail-silent ke heuristik — penamaan tidak boleh
 * menggagalkan chat. AI_MOCK=1 selalu heuristik (deterministik untuk e2e).
 */
export async function generateThreadTitle(
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  const fallback = generateSmartTitle(firstUser);
  if (process.env.AI_MOCK === "1") return fallback;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return fallback;
    const ai = new GoogleGenAI({ apiKey });
    const context = messages
      .slice(0, 8)
      .map((m) => `${m.role}: ${m.content.slice(0, 300)}`)
      .join("\n");
    const interaction = await ai.interactions.create({
      model: chatModel(),
      input: `Buatkan judul singkat (maksimal 5 kata, Bahasa Indonesia, tanpa tanda kutip, tanpa penjelasan tambahan) untuk sesi percakapan asisten akuntansi berikut:\n${context}`,
      store: false,
    });
    const raw = (interaction.output_text ?? "")
      .trim()
      .replace(/^["'“”]+|["'“”.,;:!?]+$/g, "")
      .trim();
    if (!raw) return fallback;
    return raw.split(/\s+/).slice(0, 6).join(" ") || fallback;
  } catch {
    return fallback;
  }
}
