import { GoogleGenAI } from "@google/genai";
import { DraftEntrySchema, type DraftEntry } from "./schema";
import { buildDraftPrompt, type PromptAccount } from "./prompt";
import { STORE_INTERACTIONS, isStaleInteractionError } from "./interaction-memory";
import { getGeminiModel } from "./models";

type GenaiContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "document"; data: string; mime_type: string };

const createJournalDraftTool = {
  type: "function",
  name: "create_journal_draft",
  description:
    "Buat draft jurnal dari deskripsi transaksi. Panggil ini ketika user ingin membuat jurnal, baik via teks maupun dokumen terlampir. Draft akan disimpan dan memerlukan persetujuan user sebelum diposting ke buku besar.",
  parameters: {
    type: "object",
    properties: {
      memo: { type: "string", description: "Keterangan jurnal" },
      dateISO: { type: "string", description: "Tanggal YYYY-MM-DD, gunakan hari ini jika tidak disebut" },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            accountCode: { type: "string", description: "Kode akun dari daftar" },
            debitText: { type: "string", description: "Nominal debit format Indonesia, WAJIB string kosong bila nol (jangan '0')" },
            creditText: { type: "string", description: "Nominal kredit format Indonesia, WAJIB string kosong bila nol (jangan '0')" },
            confidence: { type: "number", description: "0 sampai 1" },
            reason: { type: "string", description: "Alasan singkat Bahasa Indonesia" },
          },
          required: ["accountCode", "debitText", "creditText", "confidence", "reason"],
        },
      },
      overallConfidence: { type: "number", description: "Keyakinan keseluruhan 0-1" },
      explanation: { type: "string", description: "Penjelasan draft Bahasa Indonesia" },
    },
    required: ["memo", "lines", "explanation"],
  },
};

export interface JournalChatInput {
  message: string;
  document?: { dataBase64: string; mime: string };
  accounts: PromptAccount[];
  todayISO: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  previousInteractionId?: string | null;
}

export interface JournalChatResult {
  answer: string;
  draft?: DraftEntry;
  functionCalled: boolean;
  /** Id interaksi baru untuk chaining turn berikutnya (disimpan per thread). */
  interactionId?: string;
}

function parseDraftFromToolArgs(args: unknown): DraftEntry {
  const raw = args as Record<string, unknown>;
  if (Array.isArray(raw.lines)) {
    raw.lines = (raw.lines as Array<Record<string, unknown>>).map((l) => ({
      ...l,
      debitText: l.debitText === "0" || l.debitText === 0 ? "" : String(l.debitText ?? ""),
      creditText: l.creditText === "0" || l.creditText === 0 ? "" : String(l.creditText ?? ""),
    }));
  }
  const withDefaults = {
    dateISO: new Date().toISOString().slice(0, 10),
    overallConfidence: 0.85,
    ...raw,
  };
  return DraftEntrySchema.parse(withDefaults);
}

export async function journalChat(input: JournalChatInput): Promise<JournalChatResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = buildDraftPrompt({
    accounts: input.accounts,
    todayISO: input.todayISO,
    text: "Konteks untuk chat jurnal",
  });

  const historyText = (input.history ?? [])
    .slice(-12)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  // ATURAN KONTEKS: pesan singkat/konfirmasi ("ok catatkan ya") WAJIB diartikan
  // dari Riwayat di atas — jangan minta ulang detail yang sudah ada.
  const userContent: GenaiContent[] = [
    { type: "text", text: `${systemPrompt}\n\nRiwayat:\n${historyText}\n\nAturan: jika pesan user singkat atau hanya konfirmasi, ambil detail (nominal, akun, aset) dari Riwayat. Jangan jawab generik "sebutkan detail".\n\nPesan user: ${input.message}` },
  ];
  if (input.document) {
    const type = input.document.mime === "application/pdf" ? "document" : "image";
    userContent.push({
      type,
      data: input.document.dataBase64,
      mime_type: input.document.mime,
    } as GenaiContent);
  }

  const inputSteps = [{ type: "user_input", content: userContent as never }] as never;

  const baseParams = {
    model: getGeminiModel(),
    input: inputSteps,
    store: STORE_INTERACTIONS,
    tools: [createJournalDraftTool as never],
  };
  let interaction: { steps?: Array<{ type: string; name?: string; arguments?: unknown }>; output_text?: string; id?: string };
  try {
    interaction = (await ai.interactions.create({
      ...baseParams,
      ...(input.previousInteractionId ? { previous_interaction_id: input.previousInteractionId } : {}),
    } as never)) as unknown as typeof interaction;
  } catch (e) {
    // Id basi/kedaluwarsa (retensi gratis 1 hari): ulangi tanpa chaining
    // agar chat tetap jalan; pemanggil menyimpan id baru yang segar.
    if (input.previousInteractionId && isStaleInteractionError(e)) {
      interaction = (await ai.interactions.create({ ...baseParams } as never)) as unknown as typeof interaction;
    } else {
      throw e;
    }
  }
  const interactionId = interaction.id;

  // Look for function call in steps
  const steps = interaction.steps ?? [];
  const call = steps.find((s) => s.type === "function_call" && s.name === "create_journal_draft");
  if (call) {
    const draft = parseDraftFromToolArgs(call.arguments);
    return {
      answer: `Draft jurnal untuk "${input.message}" berhasil disusun. Silakan tinjau dan posting.`,
      draft,
      functionCalled: true,
      interactionId,
    };
  }

  // Fallback: try structured output as before, or plain text
  const text = interaction.output_text ?? "";
  // Try to parse as DraftEntry JSON if it looks like one
  try {
    const parsed = DraftEntrySchema.parse(JSON.parse(text));
    return { answer: parsed.explanation, draft: parsed, functionCalled: true, interactionId };
  } catch {
    return { answer: text || "Maaf, saya tidak bisa memproses permintaan tersebut.", functionCalled: false, interactionId };
  }
}
