import "dotenv/config";
import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { truncateAll } from "./helpers";

// NOTE: workspace provisioning is driven by lazy ensureUserWorkspace on the
// first authenticated request (Neon Auth is managed — there is no local
// signup hook anymore). Real signup is covered by e2e against Neon Auth.
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("org bootstrap on first login", () => {
  // admin conn: provisioning runs outside RLS scope
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  afterAll(async () => {
    await pool.end();
    await truncateAll();
  });

  it("creates org + owner membership + IN_PROGRESS profile, without COA/periods", async () => {
    const { ensureUserWorkspace } = await import("@/server/bootstrap/ensure-workspace");
    const userId = `neon-user-${Date.now()}`;
    await ensureUserWorkspace(userId, "PT Uji", `u${Date.now()}@test.id`);

    const orgRow = await pool.query<{ org_id: string }>(
      `SELECT m.org_id FROM memberships m WHERE m.user_id = $1 AND m.role = 'OWNER'`,
      [userId],
    );
    expect(orgRow.rowCount).toBe(1);
    const orgId = orgRow.rows[0].org_id;

    // Deferred provisioning: ensure seeds neither accounts nor periods.
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

    // Local identity mirror is kept for member-list joins.
    const mirror = await pool.query<{ email: string }>(
      `SELECT email FROM "user" WHERE id = $1`,
      [userId],
    );
    expect(mirror.rowCount).toBe(1);

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
    await ensureUserWorkspace(userId, "PT Uji");
    const orgs = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM memberships WHERE user_id = $1`,
      [userId],
    );
    expect(orgs.rows[0].n).toBe(1);
    const profiles = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM org_profiles WHERE org_id = $1`,
      [orgId],
    );
    expect(profiles.rows[0].n).toBe(1);
  });
});
