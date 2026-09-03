import { and, desc, eq, gte, sql } from "drizzle-orm";
import { chatThreads, chatMessages } from "../schema/rag";
import type { Queryable } from "./queryable";

export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

export async function createThread(
  q: Queryable,
  orgId: string,
  title: string,
  modelPreset: string = "fast",
): Promise<ChatThread> {
  const [row] = await q
    .insert(chatThreads)
    .values({ orgId, title, modelPreset })
    .returning();
  return row;
}

export async function listThreads(q: Queryable, orgId: string): Promise<ChatThread[]> {
  return q
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.orgId, orgId))
    .orderBy(desc(chatThreads.pinned), desc(chatThreads.updatedAt));
}

export async function getThread(q: Queryable, orgId: string, threadId: string): Promise<ChatThread | null> {
  const [row] = await q.select().from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.orgId, orgId))).limit(1);
  return row ?? null;
}

export async function updateThread(
  q: Queryable,
  orgId: string,
  threadId: string,
  patch: { title?: string; modelPreset?: string; pinned?: boolean },
): Promise<ChatThread | null> {
  const values: Partial<typeof chatThreads.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.modelPreset !== undefined) values.modelPreset = patch.modelPreset;
  if (patch.pinned !== undefined) values.pinned = patch.pinned;

  const [row] = await q
    .update(chatThreads)
    .set(values)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.orgId, orgId)))
    .returning();
  return row ?? null;
}

export async function deleteThread(
  q: Queryable,
  orgId: string,
  threadId: string,
): Promise<boolean> {
  const result = await q
    .delete(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.orgId, orgId)))
    .returning({ id: chatThreads.id });
  return result.length > 0;
}

export interface AddMessageOptions {
  citations?: unknown;
  reasoning?: string;
  attachments?: unknown;
  toolInvocations?: unknown;
}

export async function addMessage(
  q: Queryable,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  optsOrCitations: AddMessageOptions | unknown = null,
): Promise<ChatMessage> {
  let citations: unknown = null;
  let reasoning: string | undefined = undefined;
  let attachments: unknown = null;
  let toolInvocations: unknown = null;

  if (optsOrCitations && typeof optsOrCitations === "object") {
    if ("reasoning" in optsOrCitations || "attachments" in optsOrCitations || "toolInvocations" in optsOrCitations) {
      const opts = optsOrCitations as AddMessageOptions;
      citations = opts.citations ?? null;
      reasoning = opts.reasoning;
      attachments = opts.attachments ?? null;
      toolInvocations = opts.toolInvocations ?? null;
    } else {
      citations = optsOrCitations;
    }
  }

  const [row] = await q.insert(chatMessages).values({
    threadId,
    role,
    content,
    reasoning,
    attachments: attachments as never,
    toolInvocations: toolInvocations as never,
    citations: citations as never,
  }).returning();

  await q
    .update(chatThreads)
    .set({ updatedAt: new Date() })
    .where(eq(chatThreads.id, threadId));

  return row;
}

export async function listMessages(q: Queryable, threadId: string): Promise<ChatMessage[]> {
  return q.select().from(chatMessages)
    .where(eq(chatMessages.threadId, threadId))
    .orderBy(chatMessages.createdAt);
}

export async function checkAdvisorQuota(q: Queryable, orgId: string): Promise<{ allowed: boolean; message?: string }> {
  return checkAssistantQuota(q, orgId);
}

export async function checkAssistantQuota(q: Queryable, orgId: string): Promise<{ allowed: boolean; message?: string }> {
  const limit = Number(process.env.ASSISTANT_MONTHLY_LIMIT ?? process.env.ADVISOR_MONTHLY_MESSAGES_LIMIT ?? process.env.AI_MONTHLY_DRAFT_LIMIT ?? "200");
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  // Count user messages + drafts in current month (unified limiter)
  const msgRows = await q.execute(sql`
    SELECT count(*)::int AS n
    FROM chat_messages cm
    JOIN chat_threads ct ON ct.id = cm.thread_id
    WHERE ct.org_id = ${orgId} AND cm.role = 'user' AND cm.created_at >= ${start.toISOString()}
  `);
  const msgCount = (msgRows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0;
  const draftRows = await q.execute(sql`
    SELECT count(*)::int AS n FROM ai_drafts WHERE org_id = ${orgId} AND created_at >= ${start.toISOString()}
  `);
  const draftCount = (draftRows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0;
  const n = msgCount + draftCount;
  if (n < limit) return { allowed: true };
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
  const monthName = nextMonth.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  return {
    allowed: false,
    message: `Kuota asisten bulan ini habis (${limit} interaksi). Coba lagi 1 ${monthName}.`,
  };
}

export async function countAssistantUsage(q: Queryable, orgId: string): Promise<{ used: number; limit: number }> {
  const limit = Number(process.env.ASSISTANT_MONTHLY_LIMIT ?? "200");
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const msgRows = await q.execute(sql`
    SELECT count(*)::int AS n
    FROM chat_messages cm
    JOIN chat_threads ct ON ct.id = cm.thread_id
    WHERE ct.org_id = ${orgId} AND cm.role = 'user' AND cm.created_at >= ${start.toISOString()}
  `);
  const msgCount = (msgRows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0;
  const draftRows = await q.execute(sql`
    SELECT count(*)::int AS n FROM ai_drafts WHERE org_id = ${orgId} AND created_at >= ${start.toISOString()}
  `);
  const draftCount = (draftRows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n ?? 0;
  return { used: msgCount + draftCount, limit };
}
