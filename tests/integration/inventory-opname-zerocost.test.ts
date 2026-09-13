import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("opname: jalur harga modal Rp0", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  async function cleanupInventory() {
    await admin.query(
      `TRUNCATE inventory_transactions, inventory_layers, stock_opname_items, stock_opnames, inventory_items, inventory_settings CASCADE`,
    );
  }

  beforeAll(async () => {
    await truncateAll();
    await cleanupInventory().catch(() => {});
    orgId = (await makeOrg("PT Opname Nol")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
  });

  afterAll(async () => {
    await cleanupInventory().catch(() => {});
    await truncateAll().catch(() => {});
    await admin.end();
  });

  async function accountId(code: string): Promise<string> {
    const r = await admin.query<{ id: string }>(
      `SELECT id FROM accounts WHERE org_id=$1 AND code=$2`,
      [orgId, code],
    );
    if (r.rows.length === 0) throw new Error(`COA ${code} tidak ditemukan`);
    return r.rows[0].id;
  }

  async function setupInventorySettings() {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");
    const invAcc = await accountId("1300");
    const lossAcc = await accountId("5900");
    const gainAcc = await accountId("4200");
    await db.transaction(async (tx) => {
      await inv.upsertInventorySettings(tx as never, orgId, {
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
  }

  it("selisih qty tanpa nilai: stok tetap diterapkan, selesai tanpa jurnal", async () => {
    await setupInventorySettings();
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "ZER-001",
        name: "Tanpa Modal",
        unit: "Pcs",
        initialQty: 0,
        initialCostMinor: 0n,
      }),
    );

    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-07-01`,
        items: [{ itemId: item.id, physicalQty: 30 }],
      }),
    );
    expect(opname.totalDifferenceValueMinor).toBe(0n);

    const res = await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    expect(res.journalEntryId).toBeNull();

    // Stok fisik diterapkan walau tanpa jurnal.
    const after = await db.transaction((tx) =>
      inv.getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(after!.currentQty)).toBe(30);

    const txRows = await admin.query<{ n: string; type: string }>(
      `SELECT count(*)::text AS n, min(type) AS type FROM inventory_transactions WHERE item_id=$1 AND source_type='OPNAME'`,
      [item.id],
    );
    expect(Number(txRows.rows[0].n)).toBe(1);
    expect(txRows.rows[0].type).toBe("ADJUSTMENT");

    const op = await db.transaction((tx) =>
      inv.getStockOpnameWithItems(tx as never, orgId, opname.id),
    );
    expect(op!.status).toBe("COMPLETED");
    expect(op!.notes).toContain("Tanpa jurnal");

    const jeCount = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM journal_entries WHERE org_id=$1 AND source='STOCK_OPNAME'`,
      [orgId],
    );
    expect(Number(jeCount.rows[0].n)).toBe(0);
  });

  it("isi harga modal (migrasi) → jurnal bernilai + posting menetapkan modal awal", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "ZER-002",
        name: "Migrasi Gudang",
        unit: "Pcs",
        initialQty: 0,
        initialCostMinor: 0n,
      }),
    );
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-07-02`,
        items: [{ itemId: item.id, physicalQty: 30 }],
      }),
    );

    // Rp5.000 per unit → selisih 30 × 5.000 = Rp150.000
    const cost = await db.transaction((tx) =>
      inv.updateOpnameItemCost(tx as never, orgId, opname.id, item.id, 5_000_00n),
    );
    expect(cost.totalDifferenceValueMinor).toBe(150_000_00n);

    const draft = await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    expect(draft.journalEntryId).toBeTruthy();

    await db.transaction((tx) =>
      inv.postOpnameAdjustment(tx as never, orgId, opname.id, "tester@test.id"),
    );

    const after = await db.transaction((tx) =>
      inv.getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(after!.currentQty)).toBe(30);
    expect(after!.averageCostMinor).toBe(5_000_00n);
    expect(after!.totalCostMinor).toBe(150_000_00n);
  });

  it("menolak isi harga modal bila barang sudah punya cost / opname sudah lanjut", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "ZER-003",
        name: "Sudah Ada Modal",
        unit: "Pcs",
        initialQty: 5,
        initialCostMinor: 10_000_00n,
      }),
    );
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-07-03`,
        items: [{ itemId: item.id, physicalQty: 6 }],
      }),
    );
    await expect(
      db.transaction((tx) =>
        inv.updateOpnameItemCost(tx as never, orgId, opname.id, item.id, 12_000_00n),
      ),
    ).rejects.toThrow("HARGA_MODAL_SUDAH_TERISI");

    // Setelah draf terbit, harga modal tidak bisa diubah lagi.
    const item2 = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "ZER-004",
        name: "Belum Modal",
        unit: "Pcs",
        initialQty: 0,
        initialCostMinor: 0n,
      }),
    );
    const opname2 = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-07-04`,
        items: [{ itemId: item2.id, physicalQty: 2 }],
      }),
    );
    await db.transaction((tx) =>
      inv.updateOpnameItemCost(tx as never, orgId, opname2.id, item2.id, 3_000_00n),
    );
    await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname2.id),
    );
    await expect(
      db.transaction((tx) =>
        inv.updateOpnameItemCost(tx as never, orgId, opname2.id, item2.id, 4_000_00n),
      ),
    ).rejects.toThrow("OPNAME_TIDAK_BISA_DIEDIT");
  });

  it("memo jurnal hanya bisa diubah selagi draf", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const rows = await admin.query<{ id: string }>(
      `SELECT id FROM stock_opnames WHERE org_id=$1 AND status='REVIEW_DRAFT_JOURNAL' LIMIT 1`,
      [orgId],
    );
    const opnameId = rows.rows[0].id;

    await db.transaction((tx) =>
      inv.updateOpnameJournalMemo(tx as never, orgId, opnameId, "Hasil hitung ulang gudang A"),
    );
    const entry = await db.transaction((tx) =>
      inv.getStockOpnameWithItems(tx as never, orgId, opnameId),
    );
    const je = await admin.query<{ memo: string }>(
      `SELECT memo FROM journal_entries WHERE id=$1`,
      [entry!.journalEntryId],
    );
    expect(je.rows[0].memo).toBe("Hasil hitung ulang gudang A");

    await db.transaction((tx) =>
      inv.postOpnameAdjustment(tx as never, orgId, opnameId, "tester@test.id"),
    );
    await expect(
      db.transaction((tx) =>
        inv.updateOpnameJournalMemo(tx as never, orgId, opnameId, "diubah setelah posting"),
      ),
    ).rejects.toThrow("JURNAL_SUDAH_DIPOSTING");
  });

  it("opname Rp0 di periode CLOSED ditolak", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");
    const periods = await import("@/server/db/repos/periods.repo");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "ZER-CLOSED",
        name: "Stok Nol Periode Tutup",
        unit: "Pcs",
        initialQty: 0,
        initialCostMinor: 0n,
      }),
    );
    // Bulan Agustus belum dipakai test lain di file ini.
    const opnameDate = `${year}-08-10`;
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate,
        items: [{ itemId: item.id, physicalQty: 5 }],
      }),
    );
    expect(opname.totalDifferenceValueMinor).toBe(0n);

    // Kunci periode cara terkecil: set status CLOSED langsung (bukan
    // closePeriod FULL yang menutup tahun + menulis jurnal).
    const period = await db.transaction((tx) =>
      periods.findPeriodByDate(tx as never, orgId, opnameDate),
    );
    await db.transaction((tx) =>
      periods.setPeriodStatus(tx as never, orgId, period!.id, "CLOSED"),
    );

    await expect(
      db.transaction((tx) =>
        inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
      ),
    ).rejects.toThrow("PERIODE_TUTUP");

    await db.transaction((tx) =>
      periods.setPeriodStatus(tx as never, orgId, period!.id, "OPEN"),
    );
  });

  it("opname cocok-sempurna di periode OPEN tidak mengunci kebijakan", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    // Test sebelumnya sudah mengunci policy; reset dulu agar assert
    // "tetap unlocked" bermakna (UPDATE langsung, bukan via upsert).
    await admin.query(`UPDATE inventory_settings SET is_locked=false WHERE org_id=$1`, [orgId]);
    const before = await db.transaction((tx) =>
      inv.getInventorySettings(tx as never, orgId),
    );
    expect(before!.isLocked).toBe(false);

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "ZER-NOOP",
        name: "Cocok Sempurna",
        unit: "Pcs",
        initialQty: 7,
        initialCostMinor: 10_000_00n,
      }),
    );
    // Bulan September belum dipakai test lain di file ini.
    const opnameDate = `${year}-09-10`;
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate,
        items: [{ itemId: item.id, physicalQty: 7 }],
      }),
    );
    expect(opname.totalDifferenceValueMinor).toBe(0n);

    const res = await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    expect(res.journalEntryId).toBeNull();

    const op = await db.transaction((tx) =>
      inv.getStockOpnameWithItems(tx as never, orgId, opname.id),
    );
    expect(op!.status).toBe("COMPLETED");

    const after = await db.transaction((tx) =>
      inv.getInventorySettings(tx as never, orgId),
    );
    expect(after!.isLocked).toBe(false);
  });
});
