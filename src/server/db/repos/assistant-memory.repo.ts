import { and, desc, eq } from "drizzle-orm";
import { assistantMemories } from "../schema/assistant-memory";
import type { Queryable } from "./queryable";

export type MemoryKind = "PROFILE" | "PREFERENCE" | "FACT" | "THREAD_SUMMARY";

export interface AssistantMemory {
  id: string;
  orgId: string;
  kind: MemoryKind;
  content: string;
  source: "user" | "auto";
  sourceThreadId: string | null;
  updatedAt: Date;
}

export interface SaveMemoryInput {
  kind: MemoryKind;
  content: string;
  source: "user" | "auto";
  sourceThreadId?: string | null;
}

function toMemory(row: typeof assistantMemories.$inferSelect): AssistantMemory {
  return {
    id: row.id,
    orgId: row.orgId,
    kind: row.kind as MemoryKind,
    content: row.content,
    source: (row.source ?? "user") as "user" | "auto",
    sourceThreadId: row.sourceThreadId,
    updatedAt: row.updatedAt,
  };
}

export async function saveMemory(
  q: Queryable,
  orgId: string,
  input: SaveMemoryInput,
): Promise<AssistantMemory> {
  const content = input.content.trim().slice(0, 500);
  if (!content) throw new Error("Isi ingatan 1-500 karakter.");
  if (input.content.trim().length > 500) throw new Error("Isi ingatan 1-500 karakter.");
  // Upsert ringkasan per thread: satu baris THREAD_SUMMARY per source_thread_id.
  if (input.kind === "THREAD_SUMMARY" && input.sourceThreadId) {
    const [existing] = await q
      .select()
      .from(assistantMemories)
      .where(
        and(
          eq(assistantMemories.orgId, orgId),
          eq(assistantMemories.kind, "THREAD_SUMMARY"),
          eq(assistantMemories.sourceThreadId, input.sourceThreadId),
        ),
      )
      .limit(1);
    if (existing) {
      const [row] = await q
        .update(assistantMemories)
        .set({ content, updatedAt: new Date() })
        .where(and(eq(assistantMemories.id, existing.id), eq(assistantMemories.orgId, orgId)))
        .returning();
      return toMemory(row);
    }
  }
  const [row] = await q
    .insert(assistantMemories)
    .values({
      orgId,
      kind: input.kind,
      content,
      source: input.source,
      sourceThreadId: input.sourceThreadId ?? null,
    })
    .returning();
  return toMemory(row);
}

export async function listMemories(
  q: Queryable,
  orgId: string,
  limit: number = 20,
): Promise<AssistantMemory[]> {
  const rows = await q
    .select()
    .from(assistantMemories)
    .where(eq(assistantMemories.orgId, orgId))
    .orderBy(desc(assistantMemories.updatedAt))
    .limit(limit);
  return rows.map(toMemory);
}

export async function deleteMemory(q: Queryable, orgId: string, id: string): Promise<boolean> {
  const result = await q
    .delete(assistantMemories)
    .where(and(eq(assistantMemories.id, id), eq(assistantMemories.orgId, orgId)))
    .returning({ id: assistantMemories.id });
  return result.length > 0;
}
