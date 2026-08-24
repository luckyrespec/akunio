import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { embed } from "./embeddings";
import { hybridSearch } from "@/server/db/repos/rag-search";
import { addMessage, listMessages, checkAdvisorQuota } from "@/server/db/repos/chat.repo";
import { GoogleGenAI } from "@google/genai";

export interface Citation {
  kind: string;
  ref: string;
  excerpt: string;
  score: number;
  section?: string;
}

export interface AskAdvisorResult {
  answer: string;
  citations: Citation[];
  suggestedDraft?: unknown;
}

export async function askAdvisor(
  orgId: string,
  threadId: string,
  question: string,
): Promise<AskAdvisorResult> {
  // Quota check
  const quota = await checkAdvisorQuota(db, orgId);
  if (!quota.allowed) throw new Error(quota.message ?? "Kuota habis");

  // Save user message
  await db.transaction((tx) => addMessage(tx, threadId, "user", question, null));

  // Embed question
  const queryEmbedding = await embed(question);

  // Hybrid search
  const hits = await hybridSearch(orgId, queryEmbedding, question, 6);

  // Live numbers (saldo kas, laba YTD) — same as Dasbor
  let liveNumbers = "";
  try {
    const year = new Date().getFullYear();
    const yearEndISO = `${year}-12-31`;
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const metas = reportMetaMap(accRows);
    const cashLines = await postedLinesThrough(db, orgId, yearEndISO);
    const aggs = aggregateFromLines(cashLines, metas);
    const cashMinor = aggs
      .filter((a) => a.meta.isCash || a.meta.isBank)
      .reduce((s, a) => s + signed(a.meta, a), 0n);
    const ytd = incomeStatement(aggs);
    const { Money } = await import("@/core/money/money");
    liveNumbers = `Saldo Kas & Bank: ${Money.fromMinor(cashMinor).formatIdr()}, Laba Tahun Ini: ${Money.fromMinor(ytd.netIncomeMinor).formatIdr()}.`;
  } catch {
    liveNumbers = "";
  }

  // Build context
  const context = hits.map((h, i) => `[${i + 1}] (${h.kind}) ${h.excerpt}`).join("\n");
  const history = await listMessages(db, threadId);
  const lastMessages = history.slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n");

  let answer: string;
  let citations: Citation[] = hits.map((h) => ({
    kind: h.kind,
    ref: h.id,
    excerpt: h.excerpt,
    score: h.score,
    section: h.section,
  }));
  let suggestedDraft: unknown | undefined;

  if (process.env.AI_MOCK === "1") {
    answer = `Jawaban mock untuk: ${question}. ${liveNumbers}`;
    // Mock provides 2 citations deterministically
    citations = citations.slice(0, 2);
    // If question asks for correction, provide a mock suggested draft
    if (question.toLowerCase().includes("koreksi") || question.toLowerCase().includes("perbaiki")) {
      suggestedDraft = {
        dateISO: new Date().toISOString().slice(0, 10),
        memo: "Koreksi usulan advisor",
        lines: [
          { accountCode: "1110", debitText: "100.000", creditText: "", confidence: 0.8, reason: "Koreksi" },
          { accountCode: "4100", debitText: "", creditText: "100.000", confidence: 0.8, reason: "Koreksi" },
        ],
        overallConfidence: 0.85,
        explanation: "Draft koreksi mock",
      };
    }
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Anda adalah advisor akuntansi untuk UMKM Indonesia (IFRS untuk SME).
Jawab singkat dalam Bahasa Indonesia, kutip sumber [IFRS §…] untuk aturan dan [Jurnal JE-…] untuk angka.
Jangan halusinasi angka.

Konteks angka live: ${liveNumbers}
Konteks dokumen:
${context}

Riwayat:
${lastMessages}

Pertanyaan: ${question}`;

    const interaction = await ai.interactions.create({
      model: process.env.GEMINI_MODEL ?? "gemini-3.5-flash",
      input: [{ type: "user_input", content: [{ type: "text", text: prompt }] } as never],
      store: false,
    });
    answer = interaction.output_text ?? "Maaf, tidak ada jawaban.";
    // Try to parse suggestedDraft if present (look for JSON block)
    try {
      const jsonMatch = answer.match(/\{[\s\S]*"suggestedDraft"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.suggestedDraft) suggestedDraft = parsed.suggestedDraft;
      }
    } catch {}
  }

  // Save assistant message
  await db.transaction((tx) =>
    addMessage(tx, threadId, "assistant", answer, citations),
  );

  return { answer, citations, suggestedDraft };
}
