import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { withOrg } from "@/server/db/repos/with-org";
import { postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { embed } from "./embeddings";
import { hybridSearch } from "@/server/db/repos/rag-search";
import { addMessage, listMessages, checkAdvisorQuota, getThread } from "@/server/db/repos/chat.repo";
import { GoogleGenAI } from "@google/genai";
import { STORE_INTERACTIONS, saveThreadInteractionId } from "./interaction-memory";
import { getGeminiModel } from "./models";

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
  const quota = await withOrg(orgId, (tx) => checkAdvisorQuota(tx, orgId));
  if (!quota.allowed) throw new Error(quota.message ?? "Kuota habis");

  // Save user message
  await withOrg(orgId, (tx) => addMessage(tx, threadId, "user", question, null));

  // Embed question
  const queryEmbedding = await embed(question);

  // Hybrid search — tenant-half lewat tx scope withOrg
  const hits = await withOrg(orgId, (tx) => hybridSearch(orgId, queryEmbedding, question, 6, tx));

  // Live numbers (saldo kas, laba YTD) — same as Dasbor
  let liveNumbers = "";
  try {
    const year = new Date().getFullYear();
    const yearEndISO = `${year}-12-31`;
    const { accRows, cashLines } = await withOrg(orgId, async (tx) => ({
      accRows: await tx.select().from(accounts).where(eq(accounts.orgId, orgId)),
      cashLines: await postedLinesThrough(tx, orgId, yearEndISO),
    }));
    const metas = reportMetaMap(accRows);
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
  const history = await withOrg(orgId, (tx) => listMessages(tx, threadId));
  const lastMessages = history.slice(-12).map((m) => `${m.role}: ${m.content}`).join("\n");
  let previousInteractionId: string | null = null;
  try {
    const tRow = await withOrg(orgId, (tx) => getThread(tx, orgId, threadId));
    previousInteractionId = (tRow as { geminiInteractionId?: string | null } | null)?.geminiInteractionId ?? null;
  } catch {}

  const citations: Citation[] = hits.map((h) => ({
    kind: h.kind,
    ref: h.id,
    excerpt: h.excerpt,
    score: h.score,
    section: h.section,
  }));
  let suggestedDraft: unknown | undefined;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Anda adalah advisor akuntansi untuk UMKM Indonesia (IFRS untuk SME).
Jawab singkat dalam Bahasa Indonesia, kutip sumber [SAK Bab N paragraf X] untuk aturan dan [Jurnal JE-…] untuk angka.
Jangan halusinasi angka.
Rangkai setiap sitasi ke alur kalimat ("Berdasarkan [SAK Bab N paragraf X], ...") — jangan menempel chip telanjang tanpa penjelasan relevansinya.
Bila pertanyaan tak bisa dijawab tanpa konteks kunci yang hilang, tanyakan balik spesifik (maks 2-3) dengan opsi agar tinggal dipilih — jangan menebak.
Jangan pernah membuka jawaban dengan perkenalan diri ("Halo, nama saya Akunio…") — langsung jawab. Perkenalkan diri hanya bila pengguna bertanya siapa kamu.
Rujukan klik: akun/jurnal/barang/aset/kontak/faktur terdaftar ditulis sebagai tautan memakai SALAH SATU protokol ini saja — [Nama (KODE)](akun:KODE), [JE-2026-0004](jurnal:JE-2026-0004), [Nama (KODE)](item:KODE), [Nama (KODE)](aset:KODE), [Nama](kontak:ID), [INV-2026-0001](faktur:INV-2026-0001). Jangan mengarang protokol lain; tanpa kode pasti, tulis teks biasa.
ATURAN KONTEKS (ANTI-LUPA): jika pesan user singkat/konfirmasi ("ok", "catatkan ya") tanpa detail,
ambil detail dari Riwayat di bawah — jangan minta ulang data yang sudah ada.

Konteks angka live: ${liveNumbers}
Konteks dokumen:
${context}

Riwayat:
${lastMessages}

Pertanyaan: ${question}`;

  const interaction = await ai.interactions.create({
    model: getGeminiModel(),
    input: [{ type: "user_input", content: [{ type: "text", text: prompt }] } as never],
    store: STORE_INTERACTIONS,
    ...(previousInteractionId ? { previous_interaction_id: previousInteractionId } : {}),
  });
  const answer = interaction.output_text ?? "Maaf, tidak ada jawaban.";
  try {
    if (interaction.id) await saveThreadInteractionId(orgId, threadId, interaction.id);
  } catch {}
  // Try to parse suggestedDraft if present (look for JSON block)
  try {
    const jsonMatch = answer.match(/\{[\s\S]*"suggestedDraft"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.suggestedDraft) suggestedDraft = parsed.suggestedDraft;
    }
  } catch {}

  // Save assistant message
  await withOrg(orgId, (tx) =>
    addMessage(tx, threadId, "assistant", answer, citations),
  );

  return { answer, citations, suggestedDraft };
}
