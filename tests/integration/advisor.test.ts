import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";

process.env.AI_MOCK = "1";

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
    expect(res.citations.length).toBe(2);
    expect(res.citations[0]).toHaveProperty("excerpt");

    const { listMessages } = await import("@/server/db/repos/chat.repo");
    const { db } = await import("@/server/db");
    const msgs = await listMessages(db, threadId);
    expect(msgs.length).toBe(2); // user + assistant

    // Quota: set limit 1, next ask should fail
    const prev = process.env.ADVISOR_MONTHLY_MESSAGES_LIMIT;
    process.env.ADVISOR_MONTHLY_MESSAGES_LIMIT = "1";
    await expect(askAdvisor(orgId, threadId, "pertanyaan kedua")).rejects.toThrow("Kuota");
    process.env.ADVISOR_MONTHLY_MESSAGES_LIMIT = prev;
  });
});
