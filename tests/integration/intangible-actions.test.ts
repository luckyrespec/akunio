import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { recommendIntangibleSakAction } from "@/server/actions/intangible.actions";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Intangible actions", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Intangible Actions")).orgId;
    await db.insert(fiscalPeriods).values([
      { orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN" },
    ]);
    process.env.TEST_CTX_ORG = orgId;
    process.env.AI_MOCK = "1";
  });

  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    delete process.env.AI_MOCK;
    await truncateAll();
  });

  it("rekomendasi luring mengembalikan kategori + analisis", async () => {
    const res = await recommendIntangibleSakAction({ name: "Lisensi Akuntansi", category: "LAINNYA" });
    expect(res.ok).toBe(true);
    expect(res.data?.category).toBe("LISENSI_SOFTWARE");
    expect(res.data?.sakRef).toContain("Bab 12");
    expect(res.data?.heuristic).toBe(true);
  });

  it("nama kosong ditolak tanpa memanggil AI", async () => {
    const res = await recommendIntangibleSakAction({ name: "   ", category: "LAINNYA" });
    expect(res.ok).toBe(false);
  });
});
