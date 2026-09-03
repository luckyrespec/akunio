import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts } from "@/server/db/schema/org";
import { fixedAssets, assetDepreciationLines, assetDisposals } from "@/server/db/schema/assets";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Fixed Assets Schema & RLS", () => {
  let orgId: string;
  let assetAccId: string;
  let depAccId: string;
  let expAccId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("Test Org Assets")).orgId;

    const [acc1] = await db
      .insert(accounts)
      .values({
        orgId,
        code: "1510",
        name: "Peralatan Kantor",
        type: "ASET",
        normal: "D",
      })
      .returning();

    const [acc2] = await db
      .insert(accounts)
      .values({
        orgId,
        code: "1610",
        name: "Akum. Penyusutan Peralatan",
        type: "ASET",
        normal: "K",
        contra: true,
      })
      .returning();

    const [acc3] = await db
      .insert(accounts)
      .values({
        orgId,
        code: "6210",
        name: "Beban Penyusutan Peralatan",
        type: "BEBAN",
        normal: "D",
      })
      .returning();

    assetAccId = acc1.id;
    depAccId = acc2.id;
    expAccId = acc3.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("can create a fixed asset and depreciation line", async () => {
    const [asset] = await db
      .insert(fixedAssets)
      .values({
        orgId,
        code: "AST-2026-0001",
        name: "Laptop ThinkPad",
        category: "INVENTARIS_KANTOR",
        acquisitionDate: "2026-01-15",
        inServiceDate: "2026-01-15",
        acquisitionCostMinor: 1200000000n,
        salvageValueMinor: 0n,
        usefulLifeMonths: 48,
        depreciationMethod: "STRAIGHT_LINE",
        assetAccountId: assetAccId,
        accumulatedDepAccountId: depAccId,
        depreciationExpenseAccountId: expAccId,
        status: "ACTIVE",
      })
      .returning();

    expect(asset.id).toBeDefined();
    expect(asset.code).toBe("AST-2026-0001");

    const [line] = await db
      .insert(assetDepreciationLines)
      .values({
        orgId,
        assetId: asset.id,
        periodName: "2026-01",
        depreciationDate: "2026-01-31",
        depreciationAmountMinor: 25000000n,
        accumulatedDepreciationMinor: 25000000n,
        bookValueMinor: 1175000000n,
        status: "SCHEDULED",
      })
      .returning();

    expect(line.id).toBeDefined();
    expect(line.bookValueMinor).toBe(1175000000n);
  });
});
