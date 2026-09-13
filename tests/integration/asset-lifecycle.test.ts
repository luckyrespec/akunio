import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import {
  createFixedAsset,
  postMonthlyDepreciation,
  disposeAsset,
} from "@/server/db/repos/assets.repo";
import { executeNaraTool } from "@/server/ai/nara-tools";
import { withOrg } from "@/server/db/repos/with-org";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Aset lifecycle (Plan C4)", () => {
  let orgId: string;
  let bankAccId: string;
  let assetAccId: string;
  let depAccId: string;
  let expAccId: string;
  let gainLossAccId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Aset Lifecycle C4")).orgId;

    await db.insert(fiscalPeriods).values([
      { orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN" },
      { orgId, name: "2026-02", startsOn: "2026-02-01", endsOn: "2026-02-28", status: "OPEN" },
      { orgId, name: "2026-03", startsOn: "2026-03-01", endsOn: "2026-03-31", status: "OPEN" },
    ]);

    const [b] = await db
      .insert(accounts)
      .values({ orgId, code: "1110", name: "Kas & Bank", type: "ASET", normal: "D", isBank: true })
      .returning();
    const [a] = await db
      .insert(accounts)
      .values({ orgId, code: "1510", name: "Kendaraan Operasional", type: "ASET", normal: "D" })
      .returning();
    const [d] = await db
      .insert(accounts)
      .values({ orgId, code: "1610", name: "Akum. Penyusutan Kendaraan", type: "ASET", normal: "K", contra: true })
      .returning();
    const [e] = await db
      .insert(accounts)
      .values({ orgId, code: "6210", name: "Beban Penyusutan Kendaraan", type: "BEBAN", normal: "D" })
      .returning();
    const [g] = await db
      .insert(accounts)
      .values({ orgId, code: "7110", name: "Laba/Rugi Pelepasan Aset", type: "PENDAPATAN", normal: "K" })
      .returning();

    bankAccId = b.id;
    assetAccId = a.id;
    depAccId = d.id;
    expAccId = e.id;
    gainLossAccId = g.id;
  });

  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  async function makeAsset(name: string) {
    return withOrg(orgId, (tx) =>
      createFixedAsset(tx, {
        orgId,
        name,
        category: "KENDARAAN",
        acquisitionDate: "2026-01-05",
        inServiceDate: "2026-01-01",
        acquisitionCostMinor: 12_000_000_00n,
        salvageValueMinor: 0n,
        usefulLifeMonths: 12,
        depreciationMethod: "STRAIGHT_LINE",
        assetAccountId: assetAccId,
        accumulatedDepAccountId: depAccId,
        depreciationExpenseAccountId: expAccId,
      }),
    );
  }

  function runDep(period: string) {
    return withOrg(orgId, (tx) =>
      postMonthlyDepreciation(tx, { orgId, periodName: period, postedBy: "tester" }),
    );
  }

  async function sourceOf(journalEntryId: string): Promise<string | null> {
    const r = await admin.query<{ source: string }>(
      `SELECT source FROM journal_entries WHERE id=$1`,
      [journalEntryId],
    );
    return r.rows[0]?.source ?? null;
  }

  it("susut konkuren ganda satu jurnal + source MANUAL", async () => {
    await makeAsset("Mobil Susut Konkuren");
    const [a, b] = await Promise.all([runDep("2026-01"), runDep("2026-01")]);
    expect(a.journalEntryId).not.toBeNull();
    expect(a.journalEntryId).toBe(b.journalEntryId);
    expect(await sourceOf(a.journalEntryId!)).toBe("MANUAL");
  });

  it("disposal SALE tanpa kas ditolak", async () => {
    const asset = await makeAsset("Mobil Jual Tanpa Kas");
    await expect(
      withOrg(orgId, (tx) =>
        disposeAsset(tx, {
          orgId,
          assetId: asset.id,
          disposalDate: "2026-01-15",
          disposalType: "SALE",
          proceedsMinor: 1_000_000n,
          gainLossAccountId: gainLossAccId,
          postedBy: "tester",
        }),
      ),
    ).rejects.toThrow("KAS_PENJUALAN_WAJIB");
  });

  it("disposal ditolak bila susut terjadwal sebelum tanggal", async () => {
    const asset = await makeAsset("Mobil Susut Belum Posting");
    await runDep("2026-01");
    await expect(
      withOrg(orgId, (tx) =>
        disposeAsset(tx, {
          orgId,
          assetId: asset.id,
          disposalDate: "2026-02-28",
          disposalType: "SALE",
          proceedsMinor: 11_500_000_00n,
          depositAccountId: bankAccId,
          gainLossAccountId: gainLossAccId,
          postedBy: "tester",
        }),
      ),
    ).rejects.toThrow("SUSUT_BELUM_POSTING");
  });

  it("AI register asset ikut jurnal perolehan", async () => {
    const out = await executeNaraTool(orgId, "tester@test.id", "register_fixed_asset", {
      name: "Mobil AI Terjurnal",
      category: "KENDARAAN",
      acquisitionDate: "2026-01-10",
      acquisitionCostText: "12000000",
      usefulLifeMonths: 12,
      depreciationMethod: "STRAIGHT_LINE",
      assetAccountId: assetAccId,
      accumulatedDepAccountId: depAccId,
      depreciationExpenseAccountId: expAccId,
      counterAccountId: bankAccId,
    });
    expect(out.success).toBe(true);
    const data = out.data as { journalEntryId?: string | null };
    expect(data.journalEntryId).toBeDefined();
    expect(data.journalEntryId).not.toBeNull();
  });
});
