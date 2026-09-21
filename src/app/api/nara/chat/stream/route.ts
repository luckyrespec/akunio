import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import {
  createThread,
  getThread,
  addMessage,
  listMessages,
  checkAssistantQuota,
} from "@/server/db/repos/chat.repo";
import {
  getFunctionResponses,
  REQUEST_CONFIRMATION_FUNCTION_CALL_NAME,
} from "@google/adk";
import type { Content } from "@google/genai";
import {
  clearThreadInteractionId,
  isStaleInteractionError,
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
import {
  buildRoutedAdkAgent,
  clearAdkRunner,
  getAdkRunner,
  routeAdkIntent,
} from "@/server/ai/agents/adk-runner";
import { getOrCreateAdkSession, syncTurnToThread } from "@/server/ai/session-bridge";
import { buildConfirmationText } from "@/server/ai/confirmation-text";

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

    const quota = await withOrg(ctx.orgId, (tx) => checkAssistantQuota(tx, ctx.orgId));
    if (!quota.allowed) {
      return NextResponse.json({ error: quota.message ?? "Kuota interaksi AI habis bulan ini." }, { status: 429 });
    }

    if (!threadId) {
      const title = generateSmartTitle(trimmedMsg);
      const newT = await withOrg(ctx.orgId, (tx) => createThread(tx, ctx.orgId, title, modelPreset));
      threadId = newT.id;
    } else {
      const tid: string = threadId;
      const existingT = await withOrg(ctx.orgId, (tx) => getThread(tx, ctx.orgId, tid));
      if (!existingT) {
        return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
      }
    }

    // Save user message to database
    await withOrg(ctx.orgId, (tx) =>
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
        await withOrg(ctx.orgId, (tx) =>
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
    const [orgRow] = await withOrg(ctx.orgId, (tx) =>
      tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)),
    );
    const orgSettings = (orgRow?.settings ?? {}) as {
      aiHitlPolicy?: "smart" | "strict" | "autonomous";
      aiMemoryEnabled?: boolean;
    };
    const hitlPolicy = orgSettings.aiHitlPolicy ?? "smart";
    const prefs = parseAiPrefs(orgRow?.settings);

    // Profil usaha untuk sudut persona (read-only, bukan tool).
    let businessType: string | null = null;
    try {
      const [prof] = await withOrg(ctx.orgId, (tx) =>
        tx.select().from(orgProfiles).where(eq(orgProfiles.orgId, ctx.orgId)),
      );
      businessType = prof?.businessType ?? null;
    } catch {}

    // ADK runner memanggil model Gemini langsung — kunci tetap wajib.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API Key Gemini belum dikonfigurasi." }, { status: 500 });
    }

    // Gather contextual data
    let ragContext = "";
    let citations: Array<{ kind: string; ref: string; excerpt: string; score: number; section?: string }> = [];
    try {
      const queryEmbedding = await embed(trimmedMsg || "akuntansi");
      const hits = await withOrg(ctx.orgId, (tx) =>
        hybridSearch(ctx.orgId, queryEmbedding, trimmedMsg || "akuntansi", 5, tx),
      );
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
    const history = await withOrg(ctx.orgId, (tx) => listMessages(tx, threadId!));
    // 12 pesan terakhir agar konfirmasi singkat ("ok catatkan ya") tetap
    // punya konteks objeknya (mis. aset laptop 10jt + metode Garis Lurus).
    const lastMessages = history.slice(-12).map((m) => `${m.role}: ${m.content}`).join("\n");

    // Fetch Chart of Accounts (COA) leaf accounts so Gemini knows exact codes
    const accRows = await withOrg(ctx.orgId, (tx) =>
      tx.select().from(accounts).where(eq(accounts.orgId, ctx.orgId)),
    );
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

    // Instruksi ADK: seluruh konteks (angka, COA, RAG, riwayat) seperti prompt
    // lama; pesan user dikirim sebagai turn message agar sesi ADK utuh.
    const adkInstruction = `${systemInstruction}

Konteks Angka Terkini:
${liveNumbers}

Daftar Akun (COA) Tersedia:
${coaSummary}
${pageContextStr}
Konteks Dokumen / Aturan:
${ragContext}

Riwayat Percakapan:
${lastMessages}

${attachments.length > 0 ? `(Pengguna melampirkan ${attachments.length} dokumen. Ekstrak data transaksi, barang persediaan, atau angka dari gambar/PDF/CSV/Excel terlampir bila relevan.)` : ""}`;

    // Pesan turn ADK (multimodal: teks/CSV inline, biner sebagai inlineData).
    const msgParts: NonNullable<Content["parts"]> = [
      { text: trimmedMsg || "Lampiran dikirim" },
    ];
    for (const att of attachments) {
      try {
        const buf = await getDocument(att.storageKey);
        if (att.mime === "text/csv" || att.mime === "text/plain") {
          msgParts.push({
            text: `\n--- ISI FILE TERLAMPIR (${att.fileName}) ---\n${buf.toString("utf-8")}\n--- AKHIR ISI FILE ---`,
          });
        } else {
          msgParts.push({
            inlineData: { mimeType: att.mime, data: buf.toString("base64") },
          });
        }
      } catch (err) {
        console.warn(`Gagal memuat attachment ${att.storageKey}`, err);
      }
    }
    const newMessage: Content = { role: "user", parts: msgParts };

    const selectedModel = modelPreset === "deep" ? "gemini-3.7-flash" : "gemini-3.5-flash-lite";
    // Jembatan session: validasi thread + kunci sesi ADK (sessionId = threadId).
    await getOrCreateAdkSession(ctx.orgId, threadId!);

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
          invocationId?: string;
          toolName: string;
          status: string;
          args: unknown;
          result?: unknown;
        }> = [];
        // Argumen per functionCall agar tool_call SSE rinci (ADK tak mengulang
        // args di functionResponse).
        const callArgs = new Map<string, unknown>();

        try {
          const route = routeAdkIntent(trimmedMsg);
          const agent = buildRoutedAdkAgent({
            orgId: ctx.orgId,
            actorEmail: ctx.userEmail,
            route,
            instruction: adkInstruction,
            model: selectedModel,
            gate: { prefs, hitlPolicy, allowAllForSession },
          });
          let runner = await getAdkRunner({
            orgId: ctx.orgId,
            userId: ctx.userEmail,
            threadId: threadId!,
            agent,
          });

          // Sesi ADK basi/kedaluwarsa → ulangi sekali tanpa chaining (sesi
          // segar + thread interaction id dibersihkan), pola lama dipertahankan.
          let staleRetried = false;
          for (;;) {
            try {
              for await (const event of runner.runAsync({
                userId: ctx.userEmail,
                sessionId: threadId!,
                newMessage,
              })) {
                const parts = event.content?.parts ?? [];
                for (const part of parts) {
                  if (typeof part.text === "string" && part.text) {
                    if (part.thought === true) {
                      fullReasoning += part.text;
                      send({ type: "reasoning", delta: part.text });
                    } else {
                      fullText += part.text;
                      send({ type: "text", delta: part.text });
                    }
                  }
                  const fc = part.functionCall;
                  if (!fc?.name) continue;
                  if (typeof fc.id === "string" && fc.args !== undefined) {
                    callArgs.set(fc.id, fc.args);
                  }
                  if (fc.name !== REQUEST_CONFIRMATION_FUNCTION_CALL_NAME) continue;
                  // Event adk_request_confirmation → SSE tool_approval_request
                  // (kontrak lama untuk NaraHitlApprovalCard).
                  const cArgs = (fc.args ?? {}) as Record<string, unknown>;
                  const pinned = (cArgs.originalFunctionCall ?? {}) as {
                    id?: unknown;
                    name?: unknown;
                    args?: unknown;
                  };
                  const toolName =
                    typeof pinned.name === "string" ? pinned.name : "";
                  const callId =
                    typeof pinned.id === "string" ? pinned.id : `call_${Date.now()}`;
                  const rawArgs =
                    pinned.args !== null && typeof pinned.args === "object"
                      ? (pinned.args as Record<string, unknown>)
                      : {};

                  // Must request HITL approval from user with COMPLETE args.
                  // Opname: perkaya dengan nama/kode barang agar kartu persetujuan
                  // selalu rinci (bukan JSON mentah / itemId saja).
                  let approvalArgs: Record<string, unknown> = rawArgs;
                  if (toolName === "create_stock_opname" && Array.isArray(rawArgs.items)) {
                    try {
                      const allItems = await withOrg(ctx.orgId, (tx) => listInventoryItems(tx, ctx.orgId));
                      const byId = new Map(allItems.map((it) => [it.id, it]));
                      approvalArgs = {
                        ...rawArgs,
                        itemsDetail: (rawArgs.items as Array<Record<string, unknown>>).map((it) => {
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
                  if (toolName === "post_journal" && typeof rawArgs.dateISO === "string") {
                    try {
                      const dateISO: string = rawArgs.dateISO;
                      const period = await withOrg(ctx.orgId, (tx) =>
                        findPeriodByDate(tx, ctx.orgId, dateISO.slice(0, 10)),
                      );
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
                    invocationId: typeof fc.id === "string" ? fc.id : undefined,
                    toolName,
                    args: approvalArgs,
                    explanation: `Akunio membutuhkan konfirmasi Anda untuk menjalankan '${toolName}'.`,
                  });
                  toolInvocations.push({
                    callId,
                    invocationId: typeof fc.id === "string" ? fc.id : undefined,
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
                        rawArgs.postImmediately !== false
                          ? `Berikut rincian opname yang akan langsung disahkan (stok bertambah):`
                          : `Berikut draf opname untuk ditinjau:`;
                    }
                    fullText = pendingMsg;
                    send({ type: "text", delta: pendingMsg });
                  }
                }

                for (const fr of getFunctionResponses(event)) {
                  if (fr.name === REQUEST_CONFIRMATION_FUNCTION_CALL_NAME) continue;
                  const payload =
                    fr.response !== null && typeof fr.response === "object"
                      ? (fr.response as Record<string, unknown>)
                      : {};
                  // AWAITING sudah diwakili kartu tool_approval_request di atas.
                  if (payload.status === "AWAITING_CONFIRMATION") continue;
                  const toolName = fr.name ?? "";
                  const callId =
                    typeof fr.id === "string" ? fr.id : `call_${Date.now()}`;
                  const ok = payload.status === "SUCCESS";
                  const result =
                    "data" in payload ? payload.data : (payload.message ?? null);
                  const args = callArgs.get(callId) ?? {};
                  send({ type: "tool_call", tool: toolName, status: "executing", args });
                  send({ type: "tool_result", tool: toolName, result });
                  toolInvocations.push({
                    callId,
                    toolName,
                    status: ok ? "auto" : "failed",
                    args,
                    result,
                  });

                  if (ok && result !== null && typeof result === "object") {
                    const dataObj = result as Record<string, unknown>;
                    if (prefs.followupEnabled && Array.isArray(dataObj.suggestions) && dataObj.suggestions.length > 0) {
                      send({ type: "suggestions", suggestions: dataObj.suggestions });
                    }
                    if (dataObj.batchId && Array.isArray(dataObj.items)) {
                      send({ type: "queue_update", batchId: dataObj.batchId, items: dataObj.items });
                    }
                  }
                }
              }
              break;
            } catch (e) {
              if (!staleRetried && isStaleInteractionError(e)) {
                console.warn("sesi ADK basi, ulangi tanpa chaining", e);
                staleRetried = true;
                await clearThreadInteractionId(ctx.orgId, threadId!);
                clearAdkRunner(ctx.orgId, threadId!);
                runner = await getAdkRunner({
                  orgId: ctx.orgId,
                  userId: ctx.userEmail,
                  threadId: threadId!,
                  agent,
                });
                continue;
              }
              throw e;
            }
          }

          // Sintesis akhir kini dihasilkan agen ADK dalam turn yang sama (hasil
          // tool sudah masuk konteks sebelum teks final). Bila model diam,
          // pakai teks konfirmasi per-tool seperti confirm route.
          const executedTools = toolInvocations.filter((t) => t.status === "auto");
          if (executedTools.length > 0 && !fullText) {
            fullText = executedTools.map((t) => buildConfirmationText(t.toolName, t.result)).join("\n");
            send({ type: "text", delta: fullText });
          }

          if (!fullText) {
            fullText = "Maaf, saya tidak menerima respons yang dapat ditampilkan. Silakan coba tanyakan kembali.";
            send({ type: "text", delta: fullText });
          }

          // Persist assistant message to database via session bridge.
          await syncTurnToThread(ctx.orgId, threadId!, {
            role: "assistant",
            content: fullText || "(Menunggu tindakan)",
            toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
            citations: citations.length > 0 ? citations : undefined,
            reasoning: fullReasoning || undefined,
          });
          let assistantId = `asst-${Date.now()}`;
          try {
            const after = await withOrg(ctx.orgId, (tx) => listMessages(tx, threadId!));
            for (let i = after.length - 1; i >= 0; i -= 1) {
              if (after[i].role === "assistant") {
                assistantId = after[i].id;
                break;
              }
            }
          } catch {}

          send({
            type: "done",
            messageId: assistantId,
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
