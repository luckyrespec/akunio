import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { createInventoryItem, listItemTransactions } from "@/server/db/repos/inventory.repo";
import { createInvoiceRepo, getInvoiceByIdRepo } from "@/server/db/repos/invoices.repo";
import { createContactRepo } from "@/server/db/repos/contacts.repo";

describe("katalog jasa", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("SKU jasa prefix JSA- dan tanpa layer/transaksi", async () => {
    const { orgId } = await makeOrg("salon");
    const item = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, {
        itemType: "JASA",
        name: "Cuci Rambut",
        standardSellingPriceMinor: 50000n,
      }),
    );
    expect(item.code.startsWith("JSA-")).toBe(true);
    expect(item.itemType).toBe("JASA");
    const txs = await withOrg(orgId, (tx) => listItemTransactions(tx, orgId, item.id));
    expect(txs.length).toBe(0);
  });

  it("JASA tolak initialQty > 0", async () => {
    const { orgId } = await makeOrg("salon2");
    await expect(
      withOrg(orgId, (tx) =>
        createInventoryItem(tx, orgId, { itemType: "JASA", name: "Creambath", initialQty: 5 }),
      ),
    ).rejects.toThrow("JASA_TANPA_STOK");
  });
});

describe("faktur catalog link", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("invoice_items menyimpan catalogItemId (snapshot tetap ada)", async () => {
    const { orgId } = await makeOrg("campur");
    const barang = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, {
        name: "Shampo",
        initialQty: 10,
        initialCostMinor: 20000n,
        standardSellingPriceMinor: 35000n,
      }),
    );
    const contact = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
    const inv = await createInvoiceRepo(
      db,
      orgId,
      { type: "INVOICE", contactId: contact.id, issueDate: "2026-09-06", dueDate: "2026-09-20" },
      [
        { description: "Shampo", quantity: 2, unitPriceMinor: 35000n, catalogItemId: barang.id },
        { description: "Cuci Rambut", quantity: 1, unitPriceMinor: 50000n },
      ],
    );
    const full = await getInvoiceByIdRepo(db, orgId, inv.id);
    expect(full!.items.find((i) => i.description === "Shampo")!.catalogItemId).toBe(barang.id);
    expect(full!.items.find((i) => i.description === "Cuci Rambut")!.catalogItemId).toBeNull();
  });
});
