import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { executeNaraTool } from "@/server/ai/nara-tools";
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
        addMessage(tx, threadId, "assistant", `Tindakan ${toolName} dibatalkan atas permintaan Anda. Silakan beri tahu jika ada perubahan atau hal lain yang perlu dibantu.`, {
          toolInvocations: [{ callId, toolName, status: "rejected", args }],
        }),
      );
      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // User approved the action
    const execution = await executeNaraTool(ctx.orgId, ctx.userEmail, toolName, args);
    if (!execution.success) {
      await db.transaction((tx) =>
        addMessage(tx, threadId, "assistant", `Gagal mengeksekusi ${toolName}: ${execution.error}`, {
          toolInvocations: [{ callId, toolName, status: "failed", args, error: execution.error }],
        }),
      );
      return NextResponse.json({ ok: false, error: execution.error }, { status: 400 });
    }

    // Success response synthesis
    let confirmationText = `Tindakan ${toolName} berhasil dieksekusi.`;
    if (toolName === "post_journal") {
      const jData = execution.data as { number?: string; memo?: string };
      confirmationText = `Jurnal transaksi ${jData?.number ?? ""} ("${jData?.memo ?? ""}") berhasil diposting ke buku besar dengan status POSTED.`;
    } else if (toolName === "create_journal_draft") {
      const dData = execution.data as { id?: string; memo?: string };
      confirmationText = `Draft jurnal untuk "${dData?.memo ?? ""}" berhasil dibuat. Silakan tinjau dan posting di menu Jurnal.`;
    } else if (toolName === "create_invoice") {
      const iData = execution.data as { invoiceNumber?: string; customerName?: string; totalFormatted?: string };
      confirmationText = `Faktur #${iData?.invoiceNumber ?? ""} untuk ${iData?.customerName ?? ""} senilai ${iData?.totalFormatted ?? ""} berhasil dibuat.`;
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
    } else if (toolName === "reverse_journal") {
      const rData = execution.data as { reversalNumber?: string; targetNumber?: string };
      confirmationText = `Jurnal pembalik ${rData?.reversalNumber ?? ""} untuk ${rData?.targetNumber ?? ""} berhasil dibuat.`;
    } else if (toolName === "close_period" || toolName === "open_period") {
      const pData = execution.data as { name?: string; status?: string };
      confirmationText = `Periode akuntansi ${pData?.name ?? ""} sekarang berstatus ${pData?.status ?? ""}.`;
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memproses konfirmasi.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
