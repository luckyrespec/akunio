import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("chat repo", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM chat_messages`);
    await db.execute(sql`DELETE FROM chat_threads`);
    orgId = (await makeOrg("PT Chat")).orgId;
  });

  afterAll(async () => {
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM chat_messages`);
    await db.execute(sql`DELETE FROM chat_threads`);
    await truncateAll();
  });

  it("creates thread, adds messages, lists, and enforces quota", async () => {
    const { db } = await import("@/server/db");
    const { createThread, listThreads, addMessage, listMessages, checkAdvisorQuota } =
      await import("@/server/db/repos/chat.repo");

    const t = await db.transaction((tx) => createThread(tx, orgId, "Test Thread"));
    expect(t.title).toBe("Test Thread");

    const threads = await listThreads(db, orgId);
    expect(threads.length).toBe(1);

    await db.transaction((tx) => addMessage(tx, t.id, "user", "halo", null));
    await db.transaction((tx) => addMessage(tx, t.id, "assistant", "hai", [{ kind: "ifrs" }]));

    const msgs = await listMessages(db, t.id);
    expect(msgs.length).toBe(2);
    expect(msgs[1].citations).toEqual([{ kind: "ifrs" }]);

    // quota: default 200, should allow
    const quota = await checkAdvisorQuota(db, orgId);
    expect(quota.allowed).toBe(true);

    // force limit 1 by env
    const prev = process.env.ADVISOR_MONTHLY_MESSAGES_LIMIT;
    process.env.ADVISOR_MONTHLY_MESSAGES_LIMIT = "1";
    const blocked = await checkAdvisorQuota(db, orgId);
    expect(blocked.allowed).toBe(false);
    expect(blocked.message).toContain("Kuota tanya advisor");
    process.env.ADVISOR_MONTHLY_MESSAGES_LIMIT = prev;
  });
});
