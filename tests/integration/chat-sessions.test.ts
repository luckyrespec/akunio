import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("chat sessions & metadata", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM chat_messages`);
    await db.execute(sql`DELETE FROM chat_threads`);
    orgId = (await makeOrg("PT Session Test")).orgId;
  });

  afterAll(async () => {
    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`DELETE FROM chat_messages`);
    await db.execute(sql`DELETE FROM chat_threads`);
    await truncateAll();
  });

  it("creates, updates title, and lists threads ordered by updatedAt", async () => {
    const { db } = await import("@/server/db");
    const { createThread, listThreads, updateThread } = await import("@/server/db/repos/chat.repo");

    const t1 = await db.transaction((tx) => createThread(tx, orgId, "Sesi Pertama", "fast"));
    expect(t1.id).toBeDefined();
    expect(t1.title).toBe("Sesi Pertama");
    expect(t1.modelPreset).toBe("fast");

    const updated = await db.transaction((tx) =>
      updateThread(tx, orgId, t1.id, { title: "Sesi Pertama (Revisi)" }),
    );
    expect(updated?.title).toBe("Sesi Pertama (Revisi)");

    const threads = await listThreads(db, orgId);
    expect(threads.some((t) => t.id === t1.id && t.title === "Sesi Pertama (Revisi)")).toBe(true);
  });

  it("stores message with reasoning, attachments, and tool invocations", async () => {
    const { db } = await import("@/server/db");
    const { createThread, addMessage, listMessages } = await import("@/server/db/repos/chat.repo");

    const t = await db.transaction((tx) => createThread(tx, orgId, "Sesi Reasoning"));
    const msg = await db.transaction((tx) =>
      addMessage(tx, t.id, "assistant", "Hasil perhitungan laba", {
        reasoning: "Memeriksa baris pendapatan dan beban...",
        attachments: [{ id: "att-1", fileName: "nota.pdf" }],
        toolInvocations: [{ toolName: "get_report", status: "auto" }],
        citations: [{ kind: "IFRS", ref: "§3" }],
      }),
    );

    expect(msg.content).toBe("Hasil perhitungan laba");
    expect(msg.reasoning).toBe("Memeriksa baris pendapatan dan beban...");
    expect(Array.isArray(msg.attachments)).toBe(true);
    expect(Array.isArray(msg.toolInvocations)).toBe(true);

    const msgs = await listMessages(db, t.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0].reasoning).toBe("Memeriksa baris pendapatan dan beban...");
  });

  it("deletes thread and cascades delete to messages", async () => {
    const { db } = await import("@/server/db");
    const { createThread, addMessage, deleteThread, getThread, listMessages } = await import(
      "@/server/db/repos/chat.repo"
    );

    const t = await db.transaction((tx) => createThread(tx, orgId, "Sesi Hapus"));
    await db.transaction((tx) => addMessage(tx, t.id, "user", "Halo"));
    await db.transaction((tx) => addMessage(tx, t.id, "assistant", "Halo juga"));

    const deleted = await db.transaction((tx) => deleteThread(tx, orgId, t.id));
    expect(deleted).toBe(true);

    const checkThread = await getThread(db, orgId, t.id);
    expect(checkThread).toBeNull();

    const remainingMsgs = await listMessages(db, t.id);
    expect(remainingMsgs.length).toBe(0);
  });
});
