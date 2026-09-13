import { withOrg } from "@/server/db/repos/with-org";
import { updateThread } from "@/server/db/repos/chat.repo";

/**
 * Gemini Interactions memory per chat thread.
 *
 * - Setiap thread menyimpan `gemini_interaction_id` terakhir (kolom
 *   `chat_threads.gemini_interaction_id`).
 * - Setiap turn baru memakai `store: true` + `previous_interaction_id`
 *   dari thread yang sama, sehingga Gemini mengingat konteks server-side
 *   (mis. "aset laptop 10jt" lalu "ok catatkan ya").
 * - Local DB (chat_messages) tetap menjadi source of truth untuk riwayat
 *   yang dirender di UI; memory server-side adalah pelengkap anti-lupa.
 *
 * Retensi Google: tier berbayar 55 hari, tier gratis 1 hari.
 */
export const STORE_INTERACTIONS = true;

export function interactionBaseParams(previousInteractionId?: string | null): {
  store: boolean;
  previous_interaction_id?: string;
} {
  if (previousInteractionId) {
    return { store: STORE_INTERACTIONS, previous_interaction_id: previousInteractionId };
  }
  return { store: STORE_INTERACTIONS };
}

export async function saveThreadInteractionId(
  orgId: string,
  threadId: string,
  interactionId: string | undefined | null,
): Promise<void> {
  if (!interactionId) return;
  try {
    await withOrg(orgId, (tx) => updateThread(tx, orgId, threadId, { geminiInteractionId: interactionId }));
  } catch (e) {
    console.warn("gagal menyimpan gemini_interaction_id", e);
  }
}

export async function clearThreadInteractionId(orgId: string, threadId: string): Promise<void> {
  try {
    await withOrg(orgId, (tx) => updateThread(tx, orgId, threadId, { geminiInteractionId: null }));
  } catch {
    // best-effort
  }
}

/** True jika error Gemini menandakan previous_interaction_id tidak valid/kedaluwarsa. */
export function isStaleInteractionError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e).toLowerCase();
  return (
    msg.includes("previous_interaction") ||
    msg.includes("previous interaction") ||
    msg.includes("interaction not found") ||
    msg.includes("not_found") ||
    msg.includes("expired")
  );
}
