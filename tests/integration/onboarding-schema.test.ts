import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { makeOrg, truncateAll } from "./helpers";
import {
  getProfile,
  upsertProfile,
  addOnboardingMessage,
  listOnboardingMessages,
} from "@/server/db/repos/onboarding.repo";

describe("onboarding schema", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("creates an IN_PROGRESS profile and advances it", async () => {
    const { orgId } = await makeOrg("Warung Tes");
    const created = await upsertProfile(db, orgId, { displayName: "Budi" });
    expect(created.status).toBe("IN_PROGRESS");
    expect(created.currentStep).toBe("NAMA");

    const updated = await upsertProfile(db, orgId, {
      businessName: "Warung Budi",
      status: "COMPLETED",
    });
    expect(updated.businessName).toBe("Warung Budi");

    const fetched = await getProfile(db, orgId);
    expect(fetched?.displayName).toBe("Budi");
    expect(fetched?.status).toBe("COMPLETED");
  });

  it("stores messages in chronological order", async () => {
    const { orgId } = await makeOrg("Warung Tes 2");
    await addOnboardingMessage(db, orgId, "assistant", "Halo! Siapa nama kamu?", "NAMA");
    await addOnboardingMessage(db, orgId, "user", "Budi", "NAMA");
    const msgs = await listOnboardingMessages(db, orgId);
    expect(msgs.map((m) => m.content)).toEqual([
      "Halo! Siapa nama kamu?",
      "Budi",
    ]);
  });
});
