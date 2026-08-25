import { and, desc, eq, gte, sql } from "drizzle-orm";
import { chatThreads, chatMessages } from "../schema/rag";
import type { Queryable } from "./queryable";

export type ChatThread = typeof chatThreads.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;

export async function createThread(q: Queryable, orgId: string, title: string): Promise<ChatThread> {
  const [row] = await q.insert(chatThreads).values({ orgId, title }).returning();
  return row;
}

export async function listThreads(q: Queryable, orgId: string): Promise<ChatThread[]> {
  return q.select().from(chatThreads).where(eq(chatThreads.orgId, orgId)).orderBy(desc(chatThreads.createdAt));
}

export async function getThread(q: Queryable, orgId: string, threadId: string): Promise<ChatThread | null> {
  const [row] = await q.select().from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.orgId, orgId))).limit(1);
  return row ?? null;
}

export async function addMessage(
  q: Queryable,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  citations: unknown = null,
): Promise<ChatMessage> {
  const [row] = await q.insert(chatMessages).values({
    threadId, role, content, citations: citations as never,
  }).returning();
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
