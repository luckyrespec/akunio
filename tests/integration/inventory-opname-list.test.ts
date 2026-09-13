import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("opname: list, filter, stats, hapus", () => {
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
    orgId = (await makeOrg("PT Opname List")).orgId;
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

  it("pagination, search, status filter, dan stats agregat", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "LST-001",
        name: "Barang List",
        unit: "Pcs",
        initialQty: 5,
        initialCostMinor: 1_000_00n,
      }),
    );

    // Sesuai (COMPLETED via jalur Rp0? tidak — pakai 3 sesi: 2 draf + 1 dibatalkan)
    const op1 = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-09-01`,
        notes: "catatan gudang A",
        items: [{ itemId: item.id, physicalQty: 4 }],
      }),
    );
    const op2 = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-09-02`,
        notes: "catatan gudang B",
        items: [{ itemId: item.id, physicalQty: 4 }],
      }),
    );
    const op3 = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-09-03`,
        items: [{ itemId: item.id, physicalQty: 4 }],
      }),
    );
    await db.transaction((tx) => inv.cancelStockOpname(tx as never, orgId, op3.id));

    // Pagination: 2 baris per halaman.
    const page1 = await db.transaction((tx) =>
      inv.listStockOpnamesPaginated(tx as never, orgId, { limit: 2, offset: 0 }),
    );
    const page2 = await db.transaction((tx) =>
      inv.listStockOpnamesPaginated(tx as never, orgId, { limit: 2, offset: 2 }),
    );
    const total = await db.transaction((tx) => inv.countStockOpnames(tx as never, orgId));
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
    expect(total).toBe(3);

    // Search cocok nomor & catatan.
    const byNote = await db.transaction((tx) =>
      inv.listStockOpnamesPaginated(tx as never, orgId, {
        search: "gudang B",
        limit: 10,
        offset: 0,
      }),
    );
    expect(byNote.map((r) => r.id)).toEqual([op2.id]);
    const countByNote = await db.transaction((tx) =>
      inv.countStockOpnames(tx as never, orgId, { search: "gudang B" }),
    );
    expect(countByNote).toBe(1);
    const byNumber = await db.transaction((tx) =>
      inv.listStockOpnamesPaginated(tx as never, orgId, {
        search: op1.number.slice(-4),
        limit: 10,
        offset: 0,
      }),
    );
    expect(byNumber.some((r) => r.id === op1.id)).toBe(true);

    // Filter status.
    const cancelledOnly = await db.transaction((tx) =>
      inv.listStockOpnamesPaginated(tx as never, orgId, {
        status: "CANCELLED",
        limit: 10,
        offset: 0,
      }),
    );
    expect(cancelledOnly.map((r) => r.id)).toEqual([op3.id]);

    // Stats agregat: kalkulasi tanpa memuat semua baris.
    const stats = await db.transaction((tx) => inv.getStockOpnameStats(tx as never, orgId));
    expect(stats.total).toBe(3);
    expect(stats.draft).toBe(2);
    expect(stats.cancelled).toBe(1);
    // Dua draf defisit 1 unit @ Rp1.000; yang dibatalkan tidak dihitung.
    expect(stats.netDifferenceMinor).toBe(-200_000n);
  });

  it("hapus permanen hanya untuk sesi DIBATALKAN", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const rows = await admin.query<{ id: string; status: string }>(
      `SELECT id, status FROM stock_opnames WHERE org_id=$1 ORDER BY opname_date`,
      [orgId],
    );
    const draft = rows.rows.find((r) => r.status === "DRAFT")!;
    const cancelled = rows.rows.find((r) => r.status === "CANCELLED")!;

    // Draf ditolak.
    await expect(
      db.transaction((tx) => inv.deleteCancelledOpname(tx as never, orgId, draft.id)),
    ).rejects.toThrow("HANYA_OPNAME_DIBATALKAN");

    // Yang dibatalkan: terhapus, items ikut hilang (cascade).
    await db.transaction((tx) => inv.deleteCancelledOpname(tx as never, orgId, cancelled.id));
    const gone = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM stock_opnames WHERE id=$1`,
      [cancelled.id],
    );
    expect(Number(gone.rows[0].n)).toBe(0);
    const goneItems = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM stock_opname_items WHERE opname_id=$1`,
      [cancelled.id],
    );
    expect(Number(goneItems.rows[0].n)).toBe(0);
  });

  it("sesi COMPLETED tidak bisa dihapus", async () => {
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

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "LST-002",
        name: "Barang Selesai",
        unit: "Pcs",
        initialQty: 6,
        initialCostMinor: 1_500_00n,
      }),
    );
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-09-10`,
        items: [{ itemId: item.id, physicalQty: 5 }],
      }),
    );
    await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    await db.transaction((tx) =>
      inv.postOpnameAdjustment(tx as never, orgId, opname.id, "tester@test.id"),
    );

    await expect(
      db.transaction((tx) => inv.deleteCancelledOpname(tx as never, orgId, opname.id)),
    ).rejects.toThrow("HANYA_OPNAME_DIBATALKAN");
  });
});
