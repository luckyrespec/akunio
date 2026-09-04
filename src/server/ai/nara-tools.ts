import { coaToolDefs, coaHandlers } from "./tools/coa.tools";
import { journalToolDefs, journalHandlers } from "./tools/journal.tools";
import { reportsToolDefs, reportsHandlers } from "./tools/reports.tools";
import { invoicingToolDefs, invoicingHandlers } from "./tools/invoicing.tools";
import { reconciliationToolDefs, reconciliationHandlers } from "./tools/reconciliation.tools";
import { assetsAndClosingToolDefs, assetsAndClosingHandlers } from "./tools/assets-closing.tools";
import { inventoryToolDefs, inventoryHandlers } from "./tools/inventory.tools";
import type { ToolHandler } from "./tools/types";

export const SAFE_TOOLS = new Set<string>([
  "list_accounts",
  "search_journals",
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
  "record_invoice_payment",
  "post_invoice_to_journal",
  "auto_match_bank_reconciliation",
  "run_monthly_depreciation",
  "close_fiscal_period",
  "add_inventory_item",
  "batch_add_inventory_items",
]);

export const ALL_NARA_TOOLS = [
  ...coaToolDefs,
  ...journalToolDefs,
  ...reportsToolDefs,
  ...invoicingToolDefs,
  ...reconciliationToolDefs,
  ...assetsAndClosingToolDefs,
  ...inventoryToolDefs,
] as never[];

const toolHandlers: Record<string, ToolHandler> = {
  ...coaHandlers,
  ...journalHandlers,
  ...reportsHandlers,
  ...invoicingHandlers,
  ...reconciliationHandlers,
  ...assetsAndClosingHandlers,
  ...inventoryHandlers,
};

export async function executeNaraTool(
  orgId: string,
  actorEmail: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const handler = toolHandlers[toolName];
    if (!handler) {
      return { success: false, error: `Tool ${toolName} tidak dikenali.` };
    }
    return await handler(orgId, actorEmail, args);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Terjadi kesalahan saat mengeksekusi aksi.";
    return { success: false, error: msg };
  }
}
