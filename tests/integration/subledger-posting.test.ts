import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { createInvoiceRepo, recordInvoicePaymentRepo } from "@/server/db/repos/invoices.repo";
import { createInventoryItem, upsertInventorySettings } from "@/server/db/repos/inventory.repo";
import { seedSubledgerControls, listLinksForEntry } from "@/server/db/repos/subledger.repo";
import { postInvoiceToLedger, voidInvoiceWithReversal, postInvoicePaymentToLedger } from "@/server/invoicing/posting";

async function setupPosting(name: string) {
  const { orgId } = await makeOrg(name);
  await seedOrgData(orgId);
  await db.insert(accounts).values([
    { orgId, code: "4110", name: "Penjualan Barang", type: "PENDAPATAN", normal: "K", parentCode: "4100", isCash: false, isBank: false, contra: false },
    { orgId, code: "4130", name: "Pendapatan Jasa", type: "PENDAPATAN", normal: "K", parentCode: "4100", isCash: false, isBank: false, contra: false },
  ]);
  const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byCode = (c: string) => accRows.find((a) => a.code === c)!;
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
  const itemA = await withOrg(orgId, (tx) =>
    createInventoryItem(tx, orgId, {
      name: "Kopi A", initialQty: 10, initialCostMinor: 20_000n,
      standardSellingPriceMinor: 35_000n, revenueAccountId: byCode("4110").id,
    }),
  );
  const itemB = await withOrg(orgId, (tx) =>
    createInventoryItem(tx, orgId, {
      name: "Kopi B", initialQty: 10, initialCostMinor: 30_000n,
      standardSellingPriceMinor: 50_000n, revenueAccountId: byCode("4110").id,
    }),
  );
  const customer = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
  const supplier = await createContactRepo(db, orgId, { name: "Supplier", type: "VENDOR" });
  return { orgId, byCode, itemA, itemB, customer, supplier };
}

describe("subledger posting faktur", () => {
  beforeEach(async () => { await truncateAll(); });

  it("jual 2 SKU: link PIUTANG 1 + PERSEDIAAN 2 sejumlah HPP", async () => {
    const { orgId, itemA, itemB, customer } = await setupPosting("jual-links");
    const inv = await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: customer.id, issueDate: "2026-09-07", dueDate: "2026-09-21" },
      [
        { description: "Kopi A", quantity: 2, unitPriceMinor: 35_000n, catalogItemId: itemA.id },
        { description: "Kopi B", quantity: 1, unitPriceMinor: 50_000n, catalogItemId: itemB.id },
      ]);
    const entryId = await postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
    const links = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, entryId));
    const ar = links.filter((l) => l.kind === "PIUTANG");
    expect(ar.length).toBe(1);
    expect(ar[0].refId).toBe(customer.id);
    expect(ar[0].amountMinor).toBe(120_000n);
    const pers = links.filter((l) => l.kind === "PERSEDIAAN");
    expect(pers.length).toBe(2);
    expect(pers.find((l) => l.refId === itemA.id)?.amountMinor).toBe(40_000n);
    expect(pers.find((l) => l.refId === itemB.id)?.amountMinor).toBe(30_000n);
  });

  it("beli: link UTANG + PERSEDIAAN", async () => {
    const { orgId, itemA, supplier } = await setupPosting("beli-links");
    const bill = await createInvoiceRepo(db, orgId,
      { type: "BILL", contactId: supplier.id, issueDate: "2026-09-07", dueDate: "2026-09-21" },
      [{ description: "Kopi A", quantity: 5, unitPriceMinor: 21_000n, catalogItemId: itemA.id }]);
    const entryId = await postInvoiceToLedger(db, orgId, bill.id, "t@t.id");
    const links = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, entryId));
    const ap = links.filter((l) => l.kind === "UTANG");
    expect(ap.length).toBe(1);
    expect(ap[0].refId).toBe(supplier.id);
    expect(ap[0].amountMinor).toBe(105_000n);
    const pers = links.filter((l) => l.kind === "PERSEDIAAN");
    expect(pers.length).toBe(1);
    expect(pers[0].refId).toBe(itemA.id);
    expect(pers[0].amountMinor).toBe(105_000n);
  });

  it("bayar penuh: link PIUTANG pada jurnal pelunasan", async () => {
    const { orgId, byCode, itemA, customer } = await setupPosting("bayar-links");
    const inv = await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: customer.id, issueDate: "2026-09-07", dueDate: "2026-09-21" },
      [{ description: "Kopi A", quantity: 2, unitPriceMinor: 35_000n, catalogItemId: itemA.id }]);
    await postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
    const { payment } = await recordInvoicePaymentRepo(db, orgId, {
      invoiceId: inv.id, paymentDate: "2026-09-08", amountMinor: 70_000n, paymentAccountId: byCode("1110").id,
    });
    const payEntryId = await postInvoicePaymentToLedger(db, orgId, payment.id, "t@t.id");
    const links = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, payEntryId));
    const ar = links.filter((l) => l.kind === "PIUTANG");
    expect(ar.length).toBe(1);
    expect(ar[0].refId).toBe(customer.id);
    expect(ar[0].amountMinor).toBe(70_000n);
  });

  it("void: jurnal pembalik membawa mirror links", async () => {
    const { orgId, itemA, customer } = await setupPosting("void-links");
    const inv = await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: customer.id, issueDate: "2026-09-07", dueDate: "2026-09-21" },
      [{ description: "Kopi A", quantity: 1, unitPriceMinor: 35_000n, catalogItemId: itemA.id }]);
    const entryId = await postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
    const reversalId = await voidInvoiceWithReversal(db, orgId, inv.id, "t@t.id");
    expect(reversalId).toBeTruthy();
    const orig = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, entryId));
    const rev = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, reversalId!));
    const origLinked = orig.filter((l) => l.linkId !== null);
    const revLinked = rev.filter((l) => l.linkId !== null);
    expect(revLinked.length).toBe(origLinked.length);
    expect(revLinked.length).toBeGreaterThan(0);
    for (const o of origLinked) {
      expect(revLinked.some((r) => r.kind === o.kind && r.refId === o.refId && r.amountMinor === o.amountMinor)).toBe(true);
    }
  });
});
