import { RoutedAgent, type BaseAgent } from "@google/adk";

export type AccountantRoute = "bookkeeping" | "analyst" | "invoice" | "bankrec" | "coordinator";

const BOOKKEEPING_RE =
  /(catat|posting|draft|faktur|invoice|bayar|kas|jurnal|tagih|stok|opname|aset)/;
const ANALYST_RE =
  /(laba|rugi|laporan|neraca|analis|kenapa|turun|naik|kinerja|arus kas|ekuitas|sehat|aging|piutang|utang)/;
const INVOICE_RE =
  /(faktur|invoice|tagihan|upload|lampiran|struk|nota|kwitansi)/;
const BANKREC_RE =
  /(rekon(siliasi)?|recon|koran|mutasi bank|selisih bank|cocokkan bank)/;

/**
 * Pre-route deterministik (prioritas: analyst > bankrec > invoice > bookkeeping > coordinator):
 * - analyst menang bila intent dokumen pembelian compete dengan laporan/laba
 *   (mis. "laporan invoice bulan ini");
 * - analis laporan juga menang atas bankrec murni (mis. "laporan rekonsiliasi bank");
 * - selain itu intent koran/mutasi/selisih bank ke bankrec;
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
  const wantsBankrec = BANKREC_RE.test(t);
  if (wantsAnalyst && wantsInvoice) return "analyst";
  if (wantsAnalyst && wantsBankrec && !wantsBookkeeping && !wantsInvoice) return "analyst";
  if (wantsBankrec) return "bankrec";
  if (wantsInvoice) return "invoice";
  if (wantsBookkeeping) return "bookkeeping";
  if (wantsAnalyst) return "analyst";
  return "coordinator";
}

export interface AccountantSubagents {
  bookkeeping: BaseAgent;
  analyst: BaseAgent;
  invoice: BaseAgent;
  bankrec: BaseAgent;
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
      bankrec: subagents.bankrec,
      coordinator: subagents.coordinator,
    },
    router: () => "coordinator",
  });
}
