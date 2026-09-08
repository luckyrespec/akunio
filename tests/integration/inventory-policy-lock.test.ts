import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { createInvoiceRepo } from "@/server/db/repos/invoices.repo";
import {
  createInventoryItem, upsertInventorySettings, getInventorySettings,
} from "@/server/db/repos/inventory.repo";
import { seedSubledgerControls } from "@/server/db/repos/subledger.repo";
import { postInvoiceToLedger } from "@/server/invoicing/posting";
import { closePeriod } from "@/server/db/repos/periods-closing.repo";

const year = new Date().getFullYear();

async function setupPolicy(name: string) {
  const { orgId } = await makeOrg(name);
  await seedOrgData(orgId);
  const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byCode = (c: string) => rows.find((a) => a.code === c)!;
  await withOrg(orgId, (tx) =>
    upsertInventorySettings(tx, orgId, {
      valuationMethod: "WEIGHTED_AVERAGE",
      recordingMethod: "PERPETUAL",
      cogsAccountId: byCode("5100").id,
    }),
  );
  await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
    receivableAccountId: byCode("1200").id,
    payableAccountId: byCode("2100").id,
    inventoryAccountId: byCode("1300").id,
  }));
  const barang = await withOrg(orgId, (tx) =>
    createInventoryItem(tx, orgId, {
      name: "Kopi", initialQty: 10, initialCostMinor: 20_000n, standardSellingPriceMinor: 35_000n,
    }),
  );
  const jasa = await withOrg(orgId, (tx) =>
    createInventoryItem(tx, orgId, { itemType: "JASA", name: "Seduh", standardSellingPriceMinor: 10_000n }),
  );
  const customer = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
  return { orgId, byCode, barang, jasa, customer };
}

async function postJasa(orgId: string, catalogItemId: string, contactId: string) {
  const inv = await createInvoiceRepo(db, orgId,
    { type: "INVOICE", contactId, issueDate: `${year}-09-07`, dueDate: `${year}-09-21` },
    [{ description: "Seduh", quantity: 1, unitPriceMinor: 10_000n, catalogItemId }]);
  return postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
}

describe("kunci kebijakan metode per tahun", () => {
  beforeEach(async () => { await truncateAll(); });

  it("faktur jasa tidak mengunci; faktur barang mengunci", async () => {
    const { orgId, barang, jasa, customer } = await setupPolicy("kunci");
    await postJasa(orgId, jasa.id, customer.id);
    let s = await withOrg(orgId, (tx) => getInventorySettings(tx, orgId));
    expect(s?.isLocked).toBe(false);

    const inv = await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: customer.id, issueDate: `${year}-09-08`, dueDate: `${year}-09-22` },
      [{ description: "Kopi", quantity: 1, unitPriceMinor: 35_000n, catalogItemId: barang.id }]);
    await postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
    s = await withOrg(orgId, (tx) => getInventorySettings(tx, orgId));
    expect(s?.isLocked).toBe(true);

    await expect(
      withOrg(orgId, (tx) => upsertInventorySettings(tx, orgId, { valuationMethod: "FIFO" })),
    ).rejects.toThrow("KEBIJAKAN_TERKUNCI");
  });

  it("tutup tahun membuka kunci lagi", async () => {
    const { orgId, barang, customer } = await setupPolicy("buka");
    const inv = await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: customer.id, issueDate: `${year}-09-08`, dueDate: `${year}-09-22` },
      [{ description: "Kopi", quantity: 1, unitPriceMinor: 35_000n, catalogItemId: barang.id }]);
    await postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
    let s = await withOrg(orgId, (tx) => getInventorySettings(tx, orgId));
    expect(s?.isLocked).toBe(true);

    const res = await withOrg(orgId, (tx) =>
      closePeriod(tx, { orgId, periodName: `${year}-12`, actorEmail: "t@t.id" }));
    expect(res.period.status).toBe("CLOSED");
    s = await withOrg(orgId, (tx) => getInventorySettings(tx, orgId));
    expect(s?.isLocked).toBe(false);
  });

  it("tutup bulan biasa tidak membuka kunci", async () => {
    const { orgId, barang, customer } = await setupPolicy("bulan");
    const inv = await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: customer.id, issueDate: `${year}-09-08`, dueDate: `${year}-09-22` },
      [{ description: "Kopi", quantity: 1, unitPriceMinor: 35_000n, catalogItemId: barang.id }]);
    await postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
    await withOrg(orgId, (tx) =>
      closePeriod(tx, { orgId, periodName: `${year}-09`, actorEmail: "t@t.id", isYearEnd: false }));
    const s = await withOrg(orgId, (tx) => getInventorySettings(tx, orgId));
    expect(s?.isLocked).toBe(true);
  });
});
