import { GoogleGenAI } from "@google/genai";
import {
  CorrectionNarrationSchema,
  type CorrectionNarration,
} from "@/server/doctor/citations";
import { STORE_INTERACTIONS } from "./interaction-memory";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite"; // never legacy 2.5/2.0/1.5
const MAX_RETRIES = 2;

export interface SakChunk {
  id: string;
  section: string;
  content: string;
}

export interface GenerateNarrationInput {
  findingType: string;
  frameSummary: string;
  chunks: SakChunk[];
  docId: string;
}

// JSON Schema for Interactions response_format (hand-written mirror of
// CorrectionNarrationSchema — narasi sendiri, bukan DraftEntry).
const narrationJsonSchema = {
  type: "object",
  properties: {
    explanation: {
      type: "string",
      description: "Penjelasan koreksi untuk pengguna, Bahasa Indonesia, 2-4 kalimat",
    },
    citations: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          docId: { type: "string", description: "ID dokumen SAK yang dikutip" },
          bab: { type: "string", description: "Nomor bab SAK EMKM, mis. 7" },
          paragraph: { type: "string", description: "Nomor paragraf, mis. 7.16" },
        },
        required: ["docId", "bab", "paragraph"],
      },
    },
  },
  required: ["explanation", "citations"],
} as const;

// Ambil angka bab dari section chunk (mis. "SAK-EMKM-Bab7" -> "7") agar
// sitasi deterministik lolos validateCitations.
function extractBab(section: string): string {
  const m = section.match(/bab\s*([0-9]+)/i) ?? section.match(/([0-9]+)/);
  return m ? m[1] : section;
}

function deterministicNarration(input: GenerateNarrationInput): CorrectionNarration {
  const first = input.chunks[0];
  return CorrectionNarrationSchema.parse({
    explanation:
      `Untuk temuan ${input.findingType}, lakukan ${input.frameSummary} ` +
      `sesuai ${first.section}. Rujukannya tercatat pada dokumen ${input.docId} ` +
      `dan angka pada ringkasan tidak diubah.`,
    citations: [{ docId: input.docId, bab: extractBab(first.section), paragraph: "mock" }],
  });
}

function buildNarratorPrompt(input: GenerateNarrationInput): string {
  const validSections = input.chunks.map((c) => `- ${c.section}`).join("\n");
  const context = input.chunks.map((c) => `[${c.section}]\n${c.content}`).join("\n\n");
  return [
    "Jelaskan koreksi pembukuan berikut dalam Bahasa Indonesia, 2-4 kalimat.",
    `Jenis temuan: ${input.findingType}.`,
    `Ringkasan koreksi (tekstual, angkanya DILARANG diubah): ${input.frameSummary}.`,
    "Sitasi HANYA memakai pasangan (docId, Bab, paragraf) dari chunk berikut; " +
      `docId wajib "${input.docId}". Daftar section valid:`,
    validSections,
    "Konteks SAK EMKM:",
    context,
  ].join("\n");
}

type GenaiContent = { type: "text"; text: string };

async function callGeminiNarration(input: GenerateNarrationInput): Promise<CorrectionNarration> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildNarratorPrompt(input);
  const content: GenaiContent[] = [{ type: "text", text: prompt }];
  // Interactions API input shape; the SDK keeps Step/Content internal, so the
  // typed boundary is cast at this single call site (structure per docs).
  const inputSteps = [{ type: "user_input", content: content as never }] as never;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const interaction = await ai.interactions.create({
        model: MODEL,
        input: inputSteps,
        store: STORE_INTERACTIONS, // retensi 55 hari (berbayar) / 1 hari (gratis); memungkinkan chaining
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: narrationJsonSchema,
        },
      });
      return CorrectionNarrationSchema.parse(JSON.parse(interaction.output_text ?? ""));
    } catch (e) {
      lastError = e;
      console.warn(`narration attempt ${attempt + 1} failed, retrying:`, (e as Error).message);
    }
  }
  console.error("narration generation failed after retries:", lastError);
  throw new Error("AI_TIDAK_TERSEDIA");
}

export async function generateCorrectionNarration(
  input: GenerateNarrationInput,
): Promise<CorrectionNarration> {
  if (input.chunks.length === 0) throw new Error("SAK_TIDAK_TERSEDIA");
  // Narator tak menerima nominal — hanya frameSummary tekstual; tanpa API key
  // (atau AI_MOCK=1) kembalikan narasi deterministik dari chunk pertama
  // (sitasi terisi agar lolos validator, bukan citations kosong).
  if (process.env.AI_MOCK === "1" || !process.env.GEMINI_API_KEY) {
    return deterministicNarration(input);
  }
  return callGeminiNarration(input);
}
