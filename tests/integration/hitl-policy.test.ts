import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Organization HITL Policy Setting", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT HITL Test")).orgId;
    process.env.TEST_CTX_ORG = orgId;
  });

  afterAll(async () => {
    delete process.env.TEST_CTX_ORG;
    await truncateAll();
  });

  it("updates and persists aiHitlPolicy in organization settings", async () => {
    const { updateHitlPolicyAction } = await import("@/server/actions/settings.actions");

    const res = await updateHitlPolicyAction("strict");
    expect(res.ok).toBe(true);

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const settings = org.settings as { aiHitlPolicy?: string };
    expect(settings?.aiHitlPolicy).toBe("strict");
  });
});
