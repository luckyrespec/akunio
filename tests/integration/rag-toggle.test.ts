import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("rag tenant indexing kill-switch", () => {
  let orgId: string;
  let kas = "", beban = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const saved = process.env.RAG_TENANT_INDEXING;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT RAG Toggle")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; beban = byCode["5500"];
  });
  afterAll(async () => {
    if (saved === undefined) delete process.env.RAG_TENANT_INDEXING;
    else process.env.RAG_TENANT_INDEXING = saved;
    await admin.end();
    await truncateAll();
  });

  async function post() {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const year = new Date().getFullYear();
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-02-01`, memo: "Beli bensin toggle",
        lines: [
          { accountId: beban, debitMinor: 50_000n, creditMinor: 0n },
          { accountId: kas, debitMinor: 0n, creditMinor: 50_000n },
        ],
      } as never));
  }

  async function queueCount(): Promise<number> {
    const r = await admin.query(
      `SELECT count(*)::int AS n FROM rag_queue WHERE org_id=$1`, [orgId]);
    return r.rows[0].n as number;
  }

  it("helper reads env at call time (0/off, 1/unset/on)", async () => {
    const { isRagTenantIndexingEnabled } = await import("@/server/ai/rag-worker");
    process.env.RAG_TENANT_INDEXING = "0";
    expect(isRagTenantIndexingEnabled()).toBe(false);
    process.env.RAG_TENANT_INDEXING = "1";
    expect(isRagTenantIndexingEnabled()).toBe(true);
    delete process.env.RAG_TENANT_INDEXING;
    expect(isRagTenantIndexingEnabled()).toBe(true);
  });

  it("posting skips enqueue when disabled, enqueues when enabled", async () => {
    process.env.RAG_TENANT_INDEXING = "0";
    await post();
    expect(await queueCount()).toBe(0);

    process.env.RAG_TENANT_INDEXING = "1";
    await post();
    expect(await queueCount()).toBe(1);
  });

  it("drain returns 0 and leaves the row when disabled", async () => {
    const { processQueueBatch } = await import("@/server/ai/rag-worker");
    process.env.RAG_TENANT_INDEXING = "0";
    expect(await processQueueBatch(20)).toBe(0);
    expect(await queueCount()).toBe(1);
    process.env.RAG_TENANT_INDEXING = "1";
  });
});
