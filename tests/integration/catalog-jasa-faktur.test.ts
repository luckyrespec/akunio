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

describe("posting jual campur", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("INVOICE perpetual: jasa tanpa mutasi, barang OUT + jurnal pecah", async () => {
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    const { postInvoiceToLedger } = await import("@/server/invoicing/posting");
    const { upsertInventorySettings } = await import("@/server/db/repos/inventory.repo");
    const { accounts } = await import("@/server/db/schema/org");
    const { journalLines } = await import("@/server/db/schema/journal");
    const { eq } = await import("drizzle-orm");

    const { orgId } = await makeOrg("salon-campur");
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
        inventoryAccountId: byCode("1300").id,
        cogsAccountId: byCode("5100").id,
      }),
    );

    const barang = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, {
        name: "Shampo",
        initialQty: 10,
        initialCostMinor: 20000n,
        standardSellingPriceMinor: 35000n,
        revenueAccountId: byCode("4110").id,
      }),
    );
    const jasa = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, {
        itemType: "JASA",
        name: "Cuci Rambut",
        standardSellingPriceMinor: 50000n,
        revenueAccountId: byCode("4130").id,
      }),
    );

    const contact = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
    const inv = await createInvoiceRepo(
      db,
      orgId,
      { type: "INVOICE", contactId: contact.id, issueDate: "2026-09-06", dueDate: "2026-09-20" },
      [
        { description: "Shampo", quantity: 2, unitPriceMinor: 35000n, catalogItemId: barang.id },
        { description: "Cuci Rambut", quantity: 1, unitPriceMinor: 50000n, catalogItemId: jasa.id },
      ],
    );

    const entryId = await postInvoiceToLedger(db, orgId, inv.id, "owner@salon.id");
    expect(entryId).toBeTruthy();

    // Stok barang 10 -> 8, jasa tanpa transaksi
    const { getInventoryItem } = await import("@/server/db/repos/inventory.repo");
    const after = await withOrg(orgId, (tx) => getInventoryItem(tx, orgId, barang.id));
    expect(Number(after!.currentQty)).toBe(8);
    const outs = await withOrg(orgId, (tx) => listItemTransactions(tx, orgId, barang.id));
    const outInv = outs.filter((t) => t.type === "OUT" && t.sourceType === "INVOICE");
    expect(outInv.length).toBe(1);
    expect(outInv[0].sourceId).toBe(inv.id);
    const jasaTxs = await withOrg(orgId, (tx) => listItemTransactions(tx, orgId, jasa.id));
    expect(jasaTxs.length).toBe(0);

    // Jurnal pecah: Dr 1200 120000, Cr 4110 70000, Cr 4130 50000, Dr 5100 40000, Cr 1300 40000
    const lines = await db.select({ debit: journalLines.debit, credit: journalLines.credit, accountId: journalLines.accountId }).from(journalLines).where(eq(journalLines.entryId, entryId));
    const codeOf = (accountId: string) => accRows.find((a) => a.id === accountId)!.code;
    const sum = (code: string, col: "debit" | "credit") =>
      lines.filter((l) => codeOf(l.accountId) === code).reduce((a, l) => a + BigInt(l[col] as string), 0n);
    expect(sum("1200", "debit")).toBe(120000n);
    expect(sum("4110", "credit")).toBe(70000n);
    expect(sum("4130", "credit")).toBe(50000n);
    expect(sum("5100", "debit")).toBe(40000n);
    expect(sum("1300", "credit")).toBe(40000n);

    // Idempoten: posting ulang tidak mutasi lagi
    const entryId2 = await postInvoiceToLedger(db, orgId, inv.id, "owner@salon.id");
    expect(entryId2).toBe(entryId);
    const outs2 = await withOrg(orgId, (tx) => listItemTransactions(tx, orgId, barang.id));
    expect(outs2.filter((t) => t.type === "OUT" && t.sourceType === "INVOICE").length).toBe(1);
  });
});
