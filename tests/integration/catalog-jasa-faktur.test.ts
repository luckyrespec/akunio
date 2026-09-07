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
    const { toMinor } = await import("@/server/db/repos/journals.repo");
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
        cogsAccountId: byCode("5100").id,
      }),
    );
    const { seedSubledgerControls } = await import("@/server/db/repos/subledger.repo");
    await withOrg(orgId, (tx) =>
      seedSubledgerControls(tx, orgId, {
        receivableAccountId: byCode("1200").id,
        payableAccountId: byCode("2100").id,
        inventoryAccountId: byCode("1300").id,
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
      lines.filter((l) => codeOf(l.accountId) === code).reduce((a, l) => a + toMinor(l[col] as string), 0n);
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

describe("posting beli + periodic + void", () => {  beforeEach(async () => {
    await truncateAll();
  });

  async function setupOrg(name: string, recording: "PERPETUAL" | "PERIODIC") {
    const { seedOrgData } = await import("@/server/bootstrap/seed-org");
    const { upsertInventorySettings } = await import("@/server/db/repos/inventory.repo");
    const { accounts } = await import("@/server/db/schema/org");
    const { eq } = await import("drizzle-orm");
    const { orgId } = await makeOrg(name);
    await seedOrgData(orgId);
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const byCode = (c: string) => accRows.find((a) => a.code === c)!;
    await withOrg(orgId, (tx) =>
      upsertInventorySettings(tx, orgId, {
        valuationMethod: "WEIGHTED_AVERAGE",
        recordingMethod: recording,
        cogsAccountId: byCode("5100").id,
      }),
    );
    const { seedSubledgerControls } = await import("@/server/db/repos/subledger.repo");
    await withOrg(orgId, (tx) =>
      seedSubledgerControls(tx, orgId, {
        receivableAccountId: byCode("1200").id,
        payableAccountId: byCode("2100").id,
        inventoryAccountId: byCode("1300").id,
      }),
    );
    const contact = await createContactRepo(db, orgId, { name: "Supplier", type: "VENDOR" });
    return { orgId, contact, byCode };
  }

  it("BILL perpetual: barang IN + average update + Dr Persediaan", async () => {
    const { postInvoiceToLedger } = await import("@/server/invoicing/posting");
    const { getInventoryItem } = await import("@/server/db/repos/inventory.repo");
    const { journalLines } = await import("@/server/db/schema/journal");
    const { inventoryLayers } = await import("@/server/db/schema/inventory");
    const { eq, and } = await import("drizzle-orm");

    const { orgId, contact } = await setupOrg("beli-masuk", "PERPETUAL");
    const barang = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, { name: "Kopi", initialQty: 5, initialCostMinor: 10000n }),
    );
    const inv = await createInvoiceRepo(
      db, orgId,
      { type: "BILL", contactId: contact.id, issueDate: "2026-09-06", dueDate: "2026-09-20" },
      [{ description: "Kopi", quantity: 10, unitPriceMinor: 12000n, catalogItemId: barang.id }],
    );
    await postInvoiceToLedger(db, orgId, inv.id, "owner@toko.id");

    const after = await withOrg(orgId, (tx) => getInventoryItem(tx, orgId, barang.id));
    expect(Number(after!.currentQty)).toBe(15);
    expect(after!.totalCostMinor).toBe(170000n);
    expect(after!.averageCostMinor).toBe(11333n);
    const layers = await withOrg(orgId, (tx) =>
      tx.select().from(inventoryLayers).where(and(eq(inventoryLayers.orgId, orgId), eq(inventoryLayers.itemId, barang.id))),
    );
    expect(layers.some((l) => l.referenceType === "PURCHASE")).toBe(true);

    const lines = await db.select().from(journalLines).where(eq(journalLines.entryId,
      (await getInvoiceByIdRepo(db, orgId, inv.id))!.journalEntryId!));
    const sums = new Map<string, bigint>();
    const accRows = await db.select().from((await import("@/server/db/schema/org")).accounts).where(eq((await import("@/server/db/schema/org")).accounts.orgId, orgId));
    for (const l of lines) {
      const code = accRows.find((a) => a.id === l.accountId)!.code;
      const { toMinor: toMin } = await import("@/server/db/repos/journals.repo");
      sums.set(`${code}:D`, (sums.get(`${code}:D`) ?? 0n) + toMin(l.debit as string));
      sums.set(`${code}:C`, (sums.get(`${code}:C`) ?? 0n) + toMin(l.credit as string));
    }
    expect(sums.get("1300:D")).toBe(120000n);
    expect(sums.get("2100:C")).toBe(120000n);
  });

  it("PERIODIC: jual maupun beli tanpa mutasi dan tanpa HPP", async () => {
    const { postInvoiceToLedger } = await import("@/server/invoicing/posting");
    const { getInventoryItem, listItemTransactions } = await import("@/server/db/repos/inventory.repo");
    const { journalLines } = await import("@/server/db/schema/journal");
    const { eq } = await import("drizzle-orm");

    const { orgId, contact } = await setupOrg("periodik", "PERIODIC");
    const barang = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, { name: "Teh", initialQty: 5, initialCostMinor: 8000n, standardSellingPriceMinor: 12000n }),
    );
    const jual = await createInvoiceRepo(
      db, orgId,
      { type: "INVOICE", contactId: contact.id, issueDate: "2026-09-06", dueDate: "2026-09-20" },
      [{ description: "Teh", quantity: 2, unitPriceMinor: 12000n, catalogItemId: barang.id }],
    );
    const entryJual = await postInvoiceToLedger(db, orgId, jual.id, "owner@toko.id");
    const afterJual = await withOrg(orgId, (tx) => getInventoryItem(tx, orgId, barang.id));
    expect(Number(afterJual!.currentQty)).toBe(5);
    const linesJual = await db.select().from(journalLines).where(eq(journalLines.entryId, entryJual));
    expect(linesJual.length).toBe(2); // Dr Piutang + Cr Pendapatan saja

    const beli = await createInvoiceRepo(
      db, orgId,
      { type: "BILL", contactId: contact.id, issueDate: "2026-09-06", dueDate: "2026-09-20" },
      [{ description: "Teh", quantity: 3, unitPriceMinor: 8000n, catalogItemId: barang.id }],
    );
    await postInvoiceToLedger(db, orgId, beli.id, "owner@toko.id");
    const afterBeli = await withOrg(orgId, (tx) => getInventoryItem(tx, orgId, barang.id));
    expect(Number(afterBeli!.currentQty)).toBe(5);
    const txs = await withOrg(orgId, (tx) => listItemTransactions(tx, orgId, barang.id));
    expect(txs.filter((t) => t.sourceType === "INVOICE").length).toBe(0);
  });

  it("VOID kembalikan stok + jurnal pembalik tertaut", async () => {
    const { postInvoiceToLedger, voidInvoiceWithReversal } = await import("@/server/invoicing/posting");
    const { getInventoryItem } = await import("@/server/db/repos/inventory.repo");
    const { journalEntries } = await import("@/server/db/schema/journal");
    const { invoices } = await import("@/server/db/schema/invoicing");
    const { eq } = await import("drizzle-orm");

    const { orgId, contact } = await setupOrg("void-kembali", "PERPETUAL");
    const barang = await withOrg(orgId, (tx) =>
      createInventoryItem(tx, orgId, { name: "Gula", initialQty: 10, initialCostMinor: 15000n, standardSellingPriceMinor: 20000n }),
    );
    const inv = await createInvoiceRepo(
      db, orgId,
      { type: "INVOICE", contactId: contact.id, issueDate: "2026-09-06", dueDate: "2026-09-20" },
      [{ description: "Gula", quantity: 2, unitPriceMinor: 20000n, catalogItemId: barang.id }],
    );
    const entryId = await postInvoiceToLedger(db, orgId, inv.id, "owner@toko.id");
    const reversalId = await voidInvoiceWithReversal(db, orgId, inv.id, "owner@toko.id");
    expect(reversalId).toBeTruthy();

    const after = await withOrg(orgId, (tx) => getInventoryItem(tx, orgId, barang.id));
    expect(Number(after!.currentQty)).toBe(10);
    const [rev] = await db.select().from(journalEntries).where(eq(journalEntries.id, reversalId!));
    expect(rev.reversalOfId).toBe(entryId);
    const [invRow] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(invRow.status).toBe("VOID");
    await expect(voidInvoiceWithReversal(db, orgId, inv.id, "owner@toko.id")).rejects.toThrow("FAKTUR_SUDAH_VOID");
  });
});

describe("actions jasa", () => {
  it("createServiceItemAction + suggestJsaSkuAction tersedia", async () => {
    const actions = await import("@/server/actions/inventory.actions");
    expect(typeof actions.createServiceItemAction).toBe("function");
    expect(typeof actions.suggestJsaSkuAction).toBe("function");
    expect(typeof actions.getServiceOverviewAction).toBe("function");
  });
});

describe("AI jasa", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("AI add_service_item tanpa foto sukses", async () => {
    const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
    const { orgId } = await makeOrg("ai-jasa");
    const res = (await inventoryHandlers["add_service_item"](orgId, "owner@x.id", {
      name: "Cuci Motor",
    })) as { success: boolean; data?: { message?: string }; error?: string };
    expect(res.success).toBe(true);
    expect(res.data?.message).toMatch(/Cuci Motor/);
  });

  it("AI add_service_item menolak foto", async () => {
    const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
    const { orgId } = await makeOrg("ai-jasa-foto");
    const res = (await inventoryHandlers["add_service_item"](orgId, "owner@x.id", {
      name: "Cuci Motor",
      imageDocumentId: "doc-123",
    })) as { success: boolean; error?: string };
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/JASA_TANPA_FOTO/);
  });
});
