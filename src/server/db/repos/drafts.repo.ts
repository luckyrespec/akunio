import { and, desc, eq, gte, or, ilike, sql, type SQL } from "drizzle-orm";
import { aiDrafts } from "../schema/ai";
import { journalEntries } from "../schema/journal";
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

function draftSearchWhere(orgId: string, status?: DraftStatus | "ALL", term?: string): SQL {
  const conditions: SQL[] = [eq(aiDrafts.orgId, orgId)];

  if (status && status !== "ALL") {
    conditions.push(eq(aiDrafts.status, status));
  }

  if (term && term.trim()) {
    const like = `%${term.trim()}%`;
    conditions.push(
      or(
        ilike(aiDrafts.inputText, like),
        ilike(journalEntries.number, like),
        sql`${aiDrafts.draft}->>'memo' ILIKE ${like}`,
        sql`${aiDrafts.draft}->>'explanation' ILIKE ${like}`,
      ) as SQL,
    );
  }

  return and(...conditions) as SQL;
}

export interface ListDraftsOptions {
  status?: DraftStatus | "ALL";
  query?: string;
  limit?: number;
  offset?: number;
}

export async function listPaginatedDrafts(q: Queryable, orgId: string, options: ListDraftsOptions = {}) {
  const { status, query, limit = 25, offset = 0 } = options;
  const whereClause = draftSearchWhere(orgId, status, query);

  const rows = await q
    .select({
      draft: aiDrafts,
      entryNumber: journalEntries.number,
    })
    .from(aiDrafts)
    .leftJoin(journalEntries, eq(journalEntries.id, aiDrafts.postedEntryId))
    .where(whereClause)
    .orderBy(desc(aiDrafts.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({ ...r.draft, entryNumber: r.entryNumber }));
}

export async function countFilteredDrafts(
  q: Queryable,
  orgId: string,
  options: { status?: DraftStatus | "ALL"; query?: string } = {},
): Promise<number> {
  const { status, query } = options;
  const whereClause = draftSearchWhere(orgId, status, query);

  const [row] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(aiDrafts)
    .leftJoin(journalEntries, eq(journalEntries.id, aiDrafts.postedEntryId))
    .where(whereClause);

  return row?.n ?? 0;
}

export async function countDraftsByStatus(
  q: Queryable,
  orgId: string,
): Promise<{ pending: number; accepted: number; rejected: number; total: number }> {
  const [row] = await q
    .select({
      pending: sql<number>`count(*) filter (where ${aiDrafts.status} = 'PENDING')::int`,
      accepted: sql<number>`count(*) filter (where ${aiDrafts.status} = 'ACCEPTED')::int`,
      rejected: sql<number>`count(*) filter (where ${aiDrafts.status} = 'REJECTED')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(aiDrafts)
    .where(eq(aiDrafts.orgId, orgId));

  return {
    pending: row?.pending ?? 0,
    accepted: row?.accepted ?? 0,
    rejected: row?.rejected ?? 0,
    total: row?.total ?? 0,
  };
}

export async function getDraftsWithNumbers(q: Queryable, orgId: string) {
  const rows = await q.select({
    draft: aiDrafts,
    entryNumber: journalEntries.number,
  })
    .from(aiDrafts)
    .leftJoin(journalEntries, eq(journalEntries.id, aiDrafts.postedEntryId))
    .where(eq(aiDrafts.orgId, orgId))
    .orderBy(desc(aiDrafts.createdAt))
    .limit(100);
  return rows.map((r) => ({ ...r.draft, entryNumber: r.entryNumber }));
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
