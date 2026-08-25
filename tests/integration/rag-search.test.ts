import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { makeOrg, truncateAll } from "./helpers";

function hashToVector(text: string, dim = 768): number[] {
  const vec: number[] = new Array(dim);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let seed = h >>> 0;
  for (let i = 0; i < dim; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; vec[i] = (seed / 0xffffffff) * 2 - 1; }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      embedContent: vi.fn(async ({ contents }: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
        const text = contents[0]?.parts[0]?.text ?? "default";
        return { embeddings: [{ values: hashToVector(text) }] };
      }),
    };
  },
}));
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "test-key";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("rag hybrid search", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM tenant_chunks`);
    await db.execute(sql`DELETE FROM ifrs_chunks`);
    orgId = (await makeOrg("PT Search")).orgId;

    // Seed one tenant chunk about cash balance
    const { embed } = await import("@/server/ai/embeddings");
    const tenantContent = "saldo kas November 5jt di bank BCA";
    const tenantEmb = await embed(tenantContent);
    await db.execute(sql`
      INSERT INTO tenant_chunks (org_id, source_kind, content, embedding, tsv)
      VALUES (${orgId}, 'JOURNAL', ${tenantContent}, ${JSON.stringify(tenantEmb)}, to_tsvector('english', ${tenantContent}))
    `);

    // Seed one global IFRS chunk about leases
    const globalContent = "IFRS 10 leases sewa pembiayaan harus diakui sebagai aset";
    const globalEmb = await embed(globalContent);
    await db.execute(sql`
      INSERT INTO ifrs_chunks (section, chunk_index, content, embedding, tsv)
      VALUES ('IFRS 10', '0', ${globalContent}, ${JSON.stringify(globalEmb)}, to_tsvector('english', ${globalContent}))
    `);
  });

  afterAll(async () => {
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM tenant_chunks`);
    await db.execute(sql`DELETE FROM ifrs_chunks`);
    await truncateAll();
  });

  it("returns tenant chunk first for company-specific query", async () => {
    const { embed } = await import("@/server/ai/embeddings");
    const { hybridSearch } = await import("@/server/db/repos/rag-search");
    const qEmb = await embed("saldo kas");
    const hits = await hybridSearch(orgId, qEmb, "saldo kas", 6);
    expect(hits.length).toBeGreaterThan(0);
    // Tenant chunk about saldo kas should rank higher than IFRS leases
    expect(hits[0].content).toContain("saldo kas");
  });
});
