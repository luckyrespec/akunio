import { desc } from "drizzle-orm";
import { sakSources, type SakSource } from "../schema/sak";
import type { Queryable } from "./queryable";

export async function registerSakSource(
  q: Queryable,
  input: { docId: string; version: string; effectiveDate: string },
): Promise<SakSource> {
  const [row] = await q.insert(sakSources).values(input).returning();
  return row;
}

export async function getActiveSakSource(q: Queryable): Promise<SakSource | null> {
  const [row] = await q.select().from(sakSources).orderBy(desc(sakSources.effectiveDate)).limit(1);
  return row ?? null;
}

export function isSakSection(section: string): boolean {
  return section.startsWith("SAK-EMKM");
}
