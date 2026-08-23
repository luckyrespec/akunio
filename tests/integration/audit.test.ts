import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("audit hash chain", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgId: string;

  beforeAll(async () => { await truncateAll(); orgId = (await makeOrg("PT Audit")).orgId; });
  afterEach(async () => { await truncateAll(); });

  it("chains records and detects tampering", async () => {
    const { appendAudit, verifyChain } = await import("@/server/db/repos/audit.repo");
    const mk = (i: number) => ({
      orgId, actor: "a@test.id", action: "T", subjectType: "x", subjectId: String(i), data: { i },
    });
    await drizzle(admin).transaction(async (tx) => { for (const i of [1, 2, 3]) await appendAudit(tx, mk(i)); });

    expect((await verifyChain(admin, orgId)).valid).toBe(true);

    // tamper: rewrite one payload directly
    await admin.query(`UPDATE audit_log SET data = '{"i":999}' WHERE subject_id='2'`);
    const verdict = await verifyChain(admin, orgId);
    expect(verdict.valid).toBe(false);
    expect(verdict.brokenAtSeq).toBe(2);
  });
});
