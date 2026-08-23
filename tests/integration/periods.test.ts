import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("periods repo", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const q = drizzle(admin);

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Periode")).orgId;
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgId);
  });
  afterAll(async () => { await admin.end(); });

  it("finds period by date inside range", async () => {
    const { findPeriodByDate, listPeriods, setPeriodStatus } = await import("@/server/db/repos/periods.repo");
    const p = await findPeriodByDate(q, orgId, `${new Date().getFullYear()}-03-15`);
    expect(p).not.toBeNull();
    expect(p!.name.endsWith("-03")).toBe(true);

    const closed = await setPeriodStatus(q, orgId, p!.id, "CLOSED");
    expect(closed.status).toBe("CLOSED");
    const again = await findPeriodByDate(q, orgId, `${new Date().getFullYear()}-03-15`);
    expect(again!.status).toBe("CLOSED");

    await expect(setPeriodStatus(q, orgId, crypto.randomUUID(), "OPEN"))
      .rejects.toThrow("PERIODE_TIDAK_DITEMUKAN");

    expect((await listPeriods(q, orgId)).length).toBe(12);
  });
});
