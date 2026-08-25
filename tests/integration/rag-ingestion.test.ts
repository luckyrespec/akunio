import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Pool } from "pg";
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

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("rag ingestion", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgId: string;
  let otherOrgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT RAG")).orgId;
    otherOrgId = (await makeOrg("PT RAG Other")).orgId;
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgId);
    await seedOrgData(otherOrgId);
  });

  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  it("enqueues a journal and worker creates tenant chunk isolated per org", async () => {
    const { db } = await import("@/server/db");
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { processQueueBatch } = await import("@/server/ai/rag-worker");
    const { sql } = await import("drizzle-orm");

    // Find two leaf accounts for this org
    const allAcc = await admin.query(`SELECT id, code, parent_code FROM accounts WHERE org_id=$1`, [orgId]);
    const leaves = (allAcc.rows as Array<{ id: string; code: string; parent_code: string | null }>)
      .filter((a) => !allAcc.rows.some((c: { parent_code: string | null }) => c.parent_code === a.code));
    const a1 = leaves[0].id;
    const a2 = leaves[1].id;

    const year = new Date().getFullYear();
    await db.transaction((tx) =>
      postJournalEntry(tx, orgId, "test@test.id", {
        dateISO: `${year}-01-15`,
        memo: "Beli perlengkapan",
        lines: [
          { accountId: a1, debitMinor: 500000n, creditMinor: 0n },
          { accountId: a2, debitMinor: 0n, creditMinor: 500000n },
        ],
      }),
    );

    const before = await admin.query(`SELECT count(*)::int AS n FROM tenant_chunks WHERE org_id=$1`, [orgId]);
    expect(before.rows[0].n).toBe(0);

    const processed = await processQueueBatch(20);
    expect(processed).toBeGreaterThanOrEqual(1);

    const after = await admin.query(`SELECT count(*)::int AS n FROM tenant_chunks WHERE org_id=$1`, [orgId]);
    expect(after.rows[0].n).toBeGreaterThanOrEqual(1);

    const other = await admin.query(`SELECT count(*)::int AS n FROM tenant_chunks WHERE org_id=$1`, [otherOrgId]);
    expect(other.rows[0].n).toBe(0);

    const chunk = await admin.query(`SELECT content, source_kind FROM tenant_chunks WHERE org_id=$1 LIMIT 1`, [orgId]);
    expect(chunk.rows[0].content).toContain("Jurnal");
    expect(chunk.rows[0].source_kind).toBe("JOURNAL");
  });
});
