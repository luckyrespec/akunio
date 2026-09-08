import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { embed } from "./embeddings";
import { buildAkunioSystemPrompt } from "./persona";
import { formatMemoriesForPrompt } from "./memory-extractor";
import { listMemories } from "@/server/db/repos/assistant-memory.repo";
import { withOrg } from "@/server/db/repos/with-org";
import { hybridSearch } from "@/server/db/repos/rag-search";
import { addMessage, listMessages, checkAssistantQuota, getThread } from "@/server/db/repos/chat.repo";
import { GoogleGenAI } from "@google/genai";
import {
  STORE_INTERACTIONS,
  clearThreadInteractionId,
  isStaleInteractionError,
  saveThreadInteractionId,
} from "./interaction-memory";
import { DraftEntrySchema, type DraftEntry } from "./schema";
import { buildDraftPrompt } from "./prompt";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { resolveDraftAccounts } from "@/core/ai/map-accounts";
import { listEntriesWithLines } from "@/server/db/repos/journals.repo";
import { searchJournals } from "@/server/db/repos/search.repo";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
const ASSISTANT_NAME = process.env.ASSISTANT_NAME ?? "Akunio";

export interface NaraCitation {
  kind: string;
  ref: string;
  excerpt: string;
  score: number;
  section?: string;
}

export interface AskNaraResult {
  answer: string;
  citations: NaraCitation[];
  draft?: DraftEntry & { mapping?: unknown };
  draftId?: string;
  toolResults?: Array<{ tool: string; result: unknown }>;
}

type GenaiContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: string }
  | { type: "document"; data: string; mime_type: string };

// Tool definitions for Akunio — superset of previous copilot+advisor
const createJournalDraftTool = {
  type: "function",
  name: "create_journal_draft",
  description:
    "Buat draft jurnal double-entry dari deskripsi transaksi. WAJIB dipanggil ketika user ingin mencatat, membuat, membukukan transaksi, faktur, kwitansi, nota. Draft akan disimpan sebagai PENDING dan butuh persetujuan user sebelum posting. Jangan auto-posting.",
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
            accountCode: { type: "string", description: "Kode akun dari daftar akun" },
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

const searchJournalsTool = {
  type: "function",
  name: "search_journals",
  description: "Cari jurnal yang sudah diposting berdasarkan kata kunci memo atau nomor. Gunakan untuk menjawab pertanyaan tentang riwayat transaksi.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Kata kunci pencarian memo/nomor" },
      limit: { type: "number", description: "Jumlah hasil maksimal, default 5" },
    },
    required: ["query"],
  },
};

const listAccountsTool = {
  type: "function",
  name: "list_accounts",
  description: "Tampilkan daftar akun (COA) tenant. Gunakan ketika user tanya akun apa saja yang tersedia atau butuh kode akun.",
  parameters: { type: "object", properties: {}, required: [] },
};

const getReportTool = {
  type: "function",
  name: "get_report",
  description: "Ambil ringkasan laporan keuangan: neraca, laba_rugi, arus_kas, perubahan_ekuitas. Gunakan untuk pertanyaan tentang posisi keuangan.",
  parameters: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["neraca", "laba_rugi", "arus_kas", "perubahan_ekuitas"] },
      period: { type: "string", description: "Periode YYYY-MM, kosongkan untuk periode terbaru" },
    },
    required: ["type"],
  },
};

const listDraftsTool = {
  type: "function",
  name: "list_drafts",
  description: "Lihat daftar draft AI (PENDING/ACCEPTED/REJECTED). Gunakan ketika user tanya status draft atau mau review draft.",
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["PENDING", "ACCEPTED", "REJECTED"] },
      limit: { type: "number" },
    },
    required: [],
  },
};

const listJournalsTool = {
  type: "function",
  name: "list_journals",
  description: "Ambil 10 jurnal terbaru yang sudah diposting. Gunakan untuk menampilkan riwayat transaksi umum.",
  parameters: { type: "object", properties: {}, required: [] },
};

const ALL_TOOLS = [
  createJournalDraftTool,
  searchJournalsTool,
  listAccountsTool,
  getReportTool,
  listDraftsTool,
  listJournalsTool,
] as never[];

