import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { makeOrg, truncateAll } from "./helpers";
import { accounts } from "@/server/db/schema/org";
import { submitOnboardingMessage, finalizeOnboarding } from "@/server/onboarding/engine";

process.env.AI_MOCK = "1";

describe("onboarding engine", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("walks 7 steps from chips and free text, then finalizes with KULINER COA", async () => {
    const { orgId } = await makeOrg("Org Tes");
    let r = await submitOnboardingMessage(db, orgId, "Budi");
    expect(r.step).toBe("USAHA");
    r = await submitOnboardingMessage(db, orgId, "Warung Budi");
    expect(r.step).toBe("JENIS");
    r = await submitOnboardingMessage(db, orgId, "warteg di Tebet");
    expect(r.step).toBe("STOK");
    expect(r.chips).toContain("Harga rata-rata (disarankan)");
    expect(r.steps).toContain("STOK");
    r = await submitOnboardingMessage(db, orgId, "Harga rata-rata (disarankan)");
    expect(r.step).toBe("STOK");
    expect(r.chips).toContain("Otomatis tiap jual/beli (disarankan)");
    r = await submitOnboardingMessage(db, orgId, "Otomatis tiap jual/beli (disarankan)");
    expect(r.step).toBe("SKALA");
    r = await submitOnboardingMessage(db, orgId, "omzet 20 juta, karyawan 3");
    expect(r.step).toBe("LOKASI");
    r = await submitOnboardingMessage(db, orgId, "Lewati");
    expect(r.step).toBe("REFERRAL");
    r = await submitOnboardingMessage(db, orgId, "Teman");
    expect(r.step).toBe("RINGKASAN");
    expect(r.reply).toContain("Warung Budi");
    expect(r.reply).toContain("harga rata-rata");
    r = await submitOnboardingMessage(db, orgId, "Ya, lanjut");
    expect(r.step).toBe("COA");
    expect(r.coaPreview?.some((a) => a.name === "Beban Komisi Delivery")).toBe(true);
    r = await submitOnboardingMessage(db, orgId, "tambah Beban Iklan");
    expect(r.coaPreview?.some((a) => a.name === "Beban Iklan")).toBe(true);
    r = await submitOnboardingMessage(db, orgId, "gunakan ini");
    expect(r.finished).toBe(true);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    expect(rows.some((a) => a.name === "Beban Iklan")).toBe(true);
    expect(rows.some((a) => a.name === "Beban Komisi Delivery")).toBe(true);
    const { getInventorySettings } = await import("@/server/db/repos/inventory.repo");
    const settings = await getInventorySettings(db, orgId);
    expect(settings?.valuationMethod).toBe("WEIGHTED_AVERAGE");
    expect(settings?.recordingMethod).toBe("PERPETUAL");
  });

  it("JASA melewati STOK langsung ke SKALA", async () => {
    const { orgId } = await makeOrg("Org Jasa");
    const { upsertProfile } = await import("@/server/db/repos/onboarding.repo");
    await upsertProfile(db, orgId, {
      displayName: "B",
      businessName: "Salon",
      currentStep: "JENIS",
    });
    const r = await submitOnboardingMessage(db, orgId, "salon");
    expect(r.step).toBe("SKALA");
    expect(r.steps).not.toContain("STOK");
  });

  it("finalize memakai pilihan stok dari onboarding", async () => {
    const { orgId } = await makeOrg("Org Stok");
    const { upsertProfile } = await import("@/server/db/repos/onboarding.repo");
    const { coaForBusinessType } = await import("@/core/accounts/coa-templates");
    await upsertProfile(db, orgId, {
      displayName: "A",
      businessName: "Toko",
      businessType: "DAGANG",
      currentStep: "COA",
      coaDraft: coaForBusinessType("DAGANG"),
    });
    const { organizations } = await import("@/server/db/schema/org");
    await db.update(organizations)
      .set({ settings: { stockValuation: "FIFO", stockRecording: "PERIODIC" } })
      .where(eq(organizations.id, orgId));
    await finalizeOnboarding(orgId, "stok-key-1");
    const { getInventorySettings } = await import("@/server/db/repos/inventory.repo");
    const settings = await getInventorySettings(db, orgId);
    expect(settings?.valuationMethod).toBe("FIFO");
    expect(settings?.recordingMethod).toBe("PERIODIC");
  });

  it("handles SKALA in two phases (revenue chip, then employees)", async () => {
    const { orgId } = await makeOrg("Org Skala");
    const { upsertProfile } = await import("@/server/db/repos/onboarding.repo");
    await upsertProfile(db, orgId, {
      displayName: "B",
      businessName: "WB",
      businessType: "DAGANG",
      currentStep: "SKALA",
    });
    let r = await submitOnboardingMessage(db, orgId, "10–50jt / bulan");
    expect(r.step).toBe("SKALA");
    expect(r.chips).toContain("2–5 orang");
    r = await submitOnboardingMessage(db, orgId, "2–5 orang");
    expect(r.step).toBe("LOKASI");
    r = await submitOnboardingMessage(db, orgId, "Lewati");
    expect(r.step).toBe("REFERRAL");
  });

  it("finalize is idempotent under double submit", async () => {
    const { orgId } = await makeOrg("Org Idem");
    const { upsertProfile } = await import("@/server/db/repos/onboarding.repo");
    const { coaForBusinessType } = await import("@/core/accounts/coa-templates");
    const jasa = coaForBusinessType("JASA");
    await upsertProfile(db, orgId, {
      displayName: "A",
      businessName: "B",
      businessType: "JASA",
      currentStep: "COA",
      coaDraft: jasa,
    });
    const key = "idem-key-1";
    await finalizeOnboarding(orgId, key);
    await finalizeOnboarding(orgId, key);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    expect(rows.length).toBe(jasa.length);
  });

  it("legacy org WITH posted journals keeps its COA and still completes", async () => {
    const { orgId } = await makeOrg("Org Lama");
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    await seedOrgData(orgId);
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const kas = accRows.find((a) => a.code === "1110")!;
    const modal = accRows.find((a) => a.code === "3100")!;
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    await postJournalEntry(db, orgId, "test@test.id", {
      dateISO: new Date().toISOString().slice(0, 10),
      memo: "modal awal",
      lines: [
        { accountId: kas.id, debitMinor: 100000000n, creditMinor: 0n },
        { accountId: modal.id, debitMinor: 0n, creditMinor: 100000000n },
      ],
    });
    const { upsertProfile } = await import("@/server/db/repos/onboarding.repo");
    await upsertProfile(db, orgId, {
      displayName: "L",
      businessName: "Usaha Lama",
      businessType: "DAGANG",
      currentStep: "COA",
    });
    const res = await finalizeOnboarding(orgId, "legacy-key");
    expect(res.replaced).toBe(false);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    expect(rows.some((a) => a.name === "Pendapatan Usaha")).toBe(true);
  });
});
