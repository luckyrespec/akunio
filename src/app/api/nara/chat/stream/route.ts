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
import {
  STORE_INTERACTIONS,
  clearThreadInteractionId,
  isStaleInteractionError,
  saveThreadInteractionId,
} from "@/server/ai/interaction-memory";
import { getDocument } from "@/server/storage/storage";
import { hybridSearch } from "@/server/db/repos/rag-search";
import { embed } from "@/server/ai/embeddings";
import { accounts, organizations } from "@/server/db/schema/org";
import { orgProfiles } from "@/server/db/schema/onboarding";
import { buildAkunioSystemPrompt } from "@/server/ai/persona";
import { parseAiPrefs } from "@/lib/ai-prefs";
import { generateSmartTitle } from "@/server/ai/thread-title";
import { formatMemoriesForPrompt } from "@/server/ai/memory-extractor";
import { listMemories } from "@/server/db/repos/assistant-memory.repo";
import { listInventoryItems } from "@/server/db/repos/inventory.repo";
import { findPeriodByDate } from "@/server/db/repos/periods.repo";
import { withOrg } from "@/server/db/repos/with-org";
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

/** Estimasi nominal aksi (minor) untuk batas persetujuan. null = tak terukur. */
function maxMinorFromArgs(toolName: string, args: Record<string, unknown>): bigint | null {
  try {
    if (toolName === "post_journal" || toolName === "create_journal_draft") {
      const lines = Array.isArray(args.lines) ? (args.lines as Array<Record<string, unknown>>) : [];
      let total = 0n;
      for (const l of lines) {
        const raw = l.debit ?? l.debitText;
        if (typeof raw === "string" && raw.trim() !== "" && raw.trim() !== "0") {
          total += Money.parseIdr(raw).minor;
        }
      }
      return total;
    }
    if (toolName === "record_cash_entry" && typeof args.amountText === "string") {
      return Money.parseIdr(args.amountText).minor;
    }
    if (toolName === "create_invoice" && Array.isArray(args.items)) {
      let total = 0n;
      for (const it of args.items as Array<Record<string, unknown>>) {
        const qty = Number(it.quantity ?? 0);
        const price = Number(it.unitPrice ?? 0);
        if (Number.isFinite(qty) && Number.isFinite(price)) {
          total += BigInt(Math.round(qty * price)) * 100n;
        }
      }
      return total;
    }
    if (toolName === "record_invoice_payment" && Number.isFinite(Number(args.amount))) {
      return BigInt(Math.round(Number(args.amount))) * 100n;
    }
    return null;
  } catch {
    return null;
  }
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

    // Gemini server-side memory: lanjutkan interaksi sebelumnya di thread yang sama.
    // combinasikan dengan riwayat lokal di bawah sebagai cadangan anti-lupa.
    let previousInteractionId: string | null = null;
    try {
      const tRow = await getThread(db, ctx.orgId, threadId!);
      previousInteractionId = (tRow as { geminiInteractionId?: string | null } | null)?.geminiInteractionId ?? null;
    } catch {}

    // Save user message to database
    await db.transaction((tx) =>
      addMessage(tx, threadId!, "user", trimmedMsg || "Lampiran dikirim", {
        attachments: attachments.length > 0 ? attachments : null,
      }),
    );

    // Ingatan preferensi/koreksi dari pesan user (fail-silent, tak blokir chat).
    try {
      const { extractExplicitMemory, extractCorrectionMemory } = await import(
        "@/server/ai/memory-extractor"
      );
      const { saveMemory } = await import("@/server/db/repos/assistant-memory.repo");
      const found =
        extractExplicitMemory(trimmedMsg) ?? extractCorrectionMemory(trimmedMsg);
      if (found) {
        await db.transaction((tx) =>
          saveMemory(tx, ctx.orgId, {
            kind: found.kind,
            content: found.content,
            source: "auto",
            sourceThreadId: threadId!,
          }),
        );
      }
    } catch {}

    // Check organization HITL policy
    const [orgRow] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const orgSettings = (orgRow?.settings ?? {}) as {
      aiHitlPolicy?: "smart" | "strict" | "autonomous";
      aiMemoryEnabled?: boolean;
    };
    const hitlPolicy = orgSettings.aiHitlPolicy ?? "smart";
    const prefs = parseAiPrefs(orgRow?.settings);

    // Profil usaha untuk sudut persona (read-only, bukan tool).
    let businessType: string | null = null;
    try {
      const [prof] = await db.select().from(orgProfiles).where(eq(orgProfiles.orgId, ctx.orgId));
      businessType = prof?.businessType ?? null;
    } catch {}

    // Setup Gemini Client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key Gemini belum dikonfigurasi." }, { status: 500 });
    }
    const ai = new GoogleGenAI({ apiKey });

    // Gather contextual data
    let ragContext = "";
    let citations: Array<{ kind: string; ref: string; excerpt: string; score: number; section?: string }> = [];
    try {
      const queryEmbedding = await embed(trimmedMsg || "akuntansi");
      const hits = await hybridSearch(ctx.orgId, queryEmbedding, trimmedMsg || "akuntansi", 5);
      ragContext = hits.map((h, i) => `[${i + 1}] (${h.kind}) ${h.excerpt}`).join("\n");
      citations = hits.map((h) => ({
        kind: h.kind,
        ref: h.id,
        excerpt: h.excerpt,
        score: h.score,
        section: h.section,
      }));
    } catch {}

    const liveNumbers = await getLiveNumbers(ctx.orgId);
    const history = await listMessages(db, threadId!);
    // 12 pesan terakhir agar konfirmasi singkat ("ok catatkan ya") tetap
    // punya konteks objeknya (mis. aset laptop 10jt + metode Garis Lurus).
    const lastMessages = history.slice(-12).map((m) => `${m.role}: ${m.content}`).join("\n");

    // Fetch Chart of Accounts (COA) leaf accounts so Gemini knows exact codes
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, ctx.orgId));
    const leafAccs = accRows.filter((a) => !accRows.some((c) => c.parentCode === a.code));
    const coaSummary = leafAccs
      .map((a) => `${a.code}: ${a.name} (${a.type}, normal ${a.normal})`)
      .join(", ");

    // Ingatan lintas sesi (Task 7): dibaca via withOrg agar lolos RLS app_user.
    let memoryBlock = "";
    let memoryCount = 0;
    try {
      if (orgSettings.aiMemoryEnabled !== false) {
        const mems = await withOrg(ctx.orgId, (tx) => listMemories(tx, ctx.orgId));
        memoryCount = mems.length;
        memoryBlock = formatMemoriesForPrompt(mems);
      }
    } catch (e) {
      console.warn("memory read skipped", e instanceof Error ? e.message : e);
    }
    const personaHeader = buildAkunioSystemPrompt({
      businessType,
      pageLabel: pageContext?.pathname ?? pageContext?.title ?? null,
      memoryBlock,
      answerLength: prefs.answerLength,
      citationsEnabled: prefs.citationsEnabled,
    });
    const systemInstruction = `${personaHeader}
- Tanggal hari ini: ${new Date().toISOString().slice(0, 10)} (Asia/Jakarta). Semua tanggal — transaksi, jatuh tempo, opname — mengacu ke tanggal ini; "akhir bulan ini" berarti hari terakhir bulan berjalan, bukan tanggal tebakan. Bila perlu kepastian (mis. jatuh tempo penting), panggil tool 'get_server_time' lalu hitung darinya.
- Anda memiliki akses ke berbagai Tool Akuntansi untuk membaca dan mengubah data.
- Daftar Tool yang tersedia:
  * Pembukuan Jurnal:
    - 'post_journal': Posting jurnal double-entry resmi ke buku besar (JE-YYYY-NNNN).
    - 'create_journal_draft': Buat draft jurnal untuk ditinjau oleh pengguna.
    - 'reverse_journal': Balikkan/batalkan entri jurnal yang salah.
    - 'search_journals', 'list_journals': Cari atau lihat riwayat entri jurnal.
  * Faktur & Tagihan:
    - 'create_invoice': Buat faktur penjualan (INVOICE) atau tagihan pembelian (BILL). WAJIB isi catalogItemId tiap baris bila barangnya terdaftar di katalog (cari dulu via 'list_inventory_items') — tanpa itu posting jatuh ke akun default yang bisa berupa akun induk dan gagal.
    - 'update_invoice': Koreksi faktur (jatuh tempo/catatan kapan pun; rincian barang hanya bila belum diposting). Untuk "ubah/edit/betulkan faktur", cari dulu via 'list_invoices' bila nomor belum pasti.
    - 'record_invoice_payment': Catat pelunasan faktur.
    - 'post_invoice_to_journal': Posting faktur ke jurnal buku besar.
    - 'list_invoices', 'get_invoice_detail': Daftar dan rincian faktur/tagihan (status, sisa).
    - 'get_ar_ap_aging': Analisis umur piutang dan utang usaha.
  * Kontak & Buku Pembantu:
    - 'list_contacts', 'find_contact': Daftar/cari pelanggan-pemasok. Selalu 'find_contact' dulu sebelum update_contact atau sebelum menyebut kontak di mutasi lain agar id-nya pasti.
    - 'create_contact', 'update_contact': Daftarkan/ubah kontak (butuh konfirmasi).
    - 'list_contact_ledgers', 'get_contact_ledger': Ringkasan dan kartu piutang (INVOICE) / utang (BILL) per kontak — untuk "tagihan Pak Budi kurang berapa".
    - 'get_item_stock_card': Kartu mutasi + sisa stok per barang.
  * Kas & Bank:
    - 'list_cash_entries', 'get_cash_summary': Mutasi dan posisi kas (BAYAR/TERIMA/TRANSFER).
    - 'record_cash_entry': Catat pembayaran/penerimaan/transfer sebagai DRAF (pengesahan tetap di UI). Jangan gunakan 'post_journal' mentah untuk mutasi kas. Lawan Piutang/Utang wajib sertakan contactId (cari via find_contact).
  * Rekonsiliasi Bank:
    - 'get_bank_reconciliation_status': Cek saldo bank vs saldo buku kas vs selisih.
    - 'auto_match_bank_reconciliation': Jalankan pencocokan otomatis mutasi bank.
  * Laporan & Operasional:
    - 'get_daily_briefing': Ringkasan harian kas, laba, dan transaksi tertunda.
    - 'get_report': Laporan neraca, laba_rugi, arus_kas, perubahan_ekuitas.
    - 'list_accounts', 'drilldown_account_details', 'check_accounting_health', 'list_periods'.
  * Persediaan & Inventaris Barang Dagang:
    - 'list_inventory_items': Lihat daftar stok barang, harga modal rata-rata, harga jual, dan kategori.
    - 'list_stock_opnames': Riwayat stok opname + selisihnya.
    - 'create_stock_opname': Buat DRAF opname dari hasil hitung fisik (pengesahan tetap di UI; item dirujuk per itemId dari list_inventory_items).
    - 'add_inventory_item': Tambah 1 barang baru ke master persediaan (butuh konfirmasi).
    - 'batch_add_inventory_items': Tambah puluhan SKU barang sekaligus ke master persediaan (butuh konfirmasi).
      JIKA PENGGUNA MENGUNGGAH FILE EXCEL / CSV ATAU MEMINTA INPUT BANYAK BARANG:
      AI WAJIB mengekstrak data tabel barang tersebut secara cerdas (Kode SKU, Nama Barang, Kategori, Satuan, Stok Awal, Harga Modal, Harga Jual, Min. Stok),
      kemudian memanggil tool 'batch_add_inventory_items' dengan list items lengkap untuk ditinjau dan disetujui pengguna!
  * Aset Tetap & Penyusutan:
    - 'list_fixed_assets': Daftar aset (kode, kategori, status, harga perolehan).
    - 'register_fixed_asset': Daftarkan aset baru + jadwal susutnya; akun-akunnya cari dulu via list_accounts.
    - 'recommend_asset_depreciation': Rekomendasi masa manfaat, tarif, dan metode penyusutan (Garis Lurus / Saldo Menurun).
    - 'run_monthly_depreciation': Posting beban penyusutan bulanan ke buku besar.
- ATURAN KONTEKS PERCAKAPAN (ANTI-LUPA, WAJIB):
  * Jika pesan pengguna singkat / konfirmasi tanpa detail ("ok", "ya", "catatkan ya", "lanjutkan", "proses", "apa itu maksud ...?" lalu "ok"),
    WAJIB ambil objek pembicaraan dari Riwayat Percakapan — JANGAN minta ulang detail yang sudah ada di riwayat.
  * Contoh: riwayat memuat "aset laptop 10jt" + rekomendasi Garis Lurus 48 bulan, lalu user berkata "ok catatkan ya"
    → anggap user menyetujui pencatatan aset laptop Rp10.000.000 metode Garis Lurus. Jangan jawab generik "sebutkan detail transaksinya".
  * Hanya tanyakan field yang benar-benar belum ada (mis. sumber dana / tanggal beli bila belum disebut), sebutkan kembali nilai yang sudah diketahui agar user tinggal konfirmasi.
- Aturan Pencatatan Transaksi:
  Ketika pengguna meminta mencatat transaksi (misal: "catat awal modal usaha saya 1 juta ya" atau "catat bayar sewa 5jt"):
${prefs.postDirectly
  ? `  UTAMAKAN 'post_journal' — kartu persetujuan berisi rincian akun tetap tampil dan pengguna menyetujui sebelum posting, jadi hasilnya langsung POSTED.
  'create_journal_draft' HANYA bila pengguna eksplisit meminta draft ("buatkan draft", "jangan posting dulu").`
  : `  WAJIB 'create_journal_draft' — pengguna mengatur selalu draft dulu. Jangan posting langsung; draft ditinjau di menu Jurnal.`}
  Pilihlah akun yang tepat dari Daftar Akun (COA) Tersedia (misal Kas: 1110, Modal Disetor: 3100).
  Pastikan jumlah Debit dan Kredit seimbang.
${prefs.followupEnabled ? "" : "- Saran tindak lanjut MATI: jangan tawarkan langkah berikutnya, jangan sertakan saran/pertanyaan susulan — selesai jawab, berhenti."}
- Aturan Pencatatan Persediaan Barang:
  * Setiap menyebut barang yang sudah terdaftar, tulis sebagai tautan [Nama (KODE)](item:KODE) — mis. [Shampo (BRG-001)](item:BRG-001) — agar pengguna bisa membuka rincian barang.
  * Stok opname / stok awal ("catat stok awal", "catatkan hasil hitung"): panggil 'create_stock_opname' dengan postImmediately=true (satu kartu persetujuan rinci, stok langsung bertambah + jurnal penyesuaian terposting). postImmediately=false HANYA bila pengguna eksplisit meminta draf opname. Cari itemId dulu via 'list_inventory_items'.
  * KEJUJURAN HASIL (WAJIB): jangan pernah menyatakan draf/opname/jurnal/faktur "berhasil dibuat" kecuali hasil tool mengonfirmasinya. Tanpa hasil tool, katakan rencananya dan minta persetujuan lewat tool.
  * Jika pengguna memberikan rincian barang (misal: "tambahkan barang SKU BRG-101 Kopi Susu modal 12rb jual 18rb stok 50"), gunakan 'add_inventory_item'.
  * Jika pengguna mengunggah file spreadsheet/CSV atau memberikan daftar banyak barang, ekstrak seluruh baris barang dan panggil 'batch_add_inventory_items'.
- Aturan Pencatatan Aset Tetap:
  * Untuk pertanyaan ("metode apa?", "masa manfaat berapa?") panggil 'recommend_asset_depreciation' dulu bila relevan.
  * Untuk perintah mencatat aset ("catatkan laptop 10jt ya"): ingat nama + nominal + metode dari riwayat.
    Jika sumber dana / tanggal belum jelas, tanyakan HANYA itu (sambil menyebut kembali data yang sudah ada).
    Jika user sudah menyetujui, siapkan pencatatan via tool jurnal/draf yang sesuai atau arahkan ke /aset/baru dengan ringkasan terisi — jangan mengulang pertanyaan umum.
- Aturan Pengambilan Laporan / Briefing:
  Panggil tool terkait, lalu sampaikan ringkasannya secara natural dan informatif.
  Hasil get_report OTOMATIS tampil sebagai tabel laporan baku (seksi + subtotal + status seimbang) — JANGAN tulis ulang tabelnya; cukup satu kalimat bacaan (mis. total aset, laba/rugi, seimbang atau tidak).
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

${attachments.length > 0 ? `(Pengguna melampirkan ${attachments.length} dokumen. Ekstrak data transaksi, barang persediaan, atau angka dari gambar/PDF/CSV/Excel terlampir bila relevan.)` : ""}`;

    // Prepare multimodal content parts
    const contentParts: Array<{ type: string; text?: string; data?: string; mime_type?: string }> = [
      { type: "text", text: fullPrompt },
    ];

    for (const att of attachments) {
      try {
        const buf = await getDocument(att.storageKey);
        if (att.mime === "text/csv" || att.mime === "text/plain") {
          // Send plain text content directly for high-fidelity extraction
          contentParts.push({
            type: "text",
            text: `\n--- ISI FILE TERLAMPIR (${att.fileName}) ---\n${buf.toString("utf-8")}\n--- AKHIR ISI FILE ---`,
          });
        } else {
          const type = att.mime === "application/pdf" ? "document" : "image";
          contentParts.push({
            type,
            data: buf.toString("base64"),
            mime_type: att.mime,
          });
        }
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
          // Server-side memory per thread: store:true + previous_interaction_id.
          // Jika id basi/kedaluwarsa, ulangi sekali tanpa chaining.
          let interactionStream: AsyncIterable<{
            event_type: string;
            index?: number;
            delta?: { type: string; text?: string; content?: { text?: string }; arguments?: string };
            step?: { type: string; name?: string; arguments?: unknown; call_id?: string; id?: string };
            interaction?: { id?: string };
          }>;
          let latestInteractionId: string | null = null;
          const baseMemory = previousInteractionId
            ? { store: STORE_INTERACTIONS, previous_interaction_id: previousInteractionId }
            : { store: STORE_INTERACTIONS };
          try {
            interactionStream = (await ai.interactions.create({
              model: selectedModel,
              input: [{ type: "user_input", content: contentParts as never }] as never,
              stream: true,
              ...baseMemory,
              tools: ALL_NARA_TOOLS,
              generation_config: modelPreset === "deep" ? { thinking_summaries: "auto" } : undefined,
            })) as unknown as typeof interactionStream;
          } catch (e) {
            if (previousInteractionId && isStaleInteractionError(e)) {
              console.warn("previous_interaction_id basi, ulangi tanpa chaining", e);
              await clearThreadInteractionId(ctx.orgId, threadId!);
              previousInteractionId = null;
              interactionStream = (await ai.interactions.create({
                model: selectedModel,
                input: [{ type: "user_input", content: contentParts as never }] as never,
                stream: true,
                store: STORE_INTERACTIONS,
                tools: ALL_NARA_TOOLS,
                generation_config: modelPreset === "deep" ? { thinking_summaries: "auto" } : undefined,
              })) as unknown as typeof interactionStream;
            } else {
              throw e;
            }
          }

          for await (const event of interactionStream as AsyncIterable<{
            event_type: string;
            index?: number;
            delta?: { type: string; text?: string; content?: { text?: string }; arguments?: string };
            step?: { type: string; name?: string; arguments?: unknown; call_id?: string; id?: string };
            interaction?: { id?: string };
          }>) {
            const idx = event.index ?? 0;

            if (
              (event.event_type === "interaction.created" || event.event_type === "interaction.completed") &&
              event.interaction?.id
            ) {
              latestInteractionId = event.interaction.id;
            }

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
                // Batas nominal: aksi di atas ambang selalu minta persetujuan,
                // bahkan dalam mode autonomous / selalu-izinkan. Tak terukur = minta izin.
                let overThreshold = false;
                if (prefs.approvalThresholdMinor) {
                  try {
                    const limit = BigInt(prefs.approvalThresholdMinor);
                    const amount = maxMinorFromArgs(toolName, args);
                    overThreshold = amount === null || amount > limit;
                  } catch {}
                }
                const shouldAutoExecute =
                  !overThreshold &&
                  (isSafe || hitlPolicy === "autonomous" || (isMutating && allowAllForSession));

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
                    if (prefs.followupEnabled && Array.isArray(dataObj.suggestions) && dataObj.suggestions.length > 0) {
                      send({ type: "suggestions", suggestions: dataObj.suggestions });
                    }
                    if (dataObj.batchId && Array.isArray(dataObj.items)) {
                      send({ type: "queue_update", batchId: dataObj.batchId, items: dataObj.items });
                    }
                  }
                } else {
                  // Must request HITL approval from user with COMPLETE args.
                  // Opname: perkaya dengan nama/kode barang agar kartu persetujuan
                  // selalu rinci (bukan JSON mentah / itemId saja).
                  let approvalArgs: Record<string, unknown> = args;
                  if (toolName === "create_stock_opname" && Array.isArray(args.items)) {
                    try {
                      const allItems = await listInventoryItems(db, ctx.orgId);
                      const byId = new Map(allItems.map((it) => [it.id, it]));
                      approvalArgs = {
                        ...args,
                        itemsDetail: (args.items as Array<Record<string, unknown>>).map((it) => {
                          const found = byId.get(String(it.itemId ?? ""));
                          return {
                            code: found?.code ?? "?",
                            name: found?.name ?? String(it.itemId ?? "?"),
                            unit: found?.unit ?? "",
                            physicalQty:
                              typeof it.physicalQty === "number"
                                ? it.physicalQty
                                : Number(it.physicalQty ?? 0),
                            reason: typeof it.reason === "string" ? it.reason : "",
                          };
                        }),
                      };
                    } catch {}
                  }
                  // Posting jurnal: tandai status periode tanggal transaksi agar
                  // kartu persetujuan bisa memperingatkan bila periode tak OPEN.
                  if (toolName === "post_journal" && typeof args.dateISO === "string") {
                    try {
                      const period = await findPeriodByDate(db, ctx.orgId, args.dateISO.slice(0, 10));
                      if (period) {
                        approvalArgs = {
                          ...approvalArgs,
                          periodStatus: period.status,
                          periodName: period.name,
                        };
                      }
                    } catch {}
                  }
                  send({
                    type: "tool_approval_request",
                    callId,
                    toolName,
                    args: approvalArgs,
                    explanation: `Akunio membutuhkan konfirmasi Anda untuk menjalankan '${toolName}'.`,
                  });
                  toolInvocations.push({
                    callId,
                    toolName,
                    status: "pending_approval",
                    args: approvalArgs,
                  });

                  if (!fullText) {
                    let pendingMsg = `Berikut rincian tindakan yang perlu Anda konfirmasi:`;
                    if (toolName === "post_journal" || toolName === "create_journal_draft") {
                      pendingMsg = `Berikut draf jurnal untuk pencatatan transaksi Anda:`;
                    } else if (toolName === "create_invoice") {
                      pendingMsg = `Berikut draf faktur yang telah saya siapkan:`;
                    } else if (toolName === "create_stock_opname") {
                      pendingMsg =
                        args.postImmediately !== false
                          ? `Berikut rincian opname yang akan langsung disahkan (stok bertambah):`
                          : `Berikut draf opname untuk ditinjau:`;
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

              const synthPrompt = `Anda adalah Akunio, Asisten Akuntansi AI Cerdas.
Pengguna bertanya: "${trimmedMsg}"
Hasil eksekusi data di sistem:
${toolContext}

Konteks Saldo Terkini:
${liveNumbers}

Tugas:
1. Berikan penjelasan yang hangat, ramah, dan mengalir santai dalam Bahasa Indonesia berdasarkan hasil data di atas.
2. Hindari memberi tanda bintang tunggal (*kata*) pada kata biasa. Tuliskan secara wajar atau gunakan **teks tebal** hanya untuk judul poin utama.
3. Data terstruktur (angka laporan, mutasi, daftar) disajikan sebagai tabel markdown ringkas (maks 4 kolom, nominal Rp), bukan poin berderet. Satu kalimat bacaan sesudahnya, tanpa daftar saran.
4. Langsung sampaikan informasi intinya secara jelas dan solutif.`;

              const synthStream = await ai.interactions.create({
                model: selectedModel,
                input: [{ type: "user_input", content: [{ type: "text", text: synthPrompt }] } as never],
                stream: true,
                store: STORE_INTERACTIONS,
                ...(latestInteractionId || previousInteractionId
                  ? { previous_interaction_id: latestInteractionId ?? previousInteractionId! }
                  : {}),
              });

              for await (const sEvent of synthStream as AsyncIterable<{
                event_type: string;
                delta?: { type: string; text?: string };
                interaction?: { id?: string };
              }>) {
                if (sEvent.event_type === "interaction.created" && sEvent.interaction?.id) {
                  latestInteractionId = sEvent.interaction.id;
                }
                if (sEvent.event_type === "step.delta" && sEvent.delta?.type === "text" && sEvent.delta.text) {
                  fullText += sEvent.delta.text;
                  send({ type: "text", delta: sEvent.delta.text });
                }
                if (sEvent.event_type === "interaction.completed" && sEvent.interaction?.id) {
                  latestInteractionId = sEvent.interaction.id;
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

          // Persist assistant message to database + simpan memory Gemini per thread
          const assistantMsg = await db.transaction((tx) =>
            addMessage(tx, threadId!, "assistant", fullText || "(Menunggu tindakan)", {
              reasoning: fullReasoning || undefined,
              toolInvocations: toolInvocations.length > 0 ? toolInvocations : null,
              citations: citations.length > 0 ? citations : null,
            }),
          );
          if (latestInteractionId) {
            await saveThreadInteractionId(ctx.orgId, threadId!, latestInteractionId);
          }

          send({
            type: "done",
            messageId: assistantMsg.id,
            citations,
            memoryUsed: memoryCount,
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
