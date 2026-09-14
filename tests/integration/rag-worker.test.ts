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

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("rag worker job-scoped", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgA = "";
  let orgB = "";

  beforeAll(async () => {
    await truncateAll();
    orgA = (await makeOrg("PT RAG Worker A")).orgId;
    orgB = (await makeOrg("PT RAG Worker B")).orgId;
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgA);
    await seedOrgData(orgB);
  });
  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  async function leafIds(orgId: string): Promise<[string, string]> {
    const r = await admin.query<{ id: string; code: string; parent_code: string | null }>(
      `SELECT id, code, parent_code FROM accounts WHERE org_id=$1`,
      [orgId],
    );
    const leaves = r.rows.filter((a) => !r.rows.some((c) => c.parent_code === a.code));
    return [leaves[0].id, leaves[1].id];
  }

  it("enqueue tanpa org ditolak ORG_WAJIB (bukan error DB mentah)", async () => {
    const { enqueueRagJob, enqueueRagJobDirect } = await import("@/server/ai/rag-worker");
    const { db } = await import("@/server/db");
    await expect(enqueueRagJob(db as never, "", "JOURNAL", "x")).rejects.toThrow("ORG_WAJIB");
    await expect(enqueueRagJobDirect("", "JOURNAL", "x")).rejects.toThrow("ORG_WAJIB");
  });

  it("job org A tak mengindeks data org B (regresi isolasi)", async () => {
    const { db } = await import("@/server/db");
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { enqueueRagJob } = await import("@/server/ai/rag-worker");
    const { processQueueBatch } = await import("@/server/ai/rag-worker");
    const year = new Date().getFullYear();
    const [a1, a2] = await leafIds(orgA);
    const [b1, b2] = await leafIds(orgB);
    const mk = (tx: never, org: string, l1: string, l2: string, memo: string, n: bigint) =>
      postJournalEntry(tx, org, "t@t.id", {
        dateISO: `${year}-03-10`,
        memo,
        lines: [
          { accountId: l1, debitMinor: n, creditMinor: 0n },
          { accountId: l2, debitMinor: 0n, creditMinor: n },
        ],
      });
    const ja = await db.transaction((tx) => mk(tx as never, orgA, a1, a2, "UNIK-ALFA-A", 111_000n));
    const jb = await db.transaction((tx) => mk(tx as never, orgB, b1, b2, "UNIK-BETA-B", 222_000n));
    await enqueueRagJob(db as never, orgA, "JOURNAL", ja.id);
    await enqueueRagJob(db as never, orgB, "JOURNAL", jb.id);
    const processed = await processQueueBatch(10);
    // postJournalEntry ikut enqueue 1 job per jurnal + 2 manual di atas
    expect(processed).toBeGreaterThanOrEqual(2);
    const ca = await admin.query<{ content: string }>(
      `SELECT content FROM tenant_chunks WHERE org_id=$1`,
      [orgA],
    );
    const cb = await admin.query<{ content: string }>(
      `SELECT content FROM tenant_chunks WHERE org_id=$1`,
      [orgB],
    );
    expect(ca.rows.some((r) => r.content.includes("UNIK-ALFA-A"))).toBe(true);
    expect(ca.rows.some((r) => r.content.includes("UNIK-BETA-B"))).toBe(false);
    expect(cb.rows.some((r) => r.content.includes("UNIK-BETA-B"))).toBe(true);
    expect(cb.rows.some((r) => r.content.includes("UNIK-ALFA-A"))).toBe(false);
  });
});
