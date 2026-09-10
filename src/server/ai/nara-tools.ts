import { coaToolDefs, coaHandlers } from "./tools/coa.tools";
import { datetimeToolDefs, datetimeHandlers } from "./tools/datetime.tools";
import { journalToolDefs, journalHandlers } from "./tools/journal.tools";
import { reportsToolDefs, reportsHandlers } from "./tools/reports.tools";
import { invoicingToolDefs, invoicingHandlers } from "./tools/invoicing.tools";
import { reconciliationToolDefs, reconciliationHandlers } from "./tools/reconciliation.tools";
import { assetsAndClosingToolDefs, assetsAndClosingHandlers } from "./tools/assets-closing.tools";
import { inventoryToolDefs, inventoryHandlers } from "./tools/inventory.tools";
import { contactsToolDefs, contactsHandlers } from "./tools/contacts.tools";
import { subsidiaryToolDefs, subsidiaryHandlers } from "./tools/subsidiary.tools";
import { cashBankToolDefs, cashBankHandlers } from "./tools/cash-bank.tools";
import type { ToolHandler } from "./tools/types";

export const SAFE_TOOLS = new Set<string>([
  "get_server_time",
  "list_accounts",  "search_journals",
  "list_journals",
  "get_report",
  "get_financial_kpis",
  "get_daily_briefing",
  "drilldown_account_details",
  "batch_analyze_documents",
  "get_ar_ap_aging",
  "get_bank_reconciliation_status",
  "list_periods",
  "check_accounting_health",
  "recommend_asset_depreciation",
  "check_period_closing_readiness",
  "list_inventory_items",
  "list_contacts",
  "find_contact",
  "list_contact_ledgers",
  "get_contact_ledger",
  "get_item_stock_card",
  "list_cash_entries",
  "get_cash_summary",
  "list_invoices",
  "get_invoice_detail",
  "list_stock_opnames",
  "list_fixed_assets",
]);

export const MUTATING_TOOLS = new Set<string>([
  "create_journal_draft",
  "post_journal",
  "reverse_journal",
  "create_account",
  "update_account",
  "archive_account",
  "open_period",
  "close_period",
  "create_invoice",
  "update_invoice",
  "record_invoice_payment",
  "post_invoice_to_journal",
  "auto_match_bank_reconciliation",
  "run_monthly_depreciation",
  "close_fiscal_period",
  "add_inventory_item",
  "add_service_item",
  "batch_add_inventory_items",
  "create_contact",
  "update_contact",
  "record_cash_entry",
  "create_stock_opname",
  "register_fixed_asset",
]);

export const ALL_NARA_TOOLS = [
  ...coaToolDefs,
  ...datetimeToolDefs,
  ...journalToolDefs,
  ...reportsToolDefs,
  ...invoicingToolDefs,
  ...reconciliationToolDefs,
  ...assetsAndClosingToolDefs,
  ...inventoryToolDefs,
  ...contactsToolDefs,
  ...subsidiaryToolDefs,
  ...cashBankToolDefs,
] as never[];

/** Diekspor untuk test registry: setiap nama di SAFE/MUTATING wajib punya handler. */
export const naraToolHandlers: Record<string, ToolHandler> = {
  ...coaHandlers,
  ...datetimeHandlers,
  ...journalHandlers,
  ...reportsHandlers,
  ...invoicingHandlers,
  ...reconciliationHandlers,
  ...assetsAndClosingHandlers,
  ...inventoryHandlers,
  ...contactsHandlers,
  ...subsidiaryHandlers,
  ...cashBankHandlers,
};

export async function executeNaraTool(
  orgId: string,
  actorEmail: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const handler = naraToolHandlers[toolName];
    if (!handler) {
      return { success: false, error: `Tool ${toolName} tidak dikenali.` };
    }
    const out = await handler(orgId, actorEmail, args);
    // Hasil tool mengalir ke SSE (JSON.stringify), kolom jsonb, dan prompt
    // sintesis — BigInt mentah meledak di ketiganya. Netralkan sekali di sini.
    return { ...out, data: deBigInt(out.data) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Terjadi kesalahan saat mengeksekusi aksi.";
    return { success: false, error: msg };
  }
}

/** BigInt → string rekursif (objek lain diteruskan apa adanya). */
function deBigInt(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(deBigInt);
  if (v !== null && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, deBigInt(val)]));
  }
  return v;
}
