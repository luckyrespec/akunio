import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { executeNaraTool } from "@/server/ai/nara-tools";
import { friendlyToolLabel } from "@/components/ai-elements/tool-labels";
import { addMessage, getThread } from "@/server/db/repos/chat.repo";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext();
    const body = await req.json().catch(() => ({}));
    const {
      threadId,
      callId,
      toolName,
      args,
      approved,
      allowAllForSession,
    } = body as {
      threadId?: string;
      callId: string;
      toolName: string;
      args: Record<string, unknown>;
      approved: boolean;
      allowAllForSession?: boolean;
    };

    if (!threadId || !toolName) {
      return NextResponse.json({ error: "threadId dan toolName wajib diisi." }, { status: 400 });
    }

    const thread = await getThread(db, ctx.orgId, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    }

    if (!approved) {
      // User rejected the action
      await db.transaction((tx) =>
        addMessage(tx, threadId, "assistant", `Baik, ${friendlyToolLabel(toolName)} dibatalkan atas permintaan Anda. Tidak ada perubahan di pembukuan — silakan beri tahu jika ada hal lain yang perlu dibantu.`, {
          toolInvocations: [{ callId, toolName, status: "rejected", args }],
        }),
      );
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // User approved the action
    const execution = await executeNaraTool(ctx.orgId, ctx.userEmail, toolName, args);
    if (!execution.success) {
      await db.transaction((tx) =>
        addMessage(tx, threadId, "assistant", `Maaf, ${friendlyToolLabel(toolName)} gagal: ${execution.error}`, {
          toolInvocations: [{ callId, toolName, status: "failed", args, error: execution.error }],
        }),
      );
      return NextResponse.json({ ok: false, error: execution.error }, { status: 400 });
    }

    // Success response synthesis
    let confirmationText = `${friendlyToolLabel(toolName)} selesai.`;
    if (toolName === "post_journal") {
      const jData = execution.data as { number?: string; memo?: string };
      confirmationText = `Jurnal transaksi ${jData?.number ?? ""} ("${jData?.memo ?? ""}") berhasil diposting ke buku besar dengan status POSTED.`;
    } else if (toolName === "create_journal_draft") {
      const dData = execution.data as { id?: string; memo?: string };
      confirmationText = `Draft jurnal untuk "${dData?.memo ?? ""}" berhasil dibuat. Silakan tinjau dan posting di menu Jurnal.`;
    } else if (toolName === "create_invoice") {
      const iData = execution.data as { invoiceNumber?: string; customerName?: string; totalFormatted?: string };
      confirmationText = `Faktur #${iData?.invoiceNumber ?? ""} untuk ${iData?.customerName ?? ""} senilai ${iData?.totalFormatted ?? ""} berhasil dibuat.`;
    } else if (toolName === "update_invoice") {
      const uData = execution.data as { invoiceNumber?: string; dueDate?: string; status?: string; totalFormatted?: string };
      confirmationText = `Faktur #${uData?.invoiceNumber ?? ""} berhasil dikoreksi${uData?.dueDate ? ` (jatuh tempo ${uData.dueDate})` : ""}${uData?.totalFormatted ? ` — total ${uData.totalFormatted}` : ""}.`;
    } else if (toolName === "add_inventory_item") {
      const iData = execution.data as { code?: string; name?: string; photoWarning?: string };
      confirmationText = `Barang ${iData?.name ?? ""} (${iData?.code ?? ""}) berhasil didaftarkan ke master persediaan.`;
      if (iData?.photoWarning) {
        confirmationText += ` Catatan foto: ${iData.photoWarning} — buka detail barang untuk upload versi ≤500 KB.`;
      }
    } else if (toolName === "batch_add_inventory_items") {
      const bData = execution.data as { insertedCount?: number };
      confirmationText = `Berhasil mendaftarkan ${bData?.insertedCount ?? 0} barang ke katalog persediaan.`;
    } else if (toolName === "record_invoice_payment") {
      const pData = execution.data as { invoiceNumber?: string; amountFormatted?: string };
      confirmationText = `Pelunasan faktur #${pData?.invoiceNumber ?? ""} sebesar ${pData?.amountFormatted ?? ""} berhasil dicatat.`;
    } else if (toolName === "post_invoice_to_journal") {
      const pData = execution.data as { invoiceNumber?: string; journalEntryId?: string };
      confirmationText = `Faktur #${pData?.invoiceNumber ?? ""} berhasil diposting ke jurnal buku besar.`;
    } else if (toolName === "auto_match_bank_reconciliation") {
      const mData = execution.data as { exactMatchesCount?: number; aiSuggestionsCount?: number };
      confirmationText = `Auto-match rekonsiliasi selesai: ${mData?.exactMatchesCount ?? 0} transaksi otomatis cocok, ${mData?.aiSuggestionsCount ?? 0} saran AI dihasilkan.`;
    } else if (toolName === "create_account") {
      const aData = execution.data as { code?: string; name?: string };
      confirmationText = `Akun ${aData?.code ?? ""} - ${aData?.name ?? ""} berhasil ditambahkan ke bagan akun (COA).`;
    } else if (toolName === "create_stock_opname") {
      const oData = execution.data as { number?: string; status?: string; journalNumber?: string | null };
      confirmationText =
        oData?.status === "COMPLETED"
          ? `Stok opname ${oData?.number ?? ""} selesai${oData?.journalNumber ? ` — jurnal penyesuaian ${oData.journalNumber} terposting` : ""}. Persediaan bertambah.`
          : `Draf opname ${oData?.number ?? ""} dibuat. Tinjau dan sahkan di menu Persediaan agar stok bertambah.`;
    } else if (toolName === "create_contact" || toolName === "update_contact") {
      const cData = execution.data as { contact?: { name?: string; type?: string } };
      confirmationText =
        toolName === "create_contact"
          ? `Kontak ${cData?.contact?.name ?? ""} (${cData?.contact?.type ?? ""}) berhasil didaftarkan.`
          : `Kontak ${cData?.contact?.name ?? ""} berhasil diperbarui.`;
    } else if (toolName === "reverse_journal") {
      const rData = execution.data as { reversalNumber?: string; targetNumber?: string };
      confirmationText = `Jurnal pembalik ${rData?.reversalNumber ?? ""} untuk ${rData?.targetNumber ?? ""} berhasil dibuat.`;
    } else if (toolName === "close_period" || toolName === "open_period") {
      const pData = execution.data as { name?: string; status?: string };
      confirmationText = `Periode akuntansi ${pData?.name ?? ""} sekarang berstatus ${pData?.status ?? ""}.`;
    }

    // Saran tindak lanjut dari hasil tool (mis. "Posting ke Jurnal" setelah
    // faktur dibuat): ditempel ke teks tersimpan + diteruskan ke klien.
    const execData = execution.data as { suggestions?: unknown } | undefined;
    const suggestions = Array.isArray(execData?.suggestions)
      ? (execData.suggestions as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 4)
      : [];
    if (suggestions.length > 0) {
      confirmationText += " Ketuk salah satu saran di bawah untuk langkah berikutnya.";
    }

    const savedMsg = await db.transaction((tx) =>
      addMessage(tx, threadId, "assistant", confirmationText, {
        toolInvocations: [
          {
            callId,
            toolName,
            status: "approved",
            args,
            result: execution.data,
          },
        ],
      }),
    );

    return NextResponse.json({
      ok: true,
      status: "approved",
      allowAllForSession: Boolean(allowAllForSession),
      message: savedMsg,
      data: execution.data,
      suggestions,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memproses konfirmasi.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
