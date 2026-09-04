import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { createFixedAsset } from "@/server/db/repos/assets.repo";
import { postJournalEntry, toMinor } from "@/server/db/repos/journals.repo";
import { buildAcquisitionJournal } from "@/core/assets/acquisition";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Fixed Assets Acquisition Journal", () => {
  let orgId: string;
  let bankAccId: string;
  let assetAccId: string;
  let depAccId: string;
  let expAccId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Aset Baru")).orgId;

    await db.insert(fiscalPeriods).values([
      {
        orgId,
        name: "2026-09",
        startsOn: "2026-09-01",
        endsOn: "2026-09-30",
        status: "OPEN",
      },
    ]);

    const [b] = await db.insert(accounts).values({
      orgId, code: "1110", name: "Kas & Bank", type: "ASET", normal: "D", isBank: true
    }).returning();
    const [a] = await db.insert(accounts).values({
      orgId, code: "1510", name: "Peralatan Kantor", type: "ASET", normal: "D"
    }).returning();
    const [d] = await db.insert(accounts).values({
      orgId, code: "1610", name: "Akum. Penyusutan Peralatan", type: "ASET", normal: "K", contra: true
    }).returning();
    const [e] = await db.insert(accounts).values({
      orgId, code: "6210", name: "Beban Penyusutan Peralatan", type: "BEBAN", normal: "D"
    }).returning();

    bankAccId = b.id;
    assetAccId = a.id;
    depAccId = d.id;
    expAccId = e.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("mendaftarkan aset dan memposting jurnal perolehan atomik Dr 1510 / Cr 1110", async () => {
    const { asset, journalEntryId } = await db.transaction(async (tx) => {
      const created = await createFixedAsset(tx, {
        orgId,
        name: "Laptop Kerja",
        category: "INVENTARIS_KANTOR",
        acquisitionDate: "2026-09-03",
        inServiceDate: "2026-09-03",
        acquisitionCostMinor: 1500000000n, // 15.000.000
        salvageValueMinor: 0n,
        usefulLifeMonths: 48,
        depreciationMethod: "STRAIGHT_LINE",
        assetAccountId: assetAccId,
        accumulatedDepAccountId: depAccId,
        depreciationExpenseAccountId: expAccId,
      });

      const je = await postJournalEntry(
        tx,
        orgId,
        "test-user",
        buildAcquisitionJournal({
          assetId: created.id,
          assetCode: created.code,
          assetName: created.name,
          assetAccountId: assetAccId,
          counterAccountId: bankAccId,
          acquisitionCostMinor: 1500000000n,
          acquisitionDate: "2026-09-03",
        }),
      );

      return { asset: created, journalEntryId: je.id };
    });

    expect(asset.code).toMatch(/^AST-/);
    expect(journalEntryId).toBeDefined();

    const [je] = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.id, journalEntryId));
    expect(je.status).toBe("POSTED");
    expect(je.memo).toContain(asset.code);

    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.entryId, journalEntryId));
    expect(lines).toHaveLength(2);

    const debit = lines.find((l) => l.accountId === assetAccId)!;
    const credit = lines.find((l) => l.accountId === bankAccId)!;
    expect(toMinor(debit.debit)).toBe(1500000000n);
    expect(toMinor(debit.credit)).toBe(0n);
    expect(toMinor(credit.debit)).toBe(0n);
    expect(toMinor(credit.credit)).toBe(1500000000n);
  });
});
