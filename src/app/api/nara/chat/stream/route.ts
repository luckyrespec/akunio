import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  createThread,
  getThread,
  addMessage,
  listMessages,
  checkAssistantQuota,
} from "@/server/db/repos/chat.repo";
import { GoogleGenAI } from "@google/genai";
import {
  ALL_NARA_TOOLS,
  SAFE_TOOLS,
  MUTATING_TOOLS,
  executeNaraTool,
} from "@/server/ai/nara-tools";
import { getDocument } from "@/server/storage/storage";
import { hybridSearch } from "@/server/db/repos/rag-search";
import { embed } from "@/server/ai/embeddings";
import { accounts, organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { postedLinesThrough } from "@/server/reports/build";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { incomeStatement } from "@/core/reports/statements";
import { Money } from "@/core/money/money";

interface AttachmentMeta {
  id: string;
  storageKey: string;
  mime: string;
  fileName: string;
  sizeBytes: number;
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
    return `Saldo Kas & Bank: ${Money.fromMinor(cashMinor).formatIdr()}, Laba Tahun Ini: ${Money.fromMinor(ytd.netIncomeMinor).formatIdr()}.`;
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext();
    const body = await req.json().catch(() => ({}));
    let { threadId } = body as { threadId?: string };
    const {
      message = "",
      attachments = [],
      modelPreset = "fast",
      allowAllForSession = false,
    } = body as {
      threadId?: string;
      message: string;
      attachments?: AttachmentMeta[];
      modelPreset?: "fast" | "deep";
      allowAllForSession?: boolean;
    };

    const trimmedMsg = String(message ?? "").trim();
    if (!trimmedMsg && attachments.length === 0) {
      return NextResponse.json({ error: "Pesan atau lampiran tidak boleh kosong." }, { status: 400 });
    }

    const quota = await checkAssistantQuota(db, ctx.orgId);
    if (!quota.allowed) {
      return NextResponse.json({ error: quota.message ?? "Kuota interaksi AI habis bulan ini." }, { status: 429 });
    }

    if (!threadId) {
      const title = trimmedMsg.split(/\s+/).slice(0, 5).join(" ") || "Percakapan baru";
      const newT = await db.transaction((tx) => createThread(tx, ctx.orgId, title, modelPreset));
      threadId = newT.id;
    } else {
      const existingT = await getThread(db, ctx.orgId, threadId);
      if (!existingT) {
        return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
      }
    }

    // Save user message to database
    await db.transaction((tx) =>
      addMessage(tx, threadId!, "user", trimmedMsg || "Lampiran dikirim", {
        attachments: attachments.length > 0 ? attachments : null,
      }),
    );

    // Check organization HITL policy
    const [orgRow] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const orgSettings = (orgRow?.settings ?? {}) as { aiHitlPolicy?: "smart" | "strict" | "autonomous" };
    const hitlPolicy = orgSettings.aiHitlPolicy ?? "smart";

    // Setup Gemini Client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key Gemini belum dikonfigurasi." }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    // Gather contextual data
    let ragContext = "";
    let citations: Array<{ kind: string; ref: string; excerpt: string; score: number }> = [];
    try {
      const queryEmbedding = await embed(trimmedMsg || "akuntansi");
      const hits = await hybridSearch(ctx.orgId, queryEmbedding, trimmedMsg || "akuntansi", 5);
      ragContext = hits.map((h, i) => `[${i + 1}] (${h.kind}) ${h.excerpt}`).join("\n");
      citations = hits.map((h) => ({
        kind: h.kind,
        ref: h.id,
        excerpt: h.excerpt,
        score: h.score,
      }));
    } catch {}

    const liveNumbers = await getLiveNumbers(ctx.orgId);
    const history = await listMessages(db, threadId!);
    const lastMessages = history.slice(-6).map((m) => `${m.role}: ${m.content}`).join("\n");

    const systemInstruction = `Anda adalah Nara, Asisten Akuntansi AI Cerdas untuk UMKM Indonesia (berdasarkan standar IFRS/SAK EMKM).
- Anda ramah, solutif, teliti, dan selalu memberikan saran pembukuan yang tepat.
- Anda memiliki akses ke berbagai Tool Akuntansi untuk membaca dan mengubah data (COA, Jurnal, Periode, Laporan, Diagnostik).
- Jika pengguna ingin mencatat transaksi atau pengeluaran, gunakan tool 'create_journal_draft' atau 'post_journal'.
- Jangan pernah mengarang angka; selalu gunakan live numbers atau hasil dari tool.
- Selalu jelaskan alasan jurnal double-entry (Debit & Kredit harus seimbang).`;

    const fullPrompt = `${systemInstruction}

Konteks Angka Terkini:
${liveNumbers}

Konteks Dokumen / Aturan:
${ragContext}

Riwayat Percakapan:
${lastMessages}

Pesan Pengguna:
${trimmedMsg}

${attachments.length > 0 ? `(Pengguna melampirkan ${attachments.length} dokumen. Ekstrak data transaksi/angka dari gambar/PDF terlampir bila relevan.)` : ""}`;

    // Prepare multimodal content parts
    const contentParts: Array<{ type: string; text?: string; data?: string; mime_type?: string }> = [
      { type: "text", text: fullPrompt },
    ];

    for (const att of attachments) {
      try {
        const buf = await getDocument(att.storageKey);
        const type = att.mime === "application/pdf" ? "document" : "image";
        contentParts.push({
          type,
          data: buf.toString("base64"),
          mime_type: att.mime,
        });
      } catch (err) {
        console.warn(`Gagal memuat attachment ${att.storageKey}`, err);
      }
    }

    const selectedModel = modelPreset === "deep" ? "gemini-3.7-flash" : "gemini-3.5-flash-lite";

    // Create ReadableStream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: "init", threadId });

        let fullText = "";
        let fullReasoning = "";
        const toolInvocations: Array<{
          callId?: string;
          toolName: string;
          status: string;
          args: unknown;
          result?: unknown;
        }> = [];

        try {
          const interactionStream = await ai.interactions.create({
            model: selectedModel,
            input: [{ type: "user_input", content: contentParts as never }] as never,
            stream: true,
            store: false,
            tools: ALL_NARA_TOOLS,
            generation_config: modelPreset === "deep" ? { thinking_summaries: "auto" } : undefined,
          });

          for await (const event of interactionStream as AsyncIterable<{
            event_type: string;
            delta?: { type: string; text?: string; content?: { text?: string } };
            step?: { type: string; name?: string; arguments?: unknown; call_id?: string; id?: string };
          }>) {
            if (event.event_type === "step.delta" && event.delta) {
              if (event.delta.type === "thought_summary" && event.delta.content?.text) {
                fullReasoning += event.delta.content.text;
                send({ type: "reasoning", delta: event.delta.content.text });
              } else if (event.delta.type === "text" && event.delta.text) {
                fullText += event.delta.text;
                send({ type: "text", delta: event.delta.text });
              }
            } else if (event.event_type === "step.start" && event.step?.type === "function_call") {
              const call = event.step;
              const toolName = call.name ?? "";
              const callId = call.id ?? call.call_id ?? `call_${Date.now()}`;
              const args = (call.arguments ?? {}) as Record<string, unknown>;

              const isSafe = SAFE_TOOLS.has(toolName);
              const isMutating = MUTATING_TOOLS.has(toolName);
              const shouldAutoExecute =
                isSafe || hitlPolicy === "autonomous" || (isMutating && allowAllForSession);

              if (shouldAutoExecute) {
                send({ type: "tool_call", tool: toolName, status: "executing", args });
                const exec = await executeNaraTool(ctx.orgId, ctx.userEmail, toolName, args);
                send({ type: "tool_result", tool: toolName, result: exec.data ?? exec.error });
                toolInvocations.push({
                  callId,
                  toolName,
                  status: exec.success ? "auto" : "failed",
                  args,
                  result: exec.data ?? exec.error,
                });

                if (exec.success && !fullText) {
                  fullText = `Tindakan ${toolName} berhasil dieksekusi.`;
                }
              } else {
                // Must request HITL approval from user
                send({
                  type: "tool_approval_request",
                  callId,
                  toolName,
                  args,
                  explanation: `Nara membutuhkan konfirmasi Anda untuk menjalankan '${toolName}'.`,
                });
                toolInvocations.push({
                  callId,
                  toolName,
                  status: "pending_approval",
                  args,
                });
              }
            }
          }

          // Persist assistant message to database
          const assistantMsg = await db.transaction((tx) =>
            addMessage(tx, threadId!, "assistant", fullText || "(Menunggu tindakan)", {
              reasoning: fullReasoning || undefined,
              toolInvocations: toolInvocations.length > 0 ? toolInvocations : null,
              citations: citations.length > 0 ? citations : null,
            }),
          );

          send({
            type: "done",
            messageId: assistantMsg.id,
            citations,
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses jawaban.";
          send({ type: "error", message: errMsg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memproses streaming.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
