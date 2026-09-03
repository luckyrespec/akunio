import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import {
  createFixedAsset,
  listFixedAssets,
  getFixedAssetDetail,
  postMonthlyDepreciation,
  disposeAsset,
} from "@/server/db/repos/assets.repo";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Fixed Assets Repository & Actions", () => {
  let orgId: string;
  let assetAccId: string;
  let depAccId: string;
  let expAccId: string;
  let bankAccId: string;
  let gainLossAccId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Sukses Makmur")).orgId;

    // Buat fiscal period
    await db.insert(fiscalPeriods).values([
      {
        orgId,
        name: "2026-01",
        startsOn: "2026-01-01",
        endsOn: "2026-01-31",
        status: "OPEN",
      },
      {
        orgId,
        name: "2026-02",
        startsOn: "2026-02-01",
        endsOn: "2026-02-28",
        status: "OPEN",
      },
    ]);

    // Buat COA
    const [a1] = await db.insert(accounts).values({
      orgId, code: "1110", name: "Kas & Bank", type: "ASET", normal: "D", isBank: true
    }).returning();
    const [a2] = await db.insert(accounts).values({
      orgId, code: "1510", name: "Kendaraan Operasional", type: "ASET", normal: "D"
    }).returning();
    const [a3] = await db.insert(accounts).values({
      orgId, code: "1610", name: "Akum. Penyusutan Kendaraan", type: "ASET", normal: "K", contra: true
    }).returning();
    const [a4] = await db.insert(accounts).values({
      orgId, code: "6210", name: "Beban Penyusutan Kendaraan", type: "BEBAN", normal: "D"
    }).returning();
    const [a5] = await db.insert(accounts).values({
      orgId, code: "7110", name: "Laba/Rugi Pelepasan Aset", type: "PENDAPATAN", normal: "K"
    }).returning();

    bankAccId = a1.id;
    assetAccId = a2.id;
    depAccId = a3.id;
    expAccId = a4.id;
    gainLossAccId = a5.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("registers an asset, schedules depreciation, posts monthly GL, and disposes asset", async () => {
    // 1. Daftarkan Aset
    const asset = await createFixedAsset(db, {
      orgId,
      name: "Mobil Avanza",
      category: "KENDARAAN",
      acquisitionDate: "2026-01-01",
      inServiceDate: "2026-01-01",
      acquisitionCostMinor: 12000000000n, // 120.000.000 (12.000.000.000 sen)
      salvageValueMinor: 0n,
      usefulLifeMonths: 12, // 12 bulan (1.000.000.000 sen / bulan)
      depreciationMethod: "STRAIGHT_LINE",
      assetAccountId: assetAccId,
      accumulatedDepAccountId: depAccId,
      depreciationExpenseAccountId: expAccId,
    });

    expect(asset.id).toBeDefined();
    expect(asset.code).toMatch(/^AST-/);

    // 2. Periksa jadwal depresiasi yang digenerate otomatis
    const detail = await getFixedAssetDetail(db, orgId, asset.id);
    expect(detail).toBeDefined();
    expect(detail?.schedule).toHaveLength(12);
    expect(detail?.schedule[0].depreciationAmountMinor).toBe(1000000000n);

    // 3. Posting Depresiasi Bulanan untuk 2026-01
    const postResult = await postMonthlyDepreciation(db, {
      orgId,
      periodName: "2026-01",
      postedBy: "test-user",
    });

    expect(postResult.postedCount).toBe(1);
    expect(postResult.journalEntryId).toBeDefined();

    // Verifikasi jurnal tercatat resmi di journal_entries
    const [je] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, postResult.journalEntryId!));
    expect(je).toBeDefined();
    expect(je.status).toBe("POSTED");

    // 4. Pelepasan Aset (Disposal) pada bulan Februari
    const disposalResult = await disposeAsset(db, {
      orgId,
      assetId: asset.id,
      disposalDate: "2026-02-15",
      disposalType: "SALE",
      proceedsMinor: 11500000000n, // Dijual 115jt. Nilai buku = 120jt - 10jt = 110jt. Laba = 5jt
      depositAccountId: bankAccId,
      gainLossAccountId: gainLossAccId,
      postedBy: "test-user",
    });

    expect(disposalResult.gainLossMinor).toBe(500000000n); // Laba 5.000.000 (500.000.000 sen)
    expect(disposalResult.journalEntryId).toBeDefined();

    // Verifikasi status aset menjadi DISPOSED
    const updatedAsset = await getFixedAssetDetail(db, orgId, asset.id);
    expect(updatedAsset?.asset.status).toBe("DISPOSED");
  });
});
