import { GoogleGenAI } from "@google/genai";
import { DraftEntrySchema, draftJsonSchema, type DraftEntry } from "./schema";
import { buildDraftPrompt, type PromptAccount } from "./prompt";
import { STORE_INTERACTIONS } from "./interaction-memory";
import { getGeminiModel } from "./models";

const MAX_RETRIES = 2;

export interface GenerateDraftInput {
  kind: "TEXT" | "DOCUMENT";
  text?: string;
  document?: { dataBase64: string; mime: string };
  accounts: PromptAccount[];
  todayISO: string;
}

function parseDraft(raw: string): DraftEntry {
  const obj = JSON.parse(raw) as Record<string, unknown>;
  if (Array.isArray(obj.lines)) {
    obj.lines = (obj.lines as Array<Record<string, unknown>>).map((l) => ({
      ...l,
      debitText: l.debitText === "0" || l.debitText === 0 ? "" : String(l.debitText ?? ""),
      creditText: l.creditText === "0" || l.creditText === 0 ? "" : String(l.creditText ?? ""),
    }));
  }
  return DraftEntrySchema.parse(obj);
}

// Interactions content blocks (public Content type is the legacy one).
type GenaiContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "document"; data: string; mime_type: string };

async function callGemini(input: GenerateDraftInput): Promise<DraftEntry> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildDraftPrompt({
    accounts: input.accounts,
    todayISO: input.todayISO,
    text: input.text ?? "",
  });

  const content: GenaiContent[] = [{ type: "text", text: prompt }];
  if (input.kind === "DOCUMENT" && input.document) {
    const type = input.document.mime === "application/pdf" ? "document" : "image";
    content.push({
      type,
      data: input.document.dataBase64,
      mime_type: input.document.mime,
    } as GenaiContent);
  }
  // Interactions API input shape; the SDK keeps Step/Content internal, so the
  // typed boundary is cast at this single call site (structure per docs).
  const inputSteps = [{ type: "user_input", content: content as never }] as never;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const interaction = await ai.interactions.create({
        model: getGeminiModel(),
        input: inputSteps,
        store: STORE_INTERACTIONS, // retensi 55 hari (berbayar) / 1 hari (gratis); memungkinkan chaining
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: draftJsonSchema,
        },
      });
      return parseDraft(interaction.output_text ?? "");
    } catch (e) {
      lastError = e;
      console.warn(`draft attempt ${attempt + 1} failed, retrying:`, (e as Error).message);
    }
  }
  console.error("draft generation failed after retries:", lastError);
  throw new Error("AI_TIDAK_TERSEDIA");
}

export async function generateJournalDraft(input: GenerateDraftInput): Promise<DraftEntry> {
  return callGemini(input);
}
