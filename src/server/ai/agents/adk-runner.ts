import { InMemoryRunner, LlmAgent, Runner } from "@google/adk";
import { buildFunctionTool, type AdkToolGate } from "./adk-tools";
import { accountantCoordinator, analystAgent, bookkeepingAgent } from "./definitions";
import { routeIntent, type AccountantRoute } from "./router";
import { ANALYST_TOOL_NAMES, BOOKKEEPING_TOOL_NAMES, COORDINATOR_INSTRUCTION } from "./split";

/**
 * Helper fase-1 migrasi chat Nara ke ADK Runner (dipakai stream + confirm route).
 *
 * Keputusan chaining: thread stream memakai sesi ADK (sessionId = threadId),
 * keluar dari skema chaining `gemini_interaction_id` Interactions API —
 * tidak ada previous_interaction_id yang diteruskan/di-self-heal di sini.
 * Jalur non-stream (`nara.ts`, `advisor.ts`) tetap self-heal via stale-retry
 * (clear + ulangi sekali tanpa chaining).
 *
 * - Tools dibangun per-request dan org-scoped via buildFunctionTool untuk
 *   union BOOKKEEPING + ANALYST (handler existing sudah withOrg di dalamnya).
 * - Sub-agent awal dipilih via routeIntent; instruksinya digabung dengan
 *   konteks penuh route (persona + COA + RAG + riwayat) agar perilaku stabil.
 * - Session ADK: sessionId = threadId chat. Session service di-cache per
 *   (orgId, threadId) di memori proses agar FunctionResponse resume di
 *   confirm route menemukan sesi yang ter-pause. Restart server = sesi
 *   hilang → confirm otomatis fallback eksekusi langsung (kompat kartu lama).
 */

/** Union nama tool yang dipasang ke agen per-request (dedupe). */
export function adkToolNames(): string[] {
  return [...new Set([...BOOKKEEPING_TOOL_NAMES, ...ANALYST_TOOL_NAMES])];
}

export interface RoutedAdkAgentInput {
  orgId: string;
  actorEmail: string;
  route: AccountantRoute;
  /** Konteks penuh dari route (persona + angka + COA + RAG + riwayat). */
  instruction: string;
  model: string;
  gate: AdkToolGate;
}

/** Bangun LlmAgent per-request: instruksi routed + FunctionTools org-scoped. */
export function buildRoutedAdkAgent(input: RoutedAdkAgentInput): LlmAgent {
  const tools = adkToolNames().map((name) =>
    buildFunctionTool(input.orgId, input.actorEmail, name, () => input.gate),
  );
  const base =
    input.route === "bookkeeping"
      ? bookkeepingAgent
      : input.route === "analyst"
        ? analystAgent
        : accountantCoordinator;
  const baseInstruction =
    typeof base.instruction === "string" ? base.instruction : COORDINATOR_INSTRUCTION;
  return new LlmAgent({
    name: `nara_${input.route}`,
    model: input.model,
    instruction: `${baseInstruction}\n\n${input.instruction}`,
    tools,
  });
}

/** Pilih sub-agent awal dari teks pesan (pre-route deterministik). */
export function routeAdkIntent(text: string): AccountantRoute {
  return routeIntent(text);
}

// Cache session service per (orgId, threadId) agar resume lintas request
// (stream → confirm) memakai sesi ADK yang sama dalam satu proses server.
const sessionServices = new Map<string, Runner["sessionService"]>();

export function adkSessionKey(orgId: string, threadId: string): string {
  return `${orgId}:${threadId}`;
}

/** Runner untuk satu turn: reuse session service bila ada, else InMemory baru. */
export async function getAdkRunner(input: {
  orgId: string;
  userId: string;
  threadId: string;
  agent: LlmAgent;
}): Promise<Runner> {
  const key = adkSessionKey(input.orgId, input.threadId);
  const cached = sessionServices.get(key);
  const runner: Runner = cached
    ? new Runner({ appName: input.orgId, agent: input.agent, sessionService: cached })
    : new InMemoryRunner({ agent: input.agent, appName: input.orgId });
  sessionServices.set(key, runner.sessionService);
  await runner.sessionService.getOrCreateSession({
    appName: input.orgId,
    userId: input.userId,
    sessionId: input.threadId,
  });
  return runner;
}

/** Ada sesi ADK tersimpan untuk thread ini (syarat resume FunctionResponse). */
export function hasAdkRunner(orgId: string, threadId: string): boolean {
  return sessionServices.has(adkSessionKey(orgId, threadId));
}

/** Buang sesi ADK thread (dipakai saat retry stale tanpa chaining). */
export function clearAdkRunner(orgId: string, threadId: string): void {
  sessionServices.delete(adkSessionKey(orgId, threadId));
}
