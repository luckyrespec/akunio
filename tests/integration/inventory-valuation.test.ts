import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { contacts } from "@/server/db/schema/invoicing";
import {
  createInventoryItem,
  createStockOpname,
  generateAdjustmentJournalDraft,
  getInventoryItem,
  postOpnameAdjustment,
  upsertInventorySettings,
} from "@/server/db/repos/inventory.repo";
import { createInvoiceRepo } from "@/server/db/repos/invoices.repo";
import { postInvoiceToLedger } from "@/server/invoicing/posting";
import { toMinor } from "@/server/db/repos/journals.repo";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("inventory valuation FIFO opname", () => {
  let orgId: string;
  let itemId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  async function accountId(code: string): Promise<string> {
    const r = await admin.query<{ id: string }>(
      `SELECT id FROM accounts WHERE org_id=$1 AND code=$2`,
      [orgId, code],
    );
    if (r.rows.length === 0) throw new Error(`COA ${code} tidak ditemukan`);
    return r.rows[0].id;
  }

  async function remainingLayers(id: string) {
    const r = await admin.query<{ remaining_qty: string; unit_cost_minor: string }>(
      `SELECT remaining_qty, unit_cost_minor FROM inventory_layers WHERE item_id=$1 ORDER BY date ASC, created_at ASC`,
      [id],
    );
    return r.rows.map((x) => ({
      remainingQty: Number(x.remaining_qty),
      unitCostMinor: BigInt(x.unit_cost_minor),
    }));
  }

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT FIFO Opname")).orgId;
    await seedOrgData(orgId);

    const invAcc = await accountId("1300");
    const lossAcc = await accountId("5900");
    const gainAcc = await accountId("4200");
    await db.transaction(async (tx) => {
      await upsertInventorySettings(tx as never, orgId, {
        valuationMethod: "FIFO",
        adjustmentLossAccountId: lossAcc,
        adjustmentGainAccountId: gainAcc,
      });
      const { seedSubledgerControls } = await import("@/server/db/repos/subledger.repo");
      await seedSubledgerControls(tx as never, orgId, {
        receivableAccountId: await accountId("1200"),
        payableAccountId: await accountId("2100"),
        inventoryAccountId: invAcc,
      });
    });

    const item = await db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, {
        code: "FIFO-001",
        name: "Barang FIFO",
        unit: "Pcs",
      }),
    );
    itemId = item.id;

    const [vendor] = await db
      .insert(contacts)
      .values({ orgId, type: "VENDOR", name: "PT Pemasok" })
      .returning();

    // Layer1: beli 10 @1000, lalu layer2: beli 10 @3000 (average 2000).
    const bill1 = await createInvoiceRepo(
      db, orgId,
      { type: "BILL", contactId: vendor.id, issueDate: `${year}-06-05`, dueDate: `${year}-07-05` },
      [{ description: "Beli layer1", quantity: 10, unitPriceMinor: 1000n, catalogItemId: itemId }],
    );
    await postInvoiceToLedger(db, orgId, bill1.id, "test@test.id");
    const bill2 = await createInvoiceRepo(
      db, orgId,
      { type: "BILL", contactId: vendor.id, issueDate: `${year}-06-10`, dueDate: `${year}-07-10` },
      [{ description: "Beli layer2", quantity: 10, unitPriceMinor: 3000n, catalogItemId: itemId }],
    );
    await postInvoiceToLedger(db, orgId, bill2.id, "test@test.id");
  });

  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("opname FIFO defisit ikuti layer tertua", async () => {
    // Beli 10x1000 (layer1) lalu 10x3000 (layer2, average 2000); opname fisik 15.
    const before = await db.transaction((tx) =>
      getInventoryItem(tx as never, orgId, itemId),
    );
    expect(Number(before!.currentQty)).toBe(20);
    expect(before!.averageCostMinor).toBe(2000n);
    expect(before!.totalCostMinor).toBe(40_000n);

    const opname = await db.transaction((tx) =>
      createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-06-15`,
        notes: "opname fifo",
        items: [{ itemId, physicalQty: 15 }],
      }),
    );
    // Defisit 5 harus @1000 = 5000, bukan @2000 = 10000.
    expect(opname.totalDifferenceValueMinor).toBe(-5_000n);

    const draft = await db.transaction((tx) =>
      generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    expect(draft.journalEntryId).toBeTruthy();
    const lines = await admin.query<{ debit: string; credit: string }>(
      `SELECT debit, credit FROM journal_lines WHERE entry_id=$1`,
      [draft.journalEntryId],
    );
    expect(lines.rows.length).toBe(2);
    const totalDebit = lines.rows.reduce((a, r) => a + toMinor(r.debit), 0n);
    const totalCredit = lines.rows.reduce((a, r) => a + toMinor(r.credit), 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(totalCredit).toBe(5_000n);

    const posted = await db.transaction((tx) =>
      postOpnameAdjustment(tx as never, orgId, opname.id, "tester@test.id"),
    );
    expect(posted.opname.status).toBe("COMPLETED");

    const after = await db.transaction((tx) =>
      getInventoryItem(tx as never, orgId, itemId),
    );
    expect(Number(after!.currentQty)).toBe(15);
    expect(after!.totalCostMinor).toBe(35_000n);

    const layers = await remainingLayers(itemId);
    expect(layers).toHaveLength(2);
    expect(layers[0].unitCostMinor).toBe(1000n);
    expect(layers[0].remainingQty).toBe(5); // layer1 sisa 5
    expect(layers[1].remainingQty).toBe(10);
  });

  it("pembelian antara create-post abort opname basi", async () => {
    // Snapshot avg 2000; beli 10 @5000 lalu jual 10 → qty kembali 20
    // (lolos guard qty) tapi avg berubah → wajib abort STOK_BERUBAH.
    // Jual-balik via applyCatalogStockOut agar qty pas snapshot tanpa
    // mengubah avg (jalur terkecil deterministik, tanpa jurnal jual).
    const item = await db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, {
        code: "STALE-001",
        name: "Barang Basi",
        unit: "Pcs",
        initialQty: 20,
        initialCostMinor: 2000n,
      }),
    );
    const before = await db.transaction((tx) =>
      getInventoryItem(tx as never, orgId, item.id),
    );
    expect(before!.averageCostMinor).toBe(2000n);

    const opname = await db.transaction((tx) =>
      createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-06-20`,
        notes: "opname stale-cost",
        items: [{ itemId: item.id, physicalQty: 18 }],
      }),
    );
    await db.transaction((tx) =>
      generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );

    const [vendor] = await db
      .insert(contacts)
      .values({ orgId, type: "VENDOR", name: "PT Pemasok Basi" })
      .returning();
    const bill = await createInvoiceRepo(
      db, orgId,
      { type: "BILL", contactId: vendor.id, issueDate: `${year}-06-21`, dueDate: `${year}-07-21` },
      [{ description: "Beli susulan", quantity: 10, unitPriceMinor: 5000n, catalogItemId: item.id }],
    );
    await postInvoiceToLedger(db, orgId, bill.id, "test@test.id");

    const mid = await db.transaction((tx) =>
      getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(mid!.currentQty)).toBe(30);
    expect(mid!.averageCostMinor).toBe(3000n);

    const { applyCatalogStockOut } = await import("@/server/invoicing/posting");
    await db.transaction((tx) =>
      applyCatalogStockOut(
        tx as never, orgId, mid!, 10, "FIFO", `${year}-06-22`,
        { type: "INVOICE", id: crypto.randomUUID() },
        "Jual penyeimbang uji stale-cost",
      ),
    );
    const restored = await db.transaction((tx) =>
      getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(restored!.currentQty)).toBe(20);

    await expect(
      db.transaction((tx) =>
        postOpnameAdjustment(tx as never, orgId, opname.id, "tester@test.id"),
      ),
    ).rejects.toThrow("STOK_BERUBAH");
  });
});
