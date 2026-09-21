import { friendlyToolLabel } from "@/components/ai-elements/tool-labels";

/**
 * Teks konfirmasi Bahasa Indonesia per-tool (kontrak lama dipertahankan).
 * Pure function — dipakai confirm route (persetujuan) dan stream route
 * (fallback auto-execute tanpa teks model). Tanpa dependensi Next.
 */
export function buildConfirmationText(toolName: string, data: unknown): string {
  let confirmationText = `${friendlyToolLabel(toolName)} selesai.`;
  if (toolName === "post_journal") {
    const jData = data as { number?: string; memo?: string };
    confirmationText = `Jurnal transaksi ${jData?.number ?? ""} ("${jData?.memo ?? ""}") berhasil diposting ke buku besar dengan status POSTED.`;
  } else if (toolName === "create_journal_draft") {
    const dData = data as { id?: string; memo?: string };
    confirmationText = `Draft jurnal untuk "${dData?.memo ?? ""}" berhasil dibuat. Silakan tinjau dan posting di menu Jurnal.`;
  } else if (toolName === "create_invoice") {
    const iData = data as { invoiceNumber?: string; customerName?: string; totalFormatted?: string };
    confirmationText = `Faktur #${iData?.invoiceNumber ?? ""} untuk ${iData?.customerName ?? ""} senilai ${iData?.totalFormatted ?? ""} berhasil dibuat.`;
  } else if (toolName === "update_invoice") {
    const uData = data as { invoiceNumber?: string; dueDate?: string; status?: string; totalFormatted?: string };
    confirmationText = `Faktur #${uData?.invoiceNumber ?? ""} berhasil dikoreksi${uData?.dueDate ? ` (jatuh tempo ${uData.dueDate})` : ""}${uData?.totalFormatted ? ` — total ${uData.totalFormatted}` : ""}.`;
  } else if (toolName === "add_inventory_item") {
    const iData = data as { code?: string; name?: string; photoWarning?: string };
    confirmationText = `Barang ${iData?.name ?? ""} (${iData?.code ?? ""}) berhasil didaftarkan ke master persediaan.`;
    if (iData?.photoWarning) {
      confirmationText += ` Catatan foto: ${iData.photoWarning} — buka detail barang untuk upload versi ≤500 KB.`;
    }
  } else if (toolName === "batch_add_inventory_items") {
    const bData = data as { insertedCount?: number };
    confirmationText = `Berhasil mendaftarkan ${bData?.insertedCount ?? 0} barang ke katalog persediaan.`;
  } else if (toolName === "record_invoice_payment") {
    const pData = data as { invoiceNumber?: string; amountFormatted?: string };
    confirmationText = `Pelunasan faktur #${pData?.invoiceNumber ?? ""} sebesar ${pData?.amountFormatted ?? ""} berhasil dicatat.`;
  } else if (toolName === "post_invoice_to_journal") {
    const pData = data as { invoiceNumber?: string; journalEntryId?: string };
    confirmationText = `Faktur #${pData?.invoiceNumber ?? ""} berhasil diposting ke jurnal buku besar.`;
  } else if (toolName === "auto_match_bank_reconciliation") {
    const mData = data as { exactMatchesCount?: number; aiSuggestionsCount?: number };
    confirmationText = `Auto-match rekonsiliasi selesai: ${mData?.exactMatchesCount ?? 0} transaksi otomatis cocok, ${mData?.aiSuggestionsCount ?? 0} saran AI dihasilkan.`;
  } else if (toolName === "create_account") {
    const aData = data as { code?: string; name?: string };
    confirmationText = `Akun ${aData?.code ?? ""} - ${aData?.name ?? ""} berhasil ditambahkan ke bagan akun (COA).`;
  } else if (toolName === "create_stock_opname") {
    const oData = data as { number?: string; status?: string; journalNumber?: string | null };
    confirmationText =
      oData?.status === "COMPLETED"
        ? `Stok opname ${oData?.number ?? ""} selesai${oData?.journalNumber ? ` — jurnal penyesuaian ${oData.journalNumber} terposting` : ""}. Persediaan bertambah.`
        : `Draf opname ${oData?.number ?? ""} dibuat. Tinjau dan sahkan di menu Persediaan agar stok bertambah.`;
  } else if (toolName === "create_contact" || toolName === "update_contact") {
    const cData = data as { contact?: { name?: string; type?: string } };
    confirmationText =
      toolName === "create_contact"
        ? `Kontak ${cData?.contact?.name ?? ""} (${cData?.contact?.type ?? ""}) berhasil didaftarkan.`
        : `Kontak ${cData?.contact?.name ?? ""} berhasil diperbarui.`;
  } else if (toolName === "reverse_journal") {
    const rData = data as { reversalNumber?: string; targetNumber?: string };
    confirmationText = `Jurnal pembalik ${rData?.reversalNumber ?? ""} untuk ${rData?.targetNumber ?? ""} berhasil dibuat.`;
  } else if (toolName === "close_period" || toolName === "open_period") {
    const pData = data as { name?: string; status?: string };
    confirmationText = `Periode akuntansi ${pData?.name ?? ""} sekarang berstatus ${pData?.status ?? ""}.`;
  }
  return confirmationText;
}
