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
      pageContext,
    } = body as {
      threadId?: string;
      message: string;
      attachments?: AttachmentMeta[];
      modelPreset?: "fast" | "deep";
      allowAllForSession?: boolean;
      pageContext?: {
        pathname: string;
        title?: string;
        summary?: string;
      };
    };

    const trimmedMsg = String(message ?? "").trim();
    if (!trimmedMsg && attachments.length === 0) {
      return NextResponse.json({ error: "Pesan atau lampiran tidak boleh kosong." }, { status: 400 });
    }

    const quota = await checkAssistantQuota(db, ctx.orgId);
    if (!quota.allowed) {
      return NextResponse.json({ error: quota.message ?? "Kuota interaksi AI habis bulan ini." }, { status: 429 });
    }

function generateSmartTitle(prompt: string): string {
  if (!prompt) return "Percakapan Baru";
  const clean = prompt
    .replace(/^(tolong|mohon|bisa|coba|tolong buatkan|catat transaksi|tampilkan|apakah|bagaimana|cek|lihat)\s+/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .trim();

  const words = clean.split(/\s+/).slice(0, 3);
  if (words.length === 0 || !words[0]) return "Percakapan Baru";

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

    if (!threadId) {
      const title = generateSmartTitle(trimmedMsg);
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

    // Fetch Chart of Accounts (COA) leaf accounts so Gemini knows exact codes
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const leafAccs = accRows.filter((a) => !accRows.some((c) => c.parentCode === a.code));
    const coaSummary = leafAccs
      .map((a) => `${a.code}: ${a.name} (${a.type}, normal ${a.normal})`)
      .join(", ");

    const systemInstruction = `Anda adalah Nara, Asisten Akuntansi AI Cerdas untuk UMKM Indonesia (berdasarkan standar IFRS/SAK EMKM).
- Anda ramah, solutif, teliti, dan selalu memberikan jawaban serta analisis pembukuan yang tuntas dalam Bahasa Indonesia.
- Gaya Percakapan:
  * Berkomunikasilah secara natural, hangat, dan mengalir seperti percakapan dengan rekan kerja akuntan pribadi.
  * HINDARI penggunaan format markdown yang terlalu ramai, kaku, atau berlebihan (jangan gunakan banyak heading besar #/## atau list bersarang panjang jika tidak benar-benar diperlukan).
  * Gunakan kalimat singkat, to the point, dan mudah dipahami.
- Anda memiliki akses ke berbagai Tool Akuntansi untuk membaca dan mengubah data.
- Daftar Tool yang tersedia:
  * Pembukuan Jurnal:
    - 'post_journal': Posting jurnal double-entry resmi ke buku besar (JE-YYYY-NNNN).
    - 'create_journal_draft': Buat draft jurnal untuk ditinjau oleh pengguna.
    - 'reverse_journal': Balikkan/batalkan entri jurnal yang salah.
    - 'search_journals', 'list_journals': Cari atau lihat riwayat entri jurnal.
  * Faktur & Tagihan:
    - 'create_invoice': Buat faktur penjualan (INVOICE) atau tagihan pembelian (BILL).
    - 'record_invoice_payment': Catat pelunasan faktur.
    - 'post_invoice_to_journal': Posting faktur ke jurnal buku besar.
    - 'get_ar_ap_aging': Analisis umur piutang dan utang usaha.
  * Rekonsiliasi Bank:
    - 'get_bank_reconciliation_status': Cek saldo bank vs saldo buku kas vs selisih.
    - 'auto_match_bank_reconciliation': Jalankan pencocokan otomatis mutasi bank.
  * Laporan & Operasional:
    - 'get_daily_briefing': Ringkasan harian kas, laba, dan transaksi tertunda.
    - 'get_report': Laporan neraca, laba_rugi, arus_kas, perubahan_ekuitas.
    - 'list_accounts', 'drilldown_account_details', 'check_accounting_health', 'list_periods'.
- Aturan Pencatatan Transaksi:
  Ketika pengguna meminta mencatat transaksi (misal: "catat awal modal usaha saya 1 juta ya" atau "catat bayar sewa 5jt"):
  Pilihlah akun yang tepat dari Daftar Akun (COA) Tersedia (misal Kas: 1110, Modal Disetor: 3100), dan gunakan 'post_journal' atau 'create_journal_draft'.
  Pastikan jumlah Debit dan Kredit seimbang.
- Aturan Pengambilan Laporan / Briefing:
  Panggil tool terkait, lalu sampaikan ringkasannya secara natural dan informatif.
- Jangan pernah mengarang angka; selalu gunakan data dari konteks atau hasil tool.`;

    const pageContextStr = pageContext
      ? `\nKonteks Layar Saat Ini:\n- Halaman aktif: ${pageContext.pathname} (${pageContext.title || "Tanpa Judul"})${pageContext.summary ? `\n- Data/Ringkasan layar: ${pageContext.summary}` : ""}\n(Gunakan konteks ini bila pengguna menanyakan transaksi/data yang tampak di layar mereka saat ini.)\n`
      : "";

    const fullPrompt = `${systemInstruction}

Konteks Angka Terkini:
${liveNumbers}

Daftar Akun (COA) Tersedia:
${coaSummary}
${pageContextStr}
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

        interface PendingCall {
          index: number;
          callId: string;
          toolName: string;
          argumentsJson: string;
        }
        const pendingCalls = new Map<number, PendingCall>();

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
            index?: number;
            delta?: { type: string; text?: string; content?: { text?: string }; arguments?: string };
            step?: { type: string; name?: string; arguments?: unknown; call_id?: string; id?: string };
          }>) {
            const idx = event.index ?? 0;

            if (event.event_type === "step.start" && event.step?.type === "function_call") {
              const call = event.step;
              const toolName = call.name ?? "";
              const callId = call.id ?? call.call_id ?? `call_${Date.now()}`;
              let initialJson = "";
              if (typeof call.arguments === "string") {
                initialJson = call.arguments;
              } else if (call.arguments && Object.keys(call.arguments as object).length > 0) {
                initialJson = JSON.stringify(call.arguments);
              }
              pendingCalls.set(idx, {
                index: idx,
                callId,
                toolName,
                argumentsJson: initialJson,
              });
            } else if (event.event_type === "step.delta" && event.delta) {
              if (event.delta.type === "arguments_delta" && event.delta.arguments) {
                const current = pendingCalls.get(idx);
                if (current) {
                  current.argumentsJson += event.delta.arguments;
                }
              } else if (event.delta.type === "thought_summary" && event.delta.content?.text) {
                fullReasoning += event.delta.content.text;
                send({ type: "reasoning", delta: event.delta.content.text });
              } else if (event.delta.type === "text" && event.delta.text) {
                fullText += event.delta.text;
                send({ type: "text", delta: event.delta.text });
              }
            } else if (event.event_type === "step.stop") {
              if (pendingCalls.has(idx)) {
                const pending = pendingCalls.get(idx)!;
                pendingCalls.delete(idx);

                let args: Record<string, unknown> = {};
                try {
                  args = pending.argumentsJson ? JSON.parse(pending.argumentsJson) : {};
                } catch (parseErr) {
                  console.warn("Gagal parse argumentsJson tool call", pending.argumentsJson, parseErr);
                  args = {};
                }

                const toolName = pending.toolName;
                const callId = pending.callId;

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

                  if (exec.success && exec.data && typeof exec.data === "object") {
                    const dataObj = exec.data as Record<string, unknown>;
                    if (Array.isArray(dataObj.suggestions) && dataObj.suggestions.length > 0) {
                      send({ type: "suggestions", suggestions: dataObj.suggestions });
                    }
                    if (dataObj.batchId && Array.isArray(dataObj.items)) {
                      send({ type: "queue_update", batchId: dataObj.batchId, items: dataObj.items });
                    }
                  }
                } else {
                  // Must request HITL approval from user with COMPLETE args
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

                  if (!fullText) {
                    let pendingMsg = `Berikut rincian tindakan yang perlu Anda konfirmasi:`;
                    if (toolName === "post_journal" || toolName === "create_journal_draft") {
                      pendingMsg = `Berikut draf jurnal untuk pencatatan transaksi Anda:`;
                    } else if (toolName === "create_invoice") {
                      pendingMsg = `Berikut draf faktur yang telah saya siapkan:`;
                    }
                    fullText = pendingMsg;
                    send({ type: "text", delta: pendingMsg });
                  }
                }
              }
            }
          }

          // If auto-executed tools ran and no full answer was streamed yet,
          // invoke Gemini synthesis turn to generate a rich, natural explanation of the tool output!
          const executedTools = toolInvocations.filter((t) => t.status === "auto");
          if (executedTools.length > 0) {
            try {
              const toolContext = executedTools
                .map((t) => `Hasil Tool [${t.toolName}]:\n${JSON.stringify(t.result, null, 2)}`)
                .join("\n\n");

              const synthPrompt = `Anda adalah Nara, Asisten Akuntansi AI Cerdas.
Pengguna bertanya: "${trimmedMsg}"
Hasil eksekusi data di sistem:
${toolContext}

Konteks Saldo Terkini:
${liveNumbers}

Tugas:
1. Berikan penjelasan yang hangat, ramah, dan mengalir santai dalam Bahasa Indonesia berdasarkan hasil data di atas.
2. Hindari format markdown yang berlebihan atau kaku (gunakan paragraf ringkas yang nyaman dibaca).
3. Langsung sampaikan informasi intinya secara jelas dan solutif.`;

              const synthStream = await ai.interactions.create({
                model: selectedModel,
                input: [{ type: "user_input", content: [{ type: "text", text: synthPrompt }] } as never],
                stream: true,
                store: false,
              });

              for await (const sEvent of synthStream as AsyncIterable<{
                event_type: string;
                delta?: { type: string; text?: string };
              }>) {
                if (sEvent.event_type === "step.delta" && sEvent.delta?.type === "text" && sEvent.delta.text) {
                  fullText += sEvent.delta.text;
                  send({ type: "text", delta: sEvent.delta.text });
                }
              }
            } catch (sErr) {
              console.warn("Gagal sintesis teks respons tool", sErr);
              if (!fullText) {
                fullText = executedTools.map((t) => `Tindakan ${t.toolName} selesai diproses.`).join("\n");
                send({ type: "text", delta: fullText });
              }
            }
          }

          if (!fullText) {
            fullText = "Maaf, saya tidak menerima respons yang dapat ditampilkan. Silakan coba tanyakan kembali.";
            send({ type: "text", delta: fullText });
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
