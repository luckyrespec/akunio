import { and, desc, eq, gte } from "drizzle-orm";
import { aiDrafts } from "../schema/ai";
import type { Queryable } from "./queryable";

export type AiDraft = typeof aiDrafts.$inferSelect;
export type DraftStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export interface CreateDraftInput {
  orgId: string;
  kind: "TEXT" | "DOCUMENT";
  documentId?: string;
  inputText: string;
  draft: unknown;
  model: string;
}

export async function createDraft(q: Queryable, input: CreateDraftInput): Promise<AiDraft> {
  const [row] = await q.insert(aiDrafts).values({
    orgId: input.orgId,
    kind: input.kind,
    documentId: input.documentId ?? null,
    inputText: input.inputText,
    draft: input.draft as never,
    model: input.model,
  }).returning();
  return row;
}

export async function getDraft(q: Queryable, orgId: string, id: string): Promise<AiDraft | null> {
  const [row] = await q.select().from(aiDrafts)
    .where(and(eq(aiDrafts.orgId, orgId), eq(aiDrafts.id, id))).limit(1);
  return row ?? null;
}

export async function listDrafts(q: Queryable, orgId: string): Promise<AiDraft[]> {
  return q.select().from(aiDrafts)
    .where(eq(aiDrafts.orgId, orgId))
    .orderBy(desc(aiDrafts.createdAt)).limit(100);
}

export async function setDraftStatus(
  q: Queryable, orgId: string, id: string, status: DraftStatus,
): Promise<AiDraft> {
  const [row] = await q.update(aiDrafts)
    .set({ status })
    .where(and(eq(aiDrafts.orgId, orgId), eq(aiDrafts.id, id)))
    .returning();
  if (!row) throw new Error("DRAFT_TIDAK_DITEMUKAN");
  return row;
}

export async function linkPostedEntry(
  q: Queryable, orgId: string, draftId: string, entryId: string,
): Promise<void> {
  const [row] = await q.update(aiDrafts)
    .set({ status: "ACCEPTED", postedEntryId: entryId })
    .where(and(eq(aiDrafts.orgId, orgId), eq(aiDrafts.id, draftId)))
    .returning({ id: aiDrafts.id });
  if (!row) throw new Error("DRAFT_TIDAK_DITEMUKAN");
}

export async function countDraftsThisMonth(
  q: Queryable, orgId: string, now: Date,
): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await q.select({ id: aiDrafts.id })
    .from(aiDrafts)
    .where(and(eq(aiDrafts.orgId, orgId), gte(aiDrafts.createdAt, start)));
  return rows.length;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function effectiveStatus(d: AiDraft, now: Date): DraftStatus {
  if (d.status === "PENDING" && now.getTime() - d.createdAt.getTime() > SEVEN_DAYS_MS) {
    return "REJECTED";
  }
  return d.status;
}

export function checkQuota(count: number, limit: number): { allowed: boolean; message?: string } {
  if (count < limit) return { allowed: true };
  return {
    allowed: false,
    message: `Kuota draft AI bulan ini habis (${limit}). Coba lagi bulan depan.`,
  };
}
