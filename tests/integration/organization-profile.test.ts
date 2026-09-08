import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { organizations } from "@/server/db/schema/org";
import { getProfile, upsertProfile } from "@/server/db/repos/onboarding.repo";

describe("profil organisasi", () => {
  beforeEach(async () => { await truncateAll(); });

  it("nama org bisa diubah, ID tetap; profil alamat tersimpan", async () => {
    const { orgId } = await makeOrg("Nama Lama");
    await withOrg(orgId, async (tx) => {
      await tx.update(organizations).set({ name: "Nama Baru" }).where(eq(organizations.id, orgId));
      await upsertProfile(tx, orgId, { businessName: "Brand X", city: "Yogyakarta", address: "Jl. Malioboro 1" });
    });
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    expect(org.id).toBe(orgId);
    expect(org.name).toBe("Nama Baru");
    const profile = await withOrg(orgId, (tx) => getProfile(tx, orgId));
    expect(profile?.businessName).toBe("Brand X");
    expect(profile?.city).toBe("Yogyakarta");
    expect(profile?.address).toBe("Jl. Malioboro 1");
  });
});
