import { RoutedAgent, type BaseAgent } from "@google/adk";

export type AccountantRoute = "bookkeeping" | "analyst" | "invoice" | "coordinator";

const BOOKKEEPING_RE =
  /(catat|posting|draft|faktur|invoice|bayar|kas|jurnal|tagih|stok|opname|aset)/;
const ANALYST_RE =
  /(laba|rugi|laporan|neraca|analis|kenapa|turun|naik|kinerja|arus kas|ekuitas|sehat|aging|piutang|utang)/;
const INVOICE_RE =
  /(faktur|invoice|tagihan|upload|lampiran|struk|nota|kwitansi)/;

/**
 * Pre-route deterministik:
 * - analyst menang bila intent dokumen pembelian compete dengan laporan/laba
 *   (mis. "laporan invoice bulan ini");
 * - selain itu dokumen pembelian (faktur/tagihan/upload/struk/nota/kwitansi)
 *   ke invoice;
 * - aksi pencatatan lain ke bookkeeping (menang atas analisis umum);
 * - selain itu fallback ke coordinator (LLM delegasi).
 */
export function routeIntent(text: string): AccountantRoute {
  const t = text.toLowerCase();
  const wantsBookkeeping = BOOKKEEPING_RE.test(t);
  const wantsAnalyst = ANALYST_RE.test(t);
  const wantsInvoice = INVOICE_RE.test(t);
  if (wantsAnalyst && wantsInvoice) return "analyst";
  if (wantsInvoice) return "invoice";
  if (wantsBookkeeping) return "bookkeeping";
  if (wantsAnalyst) return "analyst";
  return "coordinator";
}

export interface AccountantSubagents {
  bookkeeping: BaseAgent;
  analyst: BaseAgent;
  invoice: BaseAgent;
  coordinator: BaseAgent;
}

/**
 * Router default ke coordinator (LLM yang mendelegasikan ke sub-agent).
 * Deterministic pre-route via routeIntent dilakukan di route SEBELUM runner
 * (Task 7) — router di sini tetap "coordinator" agar delegasi dinamis LLM
 * tetap hidup untuk kasus ambigu.
 */
export function buildAccountantRouter(subagents: AccountantSubagents) {
  return new RoutedAgent({
    name: "accountant_router",
    agents: {
      bookkeeping: subagents.bookkeeping,
      analyst: subagents.analyst,
      invoice: subagents.invoice,
      coordinator: subagents.coordinator,
    },
    router: () => "coordinator",
  });
}
