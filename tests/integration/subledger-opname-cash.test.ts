import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import {
  createInventoryItem, upsertInventorySettings, createStockOpname,
  generateAdjustmentJournalDraft, postOpnameAdjustment,
} from "@/server/db/repos/inventory.repo";
import { seedSubledgerControls, listLinksForEntry } from "@/server/db/repos/subledger.repo";
import { createCashEntryRepo } from "@/server/db/repos/cash-bank.repo";

const year = new Date().getFullYear();

async function setupStock(name: string) {
  const { orgId } = await makeOrg(name);
  await seedOrgData(orgId);
  const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byCode = (c: string) => rows.find((a) => a.code === c)!.id;
  await withOrg(orgId, (tx) =>
    upsertInventorySettings(tx, orgId, {
      valuationMethod: "WEIGHTED_AVERAGE",
      recordingMethod: "PERPETUAL",
      cogsAccountId: byCode("5100"),
      adjustmentLossAccountId: byCode("5900"),
      adjustmentGainAccountId: byCode("4200"),
    }),
  );
  await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
    receivableAccountId: byCode("1200"), payableAccountId: byCode("2100"), inventoryAccountId: byCode("1300"),
  }));
  const item = await withOrg(orgId, (tx) =>
    createInventoryItem(tx, orgId, {
      code: "BRG-OPN", name: "Kertas", unit: "Rim", initialQty: 10, initialCostMinor: 50_000n,
    }),
  );
  const customer = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
  return { orgId, byCode, item, customer };
}

describe("subledger opname + kas-bank", () => {
  beforeEach(async () => { await truncateAll(); });

  it("opname defisit: draf + posting membawa link PERSEDIAAN", async () => {
    const { orgId, item } = await setupStock("opname-links");
    const opname = await withOrg(orgId, (tx) =>
      createStockOpname(tx, orgId, {
        opnameDate: `${year}-09-07`, notes: "test", items: [{ itemId: item.id, physicalQty: 8 }],
      }),
    );
    const draft = await withOrg(orgId, (tx) => generateAdjustmentJournalDraft(tx, orgId, opname.id));
    expect(draft.journalEntryId).toBeTruthy();
    const links = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, draft.journalEntryId!));
    const pers = links.filter((l) => l.kind === "PERSEDIAAN");
    expect(pers.length).toBe(1);
    expect(pers[0].refId).toBe(item.id);
    expect(pers[0].amountMinor).toBe(100_000n);
    const posted = await withOrg(orgId, (tx) => postOpnameAdjustment(tx, orgId, opname.id, "t@t.id"));
    expect(posted.journalEntryId).toBe(draft.journalEntryId);
  });

  it("kas TERIMA counter 1200 tanpa kontak ditolak; dengan kontak lolos + link", async () => {
    const { orgId, byCode, customer } = await setupStock("kas-piutang");
    await expect(withOrg(orgId, (tx) =>
      createCashEntryRepo(tx, orgId, "t@t.id", {
        kind: "TERIMA", entryDate: `${year}-09-07`, cashAccountId: byCode("1110"),
        counterAccountId: byCode("1200"), amountMinor: 100_000n, memo: "tanpa kontak",
      }, { post: true }),
    )).rejects.toThrow("KONTAK_WAJIB");
    const ok = await withOrg(orgId, (tx) =>
      createCashEntryRepo(tx, orgId, "t@t.id", {
        kind: "TERIMA", entryDate: `${year}-09-07`, cashAccountId: byCode("1110"),
        counterAccountId: byCode("1200"), contactId: customer.id, amountMinor: 100_000n, memo: "dengan kontak",
      }, { post: true }),
    );
    const links = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, ok.journalEntryId));
    const ar = links.filter((l) => l.kind === "PIUTANG");
    expect(ar.length).toBe(1);
    expect(ar[0].refId).toBe(customer.id);
    expect(ar[0].amountMinor).toBe(100_000n);
  });

  it("kas BAYAR counter persediaan diblokir", async () => {
    const { orgId, byCode } = await setupStock("kas-persediaan");
    await expect(withOrg(orgId, (tx) =>
      createCashEntryRepo(tx, orgId, "t@t.id", {
        kind: "BAYAR", entryDate: `${year}-09-07`, cashAccountId: byCode("1110"),
        counterAccountId: byCode("1300"), amountMinor: 50_000n, memo: "langsung persediaan",
      }, { post: true }),
    )).rejects.toThrow("AKUN_KONTROL_WAJIB_VIA_MODUL");
  });
});
