import { RoutedAgent, type BaseAgent } from "@google/adk";

export type AccountantRoute = "bookkeeping" | "analyst" | "coordinator";

const BOOKKEEPING_RE =
  /(catat|posting|draft|faktur|invoice|bayar|kas|jurnal|tagih|stok|opname|aset)/;
const ANALYST_RE =
  /(laba|rugi|laporan|neraca|analis|kenapa|turun|naik|kinerja|arus kas|ekuitas|sehat|aging|piutang|utang)/;

/**
 * Pre-route deterministik: aksi pencatatan menang atas pertanyaan analisis
 * bila keduanya cocok; selain itu fallback ke coordinator (LLM delegasi).
 */
export function routeIntent(text: string): AccountantRoute {
  const t = text.toLowerCase();
  const wantsBookkeeping = BOOKKEEPING_RE.test(t);
  const wantsAnalyst = ANALYST_RE.test(t);
  if (wantsBookkeeping) return "bookkeeping";
  if (wantsAnalyst) return "analyst";
  return "coordinator";
}

export interface AccountantSubagents {
  bookkeeping: BaseAgent;
  analyst: BaseAgent;
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
      coordinator: subagents.coordinator,
    },
    router: () => "coordinator",
  });
}
