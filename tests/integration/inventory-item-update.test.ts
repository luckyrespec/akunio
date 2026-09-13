import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  createInventoryItem,
  listItemCostHistory,
  updateInventoryItem,
} from "@/server/db/repos/inventory.repo";
import { inventoryItems } from "@/server/db/schema/inventory";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("inventory update barang + riwayat harga", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Edit")).orgId;
  });

  afterAll(async () => {
    await truncateAll().catch(() => {});
  });

  async function getItem(id: string) {
    const [row] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);
    return row;
  }

  it("mengubah field aman dan mengunci kode/stok/modal", async () => {
    const item = await db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, {
        code: "EDT-001",
        name: "Nama Lama",
        unit: "Pcs",
        initialQty: 4,
        initialCostMinor: 200_000n,
      }),
    );

    await db.transaction((tx) =>
      updateInventoryItem(tx as never, orgId, item.id, {
        name: "Nama Baru",
        category: "Sembako",
        unit: "Dus",
        minStockAlert: "3",
        standardSellingPriceMinor: 350_000n,
        barcode: "8991234567890",
      }),
    );

    const row = await getItem(item.id);
    expect(row.name).toBe("Nama Baru");
    expect(row.category).toBe("Sembako");
    expect(row.unit).toBe("Dus");
    expect(Number(row.minStockAlert)).toBe(3);    expect(row.standardSellingPriceMinor).toBe(350_000n);
    expect(row.barcode).toBe("8991234567890");
    // Terkunci: tidak berubah
    expect(row.code).toBe("EDT-001");
    expect(Number(row.currentQty)).toBe(4);
    expect(row.averageCostMinor).toBe(200_000n);
  });

  it("menolak input tidak valid dan id tak dikenal", async () => {
    const item = await db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, {
        code: "EDT-002",
        name: "Valid",
        unit: "Pcs",
      }),
    );
    const run = (input: Parameters<typeof updateInventoryItem>[3]) =>
      db.transaction((tx) => updateInventoryItem(tx as never, orgId, item.id, input));

    await expect(run({ name: "x" })).rejects.toThrow("NAMA_BARANG_MINIMAL_2_HURUF");
    await expect(run({ name: "Ok", minStockAlert: "abc" })).rejects.toThrow("MIN_STOK_TIDAK_VALID");
    await expect(
      run({ name: "Ok", standardSellingPriceMinor: -1n }),
    ).rejects.toThrow("HARGA_JUAL_TIDAK_VALID");
    await expect(
      db.transaction((tx) =>
        updateInventoryItem(tx as never, orgId, "00000000-0000-0000-0000-000000000000", {
          name: "Hantu",
        }),
      ),
    ).rejects.toThrow("BARANG_TIDAK_DITEMUKAN");
  });

  it("riwayat harga mencatat lapis masuk kronologis", async () => {
    const item = await db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, {
        code: "EDT-003",
        name: "Barang Riwayat",
        unit: "Pcs",
        initialQty: 10,
        initialCostMinor: 500_000n,
      }),
    );
    const history = await listItemCostHistory(db, orgId, item.id);
    expect(history).toHaveLength(1);
    expect(history[0].referenceType).toBe("OPENING_BALANCE");
    expect(history[0].unitCostMinor).toBe(500_000n);
    expect(Number(history[0].initialQty)).toBe(10);

    const empty = await db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, { code: "EDT-004", name: "Tanpa Stok", unit: "Pcs" }),
    );
    expect(await listItemCostHistory(db, orgId, empty.id)).toEqual([]);
  });
});
