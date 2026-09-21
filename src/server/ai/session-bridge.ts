import { addMessage, getThread } from "@/server/db/repos/chat.repo";
import { withOrg } from "@/server/db/repos/with-org";

export interface AdkTurn {
  role: "user" | "assistant";
  content: string;
  toolInvocations?: unknown;
  citations?: unknown;
  reasoning?: string;
}

// ADK session memakai InMemory key `${orgId}:${threadId}` — tanpa
// DatabaseSessionService karena service persisten ADK tidak mendukung
// alur tool confirmation (requestConfirmation/resume FunctionResponse)
// yang dipakai control layer; chat_threads tetap source of truth.
export async function getOrCreateAdkSession(
  orgId: string,
  threadId: string,
): Promise<{ sessionKey: string }> {
  const thread = await withOrg(orgId, (tx) => getThread(tx, orgId, threadId));
  if (!thread) throw new Error("Percakapan tidak ditemukan.");
  return { sessionKey: `${orgId}:${threadId}` };
}

export async function syncTurnToThread(
  orgId: string,
  threadId: string,
  turn: AdkTurn,
): Promise<void> {
  await withOrg(orgId, (tx) => {
    if (
      turn.toolInvocations !== undefined ||
      turn.citations !== undefined ||
      turn.reasoning !== undefined
    ) {
      return addMessage(tx, threadId, turn.role, turn.content, {
        toolInvocations: turn.toolInvocations,
        citations: turn.citations,
        reasoning: turn.reasoning,
      });
    }
    return addMessage(tx, threadId, turn.role, turn.content);
  });
}
