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
    // For askNara/advisor: interactions.create mock
    interactions = {
      create: vi.fn(async ({ input }: { input: unknown }) => {
        const str = JSON.stringify(input);
        const qMatch = str.match(/Pertanyaan:\s*([^\n"]+)/) || str.match(/Pertanyaan user[^:]*:\s*([^\n"]+)/);
        const q = qMatch ? qMatch[1] : "saldo kas";
        return { output_text: `Jawaban mock untuk: ${q}. Saldo Kas & Bank: Rp 0, Laba Tahun Ini: Rp 0.`, steps: [] };
      }),
    };
  },
}));

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "test-key";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("advisor chat", () => {
  let orgId: string;
  let threadId: string;

  beforeAll(async () => {
    await truncateAll();
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM chat_messages`);
    await db.execute(sql`DELETE FROM chat_threads`);
    await db.execute(sql`DELETE FROM tenant_chunks`);
    await db.execute(sql`DELETE FROM ifrs_chunks`);
    orgId = (await makeOrg("PT Advisor")).orgId;
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgId);
    // Seed one tenant chunk for hybrid search
    const { embed } = await import("@/server/ai/embeddings");
    const emb = await embed("saldo kas test");
    await db.execute(sql`
      INSERT INTO tenant_chunks (org_id, source_kind, content, embedding, tsv)
      VALUES (${orgId}, 'JOURNAL', 'saldo kas test content', ${JSON.stringify(emb)}, to_tsvector('english', 'saldo kas test'))
    `);
    const { seedIfsChunks } = await import("@/server/ai/seed-ifrs");
    await seedIfsChunks();
    const { createThread } = await import("@/server/db/repos/chat.repo");
    const t = await db.transaction((tx) => createThread(tx, orgId, "Test"));
    threadId = t.id;
  });

  afterAll(async () => {
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM chat_messages`);
    await db.execute(sql`DELETE FROM chat_threads`);
    await truncateAll();
  });

  it("answers with citations and saves messages, quota enforced", async () => {
    const { askAdvisor } = await import("@/server/ai/advisor");
    const res = await askAdvisor(orgId, threadId, "berapa saldo kas?");
    expect(res.answer).toContain("saldo kas");
    expect(res.citations.length).toBeGreaterThanOrEqual(1);
    expect(res.citations[0]).toHaveProperty("excerpt");

    const { listMessages } = await import("@/server/db/repos/chat.repo");
    const { db } = await import("@/server/db");
    const msgs = await listMessages(db, threadId);
    expect(msgs.length).toBe(2); // user + assistant

    // Quota: set limit 1, next ask should fail (unified limiter)
    const prev = process.env.ASSISTANT_MONTHLY_LIMIT;
    process.env.ASSISTANT_MONTHLY_LIMIT = "1";
    await expect(askAdvisor(orgId, threadId, "pertanyaan kedua")).rejects.toThrow("Kuota");
    process.env.ASSISTANT_MONTHLY_LIMIT = prev;
  });
});