function parseDraftFromToolArgs(args: unknown): DraftEntry {
  const raw = args as Record<string, unknown>;
  // Normalize "0" to "" for empty side, and ensure strings
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

async function getLiveNumbers(orgId: string): Promise<string> {
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
    return `Saldo Kas & Bank: ${Money.fromMinor(cashMinor).formatIdr()}, Laba Tahun Ini: ${Money.fromMinor(ytd.netIncomeMinor).formatIdr()}.`;
  } catch {
    return "";
  }
}

export async function askNara(
  orgId: string,
  threadId: string,
  question: string,
  opts?: { document?: { dataBase64: string; mime: string } },
): Promise<AskNaraResult> {
  // Unified quota
  const quota = await checkAssistantQuota(db, orgId);
  if (!quota.allowed) throw new Error(quota.message ?? "Kuota habis");

  // Save user message
  await db.transaction((tx) => addMessage(tx, threadId, "user", question, null));

  // Simpan lampiran sebagai baris documents agar tool (mis. thumbnail
  // persediaan via imageDocumentId) bisa merujuknya. Tanpa ini lampiran
  // hanya hidup di memori turn ini.
  let attachmentId: string | null = null;
  let attachmentMime: string | null = null;
  if (opts?.document) {
    try {
      const { putDocument } = await import("@/server/storage/storage");
      const { createDocumentRow } = await import("@/server/db/repos/documents.repo");
      const buffer = Buffer.from(opts.document.dataBase64, "base64");
      const { storageKey } = await putDocument(orgId, { buffer, mime: opts.document.mime });
      const docRow = await db.transaction((tx) =>
        createDocumentRow(tx, { orgId, storageKey, mime: opts.document!.mime, sizeBytes: buffer.length }),
      );
      attachmentId = docRow.id;
      attachmentMime = opts.document.mime;
    } catch (e) {
      console.warn("akunio attachment persist failed", e);
    }
  }

  // Gather context
  const queryEmbedding = await embed(question);
  const hits = await hybridSearch(orgId, queryEmbedding, question, 6);
  const liveNumbers = await getLiveNumbers(orgId);
  const history = await listMessages(db, threadId);
  // 12 pesan terakhir + memory server-side agar "ok catatkan ya" tidak lupa objeknya.
  const lastMessages = history.slice(-12).map((m) => `${m.role}: ${m.content}`).join("\n");
  let previousInteractionId: string | null = null;
  try {
    const tRow = await getThread(db, orgId, threadId);
    previousInteractionId = (tRow as { geminiInteractionId?: string | null } | null)?.geminiInteractionId ?? null;
  } catch {}
  const context = hits.map((h, i) => `[${i + 1}] (${h.kind}) ${h.excerpt}`).join("\n");

  // Load accounts for prompt
  const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const leafAccs = accRows.filter((a) => !accRows.some((c) => c.parentCode === a.code));
  const promptAccounts = leafAccs.map((a) => ({ code: a.code, name: a.name, normal: a.normal === "D" ? ("D" as const) : ("K" as const) }));
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const draftPromptHelp = buildDraftPrompt({ accounts: promptAccounts, todayISO, text: question });

  const citations: NaraCitation[] = hits.map((h) => ({
    kind: h.kind,
    ref: h.id,
    excerpt: h.excerpt,
    score: h.score,
    section: h.section,
  }));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_TIDAK_TERSEDIA");
  const ai = new GoogleGenAI({ apiKey });

  // Build system instruction + user prompt (satu suara dengan jalur streaming)
  // Ingatan lintas sesi, fail-silent agar chat tak mati bila RLS/memory gagal.
  let memoryBlock = "";
  try {
    const mems = await withOrg(orgId, (tx) => listMemories(tx, orgId));
    memoryBlock = formatMemoriesForPrompt(mems);
  } catch (e) {
    console.warn("memory read skipped", e instanceof Error ? e.message : e);
  }
  const systemInstruction = `${buildAkunioSystemPrompt({ memoryBlock })}
- Jangan halusinasi angka — gunakan live numbers dan hasil tool.
- ATURAN KONTEKS (ANTI-LUPA, WAJIB): jika pesan user singkat/konfirmasi ("ok", "ya", "catatkan ya", "lanjutkan") tanpa nominal,
  WAJIB ambil detail dari Riwayat di atas (mis. aset laptop Rp10.000.000 + Garis Lurus 48 bulan). Jangan minta ulang detail yang sudah ada;
  hanya tanyakan field yang benar-benar belum ada (sumber dana/tanggal) sambil menyebut kembali data yang sudah diketahui.
- Jika user ingin mencatat transaksi, WAJIB panggil create_journal_draft. Draft akan direview user sebelum posting — jangan janji posting otomatis.
- Jika user menambah barang persediaan sambil melampirkan foto, TAWARKAN dulu menjadikan foto sebagai thumbnail; hanya teruskan imageDocumentId bila user menjawab ya.
- Jika user tanya laporan/saldo/riwayat, panggil tool yang sesuai (search_journals, get_report, list_accounts, list_drafts, list_journals) lalu jawab berdasarkan hasilnya.
- Jika tidak perlu tool, jawab langsung dari konteks.`;

  const fullPrompt = `${systemInstruction}

${draftPromptHelp}

Konteks angka live: ${liveNumbers}
Konteks dokumen RAG:
${context}

Riwayat:
${lastMessages}

Pertanyaan user saat ini: ${question}
${opts?.document ? "(User melampirkan dokumen — sudah disertakan sebagai attachment, ekstrak isinya)" : ""}
${attachmentId ? `(Lampiran tersimpan sebagai dokumen id ${attachmentId}, tipe ${attachmentMime}. Jika user minta tambah barang DAN menyetujui foto ini sebagai thumbnail, teruskan id tersebut sebagai imageDocumentId pada add_inventory_item. Tanpa persetujuan eksplisit, JANGAN isi imageDocumentId. Jika ada beberapa lampiran dalam riwayat, tanyakan dulu pakai yang mana.)` : ""}

Instruksi: Pilih tool yang tepat jika dibutuhkan, atau jawab langsung jika pertanyaan umum.`;

  const userContent: GenaiContent[] = [{ type: "text", text: fullPrompt }];
  const docForPrompt = opts?.document;
  if (docForPrompt) {
    const type = docForPrompt.mime === "application/pdf" ? "document" : "image";
    userContent.push({
      type,
      data: docForPrompt.dataBase64,
      mime_type: docForPrompt.mime,
    } as GenaiContent);
  }

  const inputSteps = [{ type: "user_input", content: userContent as never }] as never;

  let interaction: unknown;
  try {
    const memoryParams = previousInteractionId
      ? { store: STORE_INTERACTIONS, previous_interaction_id: previousInteractionId }
      : { store: STORE_INTERACTIONS };
    try {
      interaction = await ai.interactions.create({
        model: MODEL,
        input: inputSteps,
        ...memoryParams,
        tools: ALL_TOOLS,
      });
    } catch (e) {
      if (previousInteractionId && isStaleInteractionError(e)) {
        console.warn("previous_interaction_id basi, ulangi tanpa chaining", e);
        await clearThreadInteractionId(orgId, threadId);
        interaction = await ai.interactions.create({
          model: MODEL,
          input: inputSteps,
          store: STORE_INTERACTIONS,
          tools: ALL_TOOLS,
        });
      } else {
        throw e;
      }
    }
  } catch (e) {
    console.error("akunio interactions.create failed", e);
    throw new Error("AI_TIDAK_TERSEDIA");
  }

  // Simpan id interaksi untuk chaining turn berikutnya dalam thread yang sama.
  try {
    const newId = (interaction as unknown as { id?: string }).id;
    if (newId) await saveThreadInteractionId(orgId, threadId, newId);
  } catch {}

  const steps = (interaction as unknown as { steps?: Array<{ type: string; name?: string; arguments?: unknown }> }).steps ?? [];
  const calls = steps.filter((s) => s.type === "function_call" && s.name);

  let draft: DraftEntry & { mapping?: unknown } | undefined;
  let draftId: string | undefined;
  const toolResults: Array<{ tool: string; result: unknown }> = [];
  let answer: string = (interaction as unknown as { output_text?: string }).output_text ?? "";

  // Execute tool calls sequentially
  for (const call of calls) {
    try {
      if (call.name === "create_journal_draft") {
        const parsed = parseDraftFromToolArgs(call.arguments);
        const mapping = resolveDraftAccounts(parsed, leafAccs.map((a) => ({ id: a.id, code: a.code, name: a.name })));
        const draftWithMapping = { ...parsed, mapping } as DraftEntry & { mapping: unknown };
        // Persist document if present
        let documentId: string | undefined;
        const doc = opts?.document;
        if (doc) {
          try {
            const { putDocument } = await import("@/server/storage/storage");
            const { createDocumentRow } = await import("@/server/db/repos/documents.repo");
            const buffer = Buffer.from(doc.dataBase64, "base64");
            const { storageKey } = await putDocument(orgId, { buffer, mime: doc.mime });
            const docRow = await db.transaction((tx) => createDocumentRow(tx, { orgId, storageKey, mime: doc.mime, sizeBytes: buffer.length }));
            documentId = docRow.id;
          } catch (e) {
            console.warn("akunio document persist failed", e);
          }
        }
        // Persist draft as PENDING for human review
        const row = await db.transaction(async (tx) => {
          const d = await createDraft(tx, {
            orgId,
            kind: opts?.document ? "DOCUMENT" : "TEXT",
            documentId,
            inputText: question,
            draft: draftWithMapping,
            model: MODEL,
          });
          // audit
          try {
            const { appendAudit } = await import("@/server/db/repos/audit.repo");
            const { db: dbInner } = await import("@/server/db");
            // Use same tx for audit if possible; appendAudit uses advisory lock, but tx is fine
            await appendAudit(tx, {
              orgId,
              actor: "akunio",
              action: "AKUNIO_DRAFT_CREATE",
              subjectType: "ai_draft",
              subjectId: d.id,
              data: { via: "akunio", tool: "create_journal_draft", overallConfidence: parsed.overallConfidence },
            });
          } catch {}
          return d;
        });
        draft = draftWithMapping;
        draftId = row.id;
        toolResults.push({ tool: call.name!, result: { draftId: row.id, memo: parsed.memo, lines: parsed.lines } });
        // Prefer fixed answer if model didn't provide text
        if (!answer) answer = `Draft jurnal untuk "${question}" berhasil disusun. Silakan tinjau dan posting — saya tidak akan posting otomatis tanpa persetujuan Anda.`;
        else answer = `${answer}\n\n[Draft ${row.id} dibuat — silakan review]`;
      } else if (call.name === "search_journals") {
        const args = call.arguments as { query: string; limit?: number };
        const rows = await db.transaction((tx) => searchJournals(tx, orgId, args.query, args.limit ?? 5));
        toolResults.push({ tool: call.name!, result: rows });
        // If no final answer yet, synthesize one via second model call
      } else if (call.name === "list_accounts") {
        const rows = leafAccs.map((a) => ({ code: a.code, name: a.name, type: a.type, normal: a.normal }));
        toolResults.push({ tool: call.name!, result: rows });
      } else if (call.name === "get_report") {
        const args = call.arguments as { type: string; period?: string };
        let result: unknown = null;
        try {
          const { loadPeriodOrDefault, postedLinesThrough } = await import("@/server/reports/build");
          const { aggregateFromLines } = await import("@/core/reports/aggregates");
          const { balanceSheet, incomeStatement: incStmt, cashFlowIndirect, changesInEquity } = await import("@/core/reports/statements");
          const period = await db.transaction((tx) => loadPeriodOrDefault(tx, orgId, args.period));
          const lines = await postedLinesThrough(db, orgId, period.endsOn);
          const metas = reportMetaMap(accRows);
          const aggs = aggregateFromLines(lines, metas);
          const ytd = incStmt(aggs);
          if (args.type === "neraca") {
            try {
              result = balanceSheet(aggs, ytd.netIncomeMinor);
            } catch (e) {
              result = { error: (e as Error).message, fallback: ytd };
            }
          } else if (args.type === "laba_rugi") result = ytd;
          else if (args.type === "arus_kas") {
            result = cashFlowIndirect({
              netIncomeMinor: ytd.netIncomeMinor,
              deltaPiutangMinor: 0n,
              deltaPersediaanMinor: 0n,
              deltaUtangUsahaMinor: 0n,
              depreciationMinor: 0n,
              investingMinor: 0n,
              financingMinor: 0n,
            });
          } else if (args.type === "perubahan_ekuitas") {
            result = changesInEquity({
              openingRetainedEarningsMinor: 0n,
              contributionsMinor: 0n,
              drawingsMinor: 0n,
              netIncomeMinor: ytd.netIncomeMinor,
            });
          }
        } catch (e) {
          result = { error: (e as Error).message };
        }
        toolResults.push({ tool: call.name!, result });
      } else if (call.name === "list_drafts") {
        const args = call.arguments as { status?: string; limit?: number };
        const { listDrafts } = await import("@/server/db/repos/drafts.repo");
        const rows = await listDrafts(db, orgId);
        const filtered = args.status ? rows.filter((r) => r.status === args.status) : rows;
        const lim = args.limit ?? 5;
        toolResults.push({ tool: call.name!, result: filtered.slice(0, lim).map((r) => ({ id: r.id, memo: (r.draft as { memo?: string }).memo, status: r.status, kind: r.kind, createdAt: r.createdAt })) });
      } else if (call.name === "list_journals") {
        const rows = await db.transaction((tx) => listEntriesWithLines(tx, orgId, 10));
        toolResults.push({ tool: call.name!, result: rows.map((r) => ({ number: r.number, date: r.entryDate, memo: r.memo, lines: r.lines.map((l) => ({ code: l.accountCode, debit: l.debitMinor.toString(), credit: l.creditMinor.toString() })) })) });
      }
    } catch (e) {
      toolResults.push({ tool: call.name!, result: { error: (e as Error).message } });
    }
  }

  // If we executed non-draft tools and answer is empty or generic, do a second call to synthesize natural answer with tool results
  const needsSynthesis = toolResults.length > 0 && toolResults.some((t) => t.tool !== "create_journal_draft");
  if (needsSynthesis) {
    try {
      const toolContext = toolResults
        .map((tr) => `Tool ${tr.tool} result: ${JSON.stringify(tr.result, null, 2).slice(0, 4000)}`)
        .join("\n\n");
      const synthPrompt = `Anda adalah ${ASSISTANT_NAME}. User bertanya: "${question}"
Hasil tool yang sudah dieksekusi:
${toolContext}

Konteks live: ${liveNumbers}
Konteks RAG:
${context}

Tugas: Jawab user dalam Bahasa Indonesia natural, ringkas, gunakan angka dari tool jika ada. Sitasi inline HANYA untuk klaim aturan penting atau angka kunci: [SAK Bab 11 §11.1-11.3](sak:11:11.1-11.3) atau [JE-2026-0004](jurnal:JE-2026-0004) (nomor persis dari hasil tool). Jangan tampilkan daftar sumber. Jangan halusinasi. Jika ada draft yang dibuat, sebutkan ID draft dan minta user review sebelum posting.`;
      const synth = await ai.interactions.create({
        model: MODEL,
        input: [{ type: "user_input", content: [{ type: "text", text: synthPrompt }] } as never],
        store: STORE_INTERACTIONS,
      });
      const synthText = (synth as unknown as { output_text?: string }).output_text;
      if (synthText) answer = synthText;
      try {
        const synthId = (synth as unknown as { id?: string }).id;
        if (synthId) await saveThreadInteractionId(orgId, threadId, synthId);
      } catch {}
    } catch (e) {
      console.warn("akunio synthesis failed", e);
      if (!answer) answer = toolResults.map((tr) => `${tr.tool}: ${JSON.stringify(tr.result).slice(0, 500)}`).join("\n");
    }
  }

  if (!answer) {
    // Fallback plain answer
    const fallback = (interaction as unknown as { output_text?: string }).output_text;
    answer = fallback ?? "Maaf, saya tidak bisa memproses permintaan tersebut.";
  }

  // Save assistant message
  await db.transaction((tx) => addMessage(tx, threadId, "assistant", answer, citations));

  return { answer, citations, draft, draftId, toolResults: toolResults.length ? toolResults : undefined };
}
