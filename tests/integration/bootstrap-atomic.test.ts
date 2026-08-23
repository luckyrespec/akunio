import "dotenv/config";
import { describe, it, expect, afterAll, vi } from "vitest";
import { Pool } from "pg";
import { truncateAll } from "./helpers";

const EMAIL = "orphan@bootstrap-atomic.test";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("atomic bootstrap", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  afterAll(async () => {
    await admin.query(`DELETE FROM "user" WHERE email LIKE '%@bootstrap-atomic.test'`);
    await admin.end();
    await truncateAll();
  });

  it("failed signup leaves no orphan user and no partial org; same email retries cleanly", async () => {
    // Force a mid-hook failure through the real pipeline: duplicate account
    // codes violate accounts_org_code_uq during seeding, inside the hook's
    // transaction.
    vi.resetModules();
    vi.doMock("@/core/accounts/coa-template", () => ({
      COA_TEMPLATE: [
        { code: "1000", name: "ASET A", type: "ASET", normal: "D" },
        { code: "1000", name: "ASET B", type: "ASET", normal: "D" },
      ],
    }));
    const { auth: brokenAuth } = await import("@/server/auth/auth-server");

    await expect(
      brokenAuth.api.signUpEmail({
        body: { email: EMAIL, password: "rahasia123", name: "PT Rusak" },
      }),
    ).rejects.toThrow();

    // no orphaned user: email is free again
    const u = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "user" WHERE email = $1`,
      [EMAIL],
    );
    expect(u.rows[0].n).toBe(0);

    // no partial bootstrap: nothing committed for the failed attempt
    const o = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM organizations WHERE name = 'PT Rusak'`,
    );
    expect(o.rows[0].n).toBe(0);
    const m = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM memberships m JOIN "user" us ON us.id = m.user_id WHERE us.email = $1`,
      [EMAIL],
    );
    expect(m.rows[0].n).toBe(0);

    // retry with the SAME email succeeds end-to-end
    vi.doUnmock("@/core/accounts/coa-template");
    vi.resetModules();
    const { auth: fixedAuth } = await import("@/server/auth/auth-server");
    const res = await fixedAuth.api.signUpEmail({
      body: { email: EMAIL, password: "rahasia123", name: "PT Uji Retry" },
    });
    expect(res.user).toBeDefined();

    const orgRow = await admin.query<{ org_id: string }>(
      `SELECT m.org_id FROM memberships m WHERE m.user_id = $1 AND m.role = 'OWNER'`,
      [res.user!.id],
    );
    expect(orgRow.rowCount).toBe(1);
    const orgId = orgRow.rows[0].org_id;
    const accs = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM accounts WHERE org_id=$1",
      [orgId],
    );
    expect(accs.rows[0].n).toBeGreaterThanOrEqual(31);
    const periods = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM fiscal_periods WHERE org_id=$1",
      [orgId],
    );
    expect(periods.rows[0].n).toBe(12);
  }, 30000);
});
