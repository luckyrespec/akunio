import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("org bootstrap on signup", () => {
  // admin conn: auth hooks run outside RLS scope
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  afterAll(async () => {
    await pool.end();
    await truncateAll();
  });

  it("creates org + owner membership + IN_PROGRESS profile, without COA/periods", async () => {
    const { auth } = await import("@/server/auth/auth-server");
    const res = await auth.api.signUpEmail({
      body: {
        email: `u${Date.now()}@test.id`,
        password: "rahasia123",
        name: "PT Uji",
      },
    });
    expect(res.user).toBeDefined();

    const orgRow = await pool.query<{ org_id: string }>(
      `SELECT m.org_id FROM memberships m WHERE m.user_id = $1 AND m.role = 'OWNER'`,
      [res.user!.id],
    );
    expect(orgRow.rowCount).toBe(1);
    const orgId = orgRow.rows[0].org_id;

    // Deferred provisioning: signup seeds neither accounts nor periods.
    const accs0 = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM accounts WHERE org_id=$1",
      [orgId],
    );
    expect(accs0.rows[0].n).toBe(0);
    const periods0 = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM fiscal_periods WHERE org_id=$1",
      [orgId],
    );
    expect(periods0.rows[0].n).toBe(0);

    const { getProfile } = await import("@/server/db/repos/onboarding.repo");
    const { db } = await import("@/server/db");
    const profile = await getProfile(db, orgId);
    expect(profile?.status).toBe("IN_PROGRESS");
    expect(profile?.currentStep).toBe("NAMA");

    // Explicit seeding still works and is idempotent.
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await expect(seedOrgData(orgId)).resolves.toBeUndefined();
    const accs = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM accounts WHERE org_id=$1",
      [orgId],
    );
    expect(accs.rows[0].n).toBeGreaterThanOrEqual(31);

    const periods = await pool.query<{ n: number; statuses: number }>(
      "SELECT count(*)::int AS n, count(DISTINCT status)::int AS statuses FROM fiscal_periods WHERE org_id=$1",
      [orgId],
    );
    expect(periods.rows[0].n).toBe(12);
    expect(periods.rows[0].statuses).toBe(1); // all OPEN

    await expect(seedOrgData(orgId)).resolves.toBeUndefined();
    const accs2 = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM accounts WHERE org_id=$1",
      [orgId],
    );
    expect(accs2.rows[0].n).toBe(accs.rows[0].n);

    // Double ensure still yields exactly one org + one profile.
    const { ensureUserWorkspace } = await import("@/server/bootstrap/ensure-workspace");
    await ensureUserWorkspace(res.user!.id, "PT Uji");
    const orgs = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM memberships WHERE user_id = $1`,
      [res.user!.id],
    );
    expect(orgs.rows[0].n).toBe(1);
    const profiles = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM org_profiles WHERE org_id = $1`,
      [orgId],
    );
    expect(profiles.rows[0].n).toBe(1);
  });
});
