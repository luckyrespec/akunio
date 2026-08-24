import { and, eq } from "drizzle-orm";
import { documents } from "../schema/ai";
import type { Queryable } from "./queryable";

export type Document = typeof documents.$inferSelect;

export async function createDocumentRow(
  q: Queryable,
  input: { orgId: string; storageKey: string; mime: string; sizeBytes: number },
): Promise<Document> {
  const [row] = await q.insert(documents).values({
    orgId: input.orgId,
    storageKey: input.storageKey,
    mime: input.mime,
    sizeBytes: input.sizeBytes,
  }).returning();
  return row;
}

export async function setDocumentStatus(
  q: Queryable, orgId: string, id: string,
  status: "UPLOADED" | "EXTRACTED" | "FAILED", extracted?: unknown,
): Promise<Document> {
  const [row] = await q.update(documents)
    .set({ status, ...(extracted !== undefined ? { extracted: extracted as never } : {}) })
    .where(and(eq(documents.orgId, orgId), eq(documents.id, id)))
    .returning();
  if (!row) throw new Error("DOKUMEN_TIDAK_DITEMUKAN");
  return row;
}

export async function getDocumentRow(
  q: Queryable, orgId: string, id: string,
): Promise<Document | null> {
  const [row] = await q.select().from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.id, id))).limit(1);
  return row ?? null;
}
