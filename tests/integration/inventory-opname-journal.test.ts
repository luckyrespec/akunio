import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { stockOpnames } from "@/server/db/schema/inventory";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("inventory opname -> adjustment journal", () => {
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
    orgId = (await makeOrg("PT Opname")).orgId;
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

  it("membuat draf seimbang, memposting, dan memperbarui stok + COMPLETED + lock", async () => {
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
        code: "BRG-001",
        name: "Kertas HVS",
        unit: "Rim",
        initialQty: 10,
        initialCostMinor: 50_000_00n,
      }),
    );
    expect(Number(item.currentQty)).toBe(10);

    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-06-15`,
        notes: "test",
        items: [{ itemId: item.id, physicalQty: 8 }],
      }),
    );
    expect(opname.totalDifferenceValueMinor).toBe(-100_000_00n);

    const draft = await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    expect(draft.journalEntryId).toBeTruthy();

    // Draf harus seimbang Debit == Kredit
    const lines = await admin.query<{ debit: string; credit: string }>(
      `SELECT debit, credit FROM journal_lines WHERE entry_id=$1`,
      [draft.journalEntryId],
    );
    expect(lines.rows.length).toBe(2);
    const sum = (col: "debit" | "credit") =>
      lines.rows.reduce((a, r) => a + Number(r[col]), 0);
    expect(sum("debit")).toBeGreaterThan(0);
    expect(sum("debit")).toBe(sum("credit"));

    // Stok belum berubah saat draf (stock-neutral)
    const before = await db.transaction((tx) =>
      inv.getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(before!.currentQty)).toBe(10);

    const posted = await db.transaction((tx) =>
      inv.postOpnameAdjustment(tx as never, orgId, opname.id, "tester@test.id"),
    );
    expect(posted.journalEntryId).toBe(draft.journalEntryId);

    const after = await db.transaction((tx) =>
      inv.getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(after!.currentQty)).toBe(8);
    expect(after!.totalCostMinor).toBe(400_000_00n);

    const op = await db.transaction((tx) =>
      inv.getStockOpnameWithItems(tx as never, orgId, opname.id),
    );
    expect(op!.status).toBe("COMPLETED");

    const settings = await db.transaction((tx) =>
      inv.getInventorySettings(tx as never, orgId),
    );
    expect(settings!.isLocked).toBe(true);

    const je = await admin.query<{ status: string }>(
      `SELECT status FROM journal_entries WHERE id=$1`,
      [draft.journalEntryId],
    );
    expect(je.rows[0].status).toBe("POSTED");
  });

  it("menolak item tak dikenal dan menolak posting ganda", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    await expect(
      db.transaction((tx) =>
        inv.createStockOpname(tx as never, orgId, {
          opnameDate: `${year}-06-16`,
          items: [{ itemId: crypto.randomUUID(), physicalQty: 1 }],
        }),
      ),
    ).rejects.toThrow(/ITEM_TIDAK_DITEMUKAN/);

    // Posting ganda atas opname yang sudah COMPLETED harus ditolak
    const rows = await db
      .select({ id: stockOpnames.id })
      .from(stockOpnames)
      .where(eq(stockOpnames.orgId, orgId))
      .limit(1);
    await expect(
      db.transaction((tx) =>
        inv.postOpnameAdjustment(tx as never, orgId, rows[0].id, "tester@test.id"),
      ),
    ).rejects.toThrow(/SUDAH_SELESAI|SUDAH_DIPOSTING|BELUM_SIAP/);
  });

  it("surplus menambah stok dan memakai akun pendapatan", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "BRG-002",
        name: "Pulpen Gel",
        unit: "Pcs",
        initialQty: 5,
        initialCostMinor: 10_000_00n,
      }),
    );

    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-06-17`,
        items: [{ itemId: item.id, physicalQty: 7 }],
      }),
    );
    expect(opname.number).toMatch(/^OPN-/);
    expect(opname.totalDifferenceValueMinor).toBe(20_000_00n);

    const draft = await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    expect(draft.journalEntryId).toBeTruthy();

    const posted = await db.transaction((tx) =>
      inv.postOpnameAdjustment(tx as never, orgId, opname.id, "tester@test.id"),
    );
    const after = await db.transaction((tx) =>
      inv.getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(after!.currentQty)).toBe(7);
    expect(after!.totalCostMinor).toBe(70_000_00n);
    expect(posted.opname.status).toBe("COMPLETED");
  });

  it("nol selisih langsung selesai tanpa jurnal", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "BRG-003",
        name: "Penghapus",
        unit: "Pcs",
        initialQty: 3,
        initialCostMinor: 5_000_00n,
      }),
    );

    const zeroOpname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-06-18`,
        items: [{ itemId: item.id, physicalQty: 3 }],
      }),
    );

    const res = await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, zeroOpname.id),
    );
    expect(res.journalEntryId).toBeNull();
  });
});

// Catatan: asersi isolasi RLS stock_opnames PINDAH ke
// tests/integration/rls-isolation.test.ts (kasus 5, peran NOBYPASSRLS
// + kontrol positif dua org).
