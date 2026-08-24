import { GoogleGenAI } from "@google/genai";
import { DraftEntrySchema, draftJsonSchema, type DraftEntry } from "./schema";
import { buildDraftPrompt, type PromptAccount } from "./prompt";
import { MOCK_TEXT_DRAFT, MOCK_DOCUMENT_DRAFT } from "./fixtures";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

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
            debitText: { type: "string", description: "Nominal debit format Indonesia, kosong jika nol" },
            creditText: { type: "string", description: "Nominal kredit format Indonesia, kosong jika nol" },
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
}

export interface JournalChatResult {
  answer: string;
  draft?: DraftEntry;
  functionCalled: boolean;
}

function parseDraftFromToolArgs(args: unknown): DraftEntry {
  const withDefaults = {
    dateISO: new Date().toISOString().slice(0, 10),
    overallConfidence: 0.85,
    ...(args as Record<string, unknown>),
  };
  return DraftEntrySchema.parse(withDefaults);
}

export async function journalChat(input: JournalChatInput): Promise<JournalChatResult> {
  if (process.env.AI_MOCK === "1") {
    const draft = input.document ? MOCK_DOCUMENT_DRAFT : MOCK_TEXT_DRAFT;
    // Simple mock: if message contains "jurnal" or attachment, pretend function was called
    const shouldCall = /jurnal|buat|catat|faktur|kwitansi/i.test(input.message) || !!input.document;
    if (shouldCall) {
      return {
        answer: `Draft jurnal berhasil dibuat dari: "${input.message}". Silakan review di bawah dan posting jika sudah sesuai.`,
        draft,
        functionCalled: true,
      };
    }
    return {
      answer: `Halo! Saya asisten jurnal. Kirim deskripsi transaksi atau foto faktur, saya akan buatkan draft untuk Anda.`,
      functionCalled: false,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = buildDraftPrompt({
    accounts: input.accounts,
    todayISO: input.todayISO,
    text: "Konteks untuk chat jurnal",
  });

  const historyText = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const userContent: GenaiContent[] = [
    { type: "text", text: `${systemPrompt}\n\nRiwayat:\n${historyText}\n\nPesan user: ${input.message}` },
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

  const interaction = await ai.interactions.create({
    model: MODEL,
    input: inputSteps,
    store: false,
    tools: [createJournalDraftTool as never],
  });

  // Look for function call in steps
  const steps = (interaction as unknown as { steps?: Array<{ type: string; name?: string; arguments?: unknown }> }).steps ?? [];
  const call = steps.find((s) => s.type === "function_call" && s.name === "create_journal_draft");
  if (call) {
    const draft = parseDraftFromToolArgs(call.arguments);
    return {
      answer: `Draft jurnal untuk "${input.message}" berhasil disusun. Silakan tinjau dan posting.`,
      draft,
      functionCalled: true,
    };
  }

  // Fallback: try structured output as before, or plain text
  const text = (interaction as unknown as { output_text?: string }).output_text ?? "";
  // Try to parse as DraftEntry JSON if it looks like one
  try {
    const parsed = DraftEntrySchema.parse(JSON.parse(text));
    return { answer: parsed.explanation, draft: parsed, functionCalled: true };
  } catch {
    return { answer: text || "Maaf, saya tidak bisa memproses permintaan tersebut.", functionCalled: false };
  }
}
