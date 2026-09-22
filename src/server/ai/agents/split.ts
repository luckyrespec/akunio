/** Pembagian tool per-agent fase-1 (spec §5). Daftar nama murni — eksekusi tetap via TOOL_REGISTRY + withOrg. */

export const BOOKKEEPING_TOOL_NAMES: string[] = [
  "search_journals",
  "list_journals",
  "create_journal_draft",
  "post_journal",
  "reverse_journal",
  "create_invoice",
  "update_invoice",
  "record_invoice_payment",
  "post_invoice_to_journal",
  "list_invoices",
  "get_invoice_detail",
  "list_cash_entries",
  "get_cash_summary",
  "record_cash_entry",
  "list_accounts",
  "list_contacts",
  "find_contact",
  "get_server_time",
  "calculate_tax",
  "validate_journal_entry",
  "check_period",
  "detect_duplicate_invoice",
];

export const ANALYST_TOOL_NAMES: string[] = [
  "get_report",
  "get_financial_kpis",
  "get_daily_briefing",
  "drilldown_account_details",
  "list_periods",
  "check_accounting_health",
  "get_ar_ap_aging",
  "list_invoices",
  "get_invoice_detail",
  "list_contact_ledgers",
  "get_contact_ledger",
  "get_item_stock_card",
  "get_bank_reconciliation_status",
  "list_accounts",
  "calculate_variance",
];

export const COORDINATOR_INSTRUCTION: string =
  "Kamu adalah koordinator akuntansi berbahasa Indonesia. " +
  "Pahami intent pengguna lalu delegasikan: tugas pencatatan (jurnal, faktur, kas) ke bookkeeping, " +
  "tugas laporan dan analisis (neraca, laba rugi, varians, tren, piutang/utang) ke analyst, " +
  "tugas dokumen pembelian / tagihan vendor (unggah faktur, struk, nota, kwitansi) ke invoice, " +
  "tugas rekonsiliasi bank (rekening koran, mutasi bank, selisih bank, cocokkan bank) ke bankrec. " +
  "Review hasil tool sebelum menjawab dan jawab ringkas dalam Bahasa Indonesia. " +
  "JANGAN menghitung di kepala — semua angka hanya dari hasil tool. " +
  "JANGAN posting langsung — setiap mutasi wajib lewat tool dan menunggu approval manusia.";

/** Toolset invoice_agent (BILL-only, read-only): ekstraksi + validasi intake
 *  faktur pembelian, dedup nomor, resolve vendor, dan jam server.
 *  KONTRAK: nol tool MUTATING — reviewer memverifikasi via MUTATING_TOOLS. */
export const INVOICE_TOOL_NAMES: string[] = [
  "extract_invoice",
  "validate_invoice",
  "detect_duplicate_invoice",
  "find_contact",
  "list_contacts",
  "get_server_time",
];

/** Toolset bankrec_agent: ingest rekening koran → match → jelaskan unmatched.
 *  KONTRAK: tanpa tool jurnal/posting/finalize — usulan jurnal lewat handoff
 *  bookkeeping, finalisasi tetap aksi manusia. get_bank_reconciliation_status
 *  overlap read-only dengan ANALYST. */
export const BANKREC_TOOL_NAMES: string[] = [
  "ingest_bank_statement",
  "get_bank_transactions",
  "get_book_transactions",
  "find_unmatched",
  "auto_match_bank_reconciliation",
  "get_bank_reconciliation_status",
  "get_server_time",
];
