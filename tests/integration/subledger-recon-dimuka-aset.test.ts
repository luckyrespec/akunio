import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { subledgerControls } from "@/server/db/schema/subledger";
import { withOrg } from "@/server/db/repos/with-org";
import { reconcileSubledger } from "@/server/db/repos/subledger.repo";
import { createPrepaidContract, postMonthlyAmortization } from "@/server/db/repos/prepaid.repo";
import { createFixedAsset, postMonthlyDepreciation } from "@/server/db/repos/assets.repo";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { buildAcquisitionJournal } from "@/core/assets/acquisition";

async function seedMiniCoa(orgId: string) {
  const mk = async (code: string, name: string, type: "ASET" | "BEBAN", normal: "D" | "K", extra?: Record<string, unknown>) => {
    const [r] = await db.insert(accounts).values({ orgId, code, name, type, normal, ...extra }).returning();
    return r.id;
  };
  const acc = {
    kas: await mk("1110", "Kas", "ASET", "D"),
    dimuka: await mk("1600", "Sewa Dibayar di Muka", "ASET", "D"),
    bebanSewa: await mk("5300", "Beban Sewa", "BEBAN", "D"),
    peralatan: await mk("1510", "Peralatan Kantor", "ASET", "D"),
    akum: await mk("1590", "Akumulasi Penyusutan", "ASET", "K", { contra: true }),
    bebanSusut: await mk("5600", "Beban Penyusutan", "BEBAN", "D"),
  };
  const [root] = await db.insert(accounts).values({
    orgId, code: "1500", name: "Peralatan", type: "ASET", normal: "D",
  }).returning();
  await db.insert(fiscalPeriods).values([
    { orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN" },
    { orgId, name: "2026-02", startsOn: "2026-02-01", endsOn: "2026-02-28", status: "OPEN" },
  ]);
  await db.insert(subledgerControls).values([
    { orgId, kind: "DIMUKA", controlAccountId: acc.dimuka },
    { orgId, kind: "ASET_TETAP", controlAccountId: root.id },
  ]);
  return acc;
}

describe("recon dimuka + aset", () => {
  beforeEach(async () => { await truncateAll(); });
  it("DIMUKA cocok setelah bayar + 1x amortisasi", async () => {
    const { orgId } = await makeOrg("org-recon-d");
    const acc = await seedMiniCoa(orgId);
    await withOrg(orgId, (tx) => createPrepaidContract(tx, {
      orgId, name: "Sewa", startDate: "2026-01-05", months: 12, totalMinor: 1200000000n,
      controlAccountId: acc.dimuka, expenseAccountId: acc.bebanSewa, paymentAccountId: acc.kas, postedBy: "o@x.id",
    }));
    await withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "o@x.id" }));
    const row = (await reconcileSubledger(db, orgId)).find((r) => r.kind === "DIMUKA")!;
    expect(row.differenceMinor).toBe(0n);
    expect(row.subledgerTotalMinor).toBe(1100000000n);
  });
  it("ASET_TETAP = nilai buku vs neto 15xx", async () => {
    const { orgId } = await makeOrg("org-recon-a");
    const acc = await seedMiniCoa(orgId);
    await withOrg(orgId, async (tx) => {
      const created = await createFixedAsset(tx, {
        orgId, name: "Laptop", category: "INVENTARIS_KANTOR",
        acquisitionDate: "2026-01-05", inServiceDate: "2026-01-01",
        acquisitionCostMinor: 1200000000n, usefulLifeMonths: 12,
        depreciationMethod: "STRAIGHT_LINE",
        assetAccountId: acc.peralatan, accumulatedDepAccountId: acc.akum,
        depreciationExpenseAccountId: acc.bebanSusut,
      });
      await postJournalEntry(tx, orgId, "o@x.id", buildAcquisitionJournal({
        assetId: created.id, assetCode: created.code, assetName: created.name,
        assetAccountId: acc.peralatan, counterAccountId: acc.kas,
        acquisitionCostMinor: 1200000000n, acquisitionDate: "2026-01-05",
      }));
    });
    await withOrg(orgId, (tx) => postMonthlyDepreciation(tx, { orgId, periodName: "2026-01", postedBy: "o@x.id" }));
    const row = (await reconcileSubledger(db, orgId)).find((r) => r.kind === "ASET_TETAP")!;
    expect(row.differenceMinor).toBe(0n);
    expect(row.subledgerTotalMinor).toBe(1100000000n);
  });
});
