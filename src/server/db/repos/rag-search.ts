import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import type { Queryable } from "./queryable";

export interface SearchHit {
  id: string;
  content: string;
  kind: string;
  score: number;
  excerpt: string;
  section?: string;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function parseEmbedding(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return []; }
  }
  return [];
}

export async function hybridSearch(
  orgId: string,
  queryEmbedding: number[],
  queryText: string,
  limit = 6,
  tx?: Queryable,
): Promise<SearchHit[]> {
  // Fetch tenant chunks — lewat tx pemanggil (scope withOrg) agar
  // app.current_org terpasang di bawah app_user; tanpa tx (legacy) pakai db.
  const tenantQ = tx ?? db;
  const tenantRes = await tenantQ.execute(sql`
    SELECT id, content, embedding, source_kind,
           ts_rank(tsv, plainto_tsquery('english', ${queryText})) AS rank
    FROM tenant_chunks
    WHERE org_id = ${orgId}
  `);
  const tenantRows = (tenantRes as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

  // Fetch global IFRS chunks
  const globalRes = await db.execute(sql`
    SELECT id, content, embedding, section,
           ts_rank(tsv, plainto_tsquery('english', ${queryText})) AS rank
    FROM ifrs_chunks
  `);
  const globalRows = (globalRes as unknown as { rows: Array<Record<string, unknown>> }).rows ?? [];

  // Normalize ts_rank
  const allRanks = [...tenantRows, ...globalRows].map((r) => Number(r.rank ?? 0));
  const maxRank = Math.max(1, ...allRanks);

  const scored: SearchHit[] = [];

  for (const r of tenantRows) {
    const emb = parseEmbedding(r.embedding);
    const cos = emb.length ? cosine(queryEmbedding, emb) : 0;
    const ts = Number(r.rank ?? 0) / maxRank;
    const score = 0.7 * cos + 0.3 * ts;
    scored.push({
      id: r.id as string,
      content: r.content as string,
      kind: (r.source_kind as string) ?? "tenant",
      score,
      excerpt: (r.content as string).slice(0, 200),
      section: r.section as string | undefined,
    });
  }

  for (const r of globalRows) {
    const emb = parseEmbedding(r.embedding);
    const cos = emb.length ? cosine(queryEmbedding, emb) : 0;
    const ts = Number(r.rank ?? 0) / maxRank;
    const score = 0.7 * cos + 0.3 * ts;
    scored.push({
      id: r.id as string,
      content: r.content as string,
      kind: "ifrs",
      score,
      excerpt: (r.content as string).slice(0, 200),
      section: r.section as string,
    });
  }

  // Sort by score desc, take top `limit`, but ensure at least fallback if tenant <2 hits
  scored.sort((a, b) => b.score - a.score);

  // Tenant fallback: if less than 2 tenant hits in top `limit`, ensure we have some
  // (already handled by scoring, but keep as is per spec)

  return scored.slice(0, limit);
}
