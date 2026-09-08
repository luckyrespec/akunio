// Label ramah Bahasa Indonesia untuk tool Akunio.
// Nama mentah snake_case tidak pernah ditampilkan ke user (desain ThinkingTrace).

const LABELS: Record<string, string> = {
  // Laporan & briefing
  get_daily_briefing: "Ringkasan Briefing Harian",
  get_financial_kpis: "Menghitung KPI Keuangan",
  get_report: "Membaca Laporan",
  drilldown_account_details: "Menelusuri Detail Akun",
  check_accounting_health: "Memeriksa Kesehatan Pembukuan",
  list_periods: "Melihat Periode Pembukuan",
  open_period: "Membuka Periode",
  close_period: "Menutup Periode",
  // Jurnal & COA
  create_journal_draft: "Menyusun Draf Jurnal",
  post_journal: "Memposting Jurnal",
  reverse_journal: "Membalik Jurnal",
  search_journals: "Mencari Jurnal",
  list_journals: "Melihat Riwayat Jurnal",
  list_accounts: "Melihat Daftar Akun",
  create_account: "Menambah Akun",
  update_account: "Mengubah Akun",
  archive_account: "Mengarsipkan Akun",
  // Kas & bank
  list_cash_entries: "Memeriksa Kas & Bank",
  get_cash_summary: "Menghitung Posisi Kas",
  record_cash_entry: "Mencatat Mutasi Kas",
  get_bank_reconciliation_status: "Memeriksa Rekonsiliasi Bank",
  auto_match_bank_reconciliation: "Mencocokkan Mutasi Bank",
  batch_analyze_documents: "Menganalisis Dokumen",
  // Faktur & kontak
  create_invoice: "Membuat Faktur",
  record_invoice_payment: "Mencatat Pelunasan",
  get_ar_ap_aging: "Menganalisis Umur Piutang",
  post_invoice_to_journal: "Memposting Faktur ke Jurnal",
  list_invoices: "Melihat Daftar Faktur",
  get_invoice_detail: "Membaca Rincian Faktur",
  list_contacts: "Melihat Daftar Kontak",
  find_contact: "Mencari Kontak",
  create_contact: "Menambah Kontak",
  update_contact: "Mengubah Kontak",
  list_contact_ledgers: "Melihat Buku Pembantu",
  get_contact_ledger: "Membaca Kartu Piutang/Utang",
  get_item_stock_card: "Membaca Kartu Stok",
  // Persediaan & aset
  list_inventory_items: "Melihat Daftar Barang",
  add_inventory_item: "Menambah Barang",
  add_service_item: "Menambah Jasa",
  batch_add_inventory_items: "Menambah Banyak Barang",
  list_stock_opnames: "Melihat Riwayat Opname",
  create_stock_opname: "Membuat Stok Opname",
  list_fixed_assets: "Melihat Daftar Aset",
  register_fixed_asset: "Mendaftarkan Aset",
  recommend_asset_depreciation: "Merekomendasikan Penyusutan",
  run_monthly_depreciation: "Menjalankan Penyusutan",
  check_period_closing_readiness: "Memeriksa Kesiapan Tutup Buku",
  close_fiscal_period: "Menutup Periode Fiskal",
};

export function friendlyToolLabel(toolName: string): string {
  return LABELS[toolName] ?? "Memproses Data";
}

export type TraceStatus = "running" | "completed" | "error" | "awaiting-approval";

export function toolStatusText(status: TraceStatus): string {
  switch (status) {
    case "running":
      return "Berjalan";
    case "awaiting-approval":
      return "Menunggu persetujuan";
    case "error":
      return "Gagal";
    default:
      return "Selesai";
  }
}

export function thinkingTriggerLabel(isStreaming: boolean, _toolCount: number): string {
  if (isStreaming) return "Thinking…";
  return "Selesai berpikir";
}

export interface TraceItem {
  toolName: string;
  status?: string;
  error?: string | null;
}

export function shouldRenderTrace(opts: {
  reasoning?: string | null;
  tools: TraceItem[];
}): boolean {
  if (opts.reasoning && opts.reasoning.trim().length > 0) return true;
  return opts.tools.length > 0;
}
