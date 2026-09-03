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
    // Force a mid-hook failure through the real pipeline: fail the onboarding
    // profile insert at the end of the hook's transaction.
    vi.resetModules();
    vi.doMock("@/server/db/repos/onboarding.repo", () => ({
      getProfile: async () => null,
      upsertProfile: async () => {
        throw new Error("boom-profile");
      },
      addOnboardingMessage: async () => {
        throw new Error("boom-profile");
      },
      listOnboardingMessages: async () => [],
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

    // retry with the SAME email succeeds end-to-end (empty org + profile)
    vi.doUnmock("@/server/db/repos/onboarding.repo");
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
    // Deferred provisioning: no COA or periods at signup.
    const accs = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM accounts WHERE org_id=$1",
      [orgId],
    );
    expect(accs.rows[0].n).toBe(0);
    const periods = await admin.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM fiscal_periods WHERE org_id=$1",
      [orgId],
    );
    expect(periods.rows[0].n).toBe(0);
    const prof = await admin.query<{ status: string }>(
      "SELECT status FROM org_profiles WHERE org_id=$1",
      [orgId],
    );
    expect(prof.rows[0]?.status).toBe("IN_PROGRESS");
  }, 30000);
});
