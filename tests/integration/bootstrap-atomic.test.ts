import "dotenv/config";
import { describe, it, expect, afterAll, vi } from "vitest";
import { Pool } from "pg";
import { truncateAll } from "./helpers";

const USER_ID = "neon-user-boom";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("atomic bootstrap", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  afterAll(async () => {
    await admin.query(`DELETE FROM "user" WHERE id = $1`, [USER_ID]);
    await admin.end();
    await truncateAll();
  });

  it("failed ensure leaves no partial org; retry succeeds cleanly", async () => {
    // Force a mid-transaction failure: fail the onboarding profile insert
    // at the end of ensureUserWorkspace's transaction.
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
    const { ensureUserWorkspace: brokenEnsure } = await import(
      "@/server/bootstrap/ensure-workspace"
    );

    await expect(brokenEnsure(USER_ID, "PT Rusak", "rusak@test.id")).rejects.toThrow(
      "boom-profile",
    );

    // No partial bootstrap: nothing committed for the failed attempt.
    const o = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM organizations WHERE name = 'PT Rusak'`,
    );
    expect(o.rows[0].n).toBe(0);
    const m = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM memberships WHERE user_id = $1`,
      [USER_ID],
    );
    expect(m.rows[0].n).toBe(0);

    // Retry with the SAME user id succeeds end-to-end (empty org + profile).
    vi.doUnmock("@/server/db/repos/onboarding.repo");
    vi.resetModules();
    const { ensureUserWorkspace: fixedEnsure } = await import(
      "@/server/bootstrap/ensure-workspace"
    );
    await fixedEnsure(USER_ID, "PT Uji Retry", "retry@test.id");

    const orgRow = await admin.query<{ org_id: string }>(
      `SELECT m.org_id FROM memberships m WHERE m.user_id = $1 AND m.role = 'OWNER'`,
      [USER_ID],
    );
    expect(orgRow.rowCount).toBe(1);
    const orgId = orgRow.rows[0].org_id;
    // Deferred provisioning: no COA or periods at ensure time.
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
