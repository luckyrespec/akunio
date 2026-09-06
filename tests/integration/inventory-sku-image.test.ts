import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("inventory sku + image", () => {
  let orgId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  async function cleanupInventory() {
    await admin.query(
      `TRUNCATE inventory_transactions, inventory_layers, stock_opname_items, stock_opnames, inventory_items, inventory_settings, inventory_sku_counters CASCADE`,
    );
  }

  beforeAll(async () => {
    await truncateAll();
    await cleanupInventory().catch(() => {});
    orgId = (await makeOrg("PT SKU")).orgId;
  });

  afterAll(async () => {
    await cleanupInventory().catch(() => {});
    await truncateAll().catch(() => {});
    await admin.end();
  });

  it("generator berurutan BRG-0001 dan barcode 20000001", async () => {
    const { db } = await import("@/server/db");
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { nextSkuCodes } = await import("@/server/db/repos/inventory-sku");
    const first = await withOrg(orgId, (tx) => nextSkuCodes(tx as never, orgId));
    const second = await withOrg(orgId, (tx) => nextSkuCodes(tx as never, orgId));
    expect(first).toEqual({ code: "BRG-0001", appBarcode: "20000001" });
    expect(second).toEqual({ code: "BRG-0002", appBarcode: "20000002" });
  });

  it("5 create konkuren menghasilkan kode unik", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const inv = await import("@/server/db/repos/inventory.repo");
    const orgB = (await makeOrg("PT SKU Race")).orgId;
    const codes = await Promise.all(
      [0, 1, 2, 3, 4].map((i) =>
        withOrg(orgB, (tx) =>
          inv.createInventoryItem(tx as never, orgB, { name: `Barang ${i}` }),
        ).then((it) => it.code),
      ),
    );
    expect(new Set(codes).size).toBe(5);
  });

  it("duplikat kode manual melempar error", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const inv = await import("@/server/db/repos/inventory.repo");
    await withOrg(orgId, (tx) =>
      inv.createInventoryItem(tx as never, orgId, { code: "BRG-9000", name: "A" }),
    );
    await expect(
      withOrg(orgId, (tx) =>
        inv.createInventoryItem(tx as never, orgId, { code: "brg-9000", name: "B" }),
      ),
    ).rejects.toThrow(/SKU_SUDAH_DIPAKAI/);
  });

  it("add_inventory_item via tool tanpa foto tetap sukses + auto SKU", async () => {
    const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
    const res = await inventoryHandlers["add_inventory_item"](orgId, "tester@test.id", {
      name: "Barang Asisten",
    });
    expect(res.success).toBe(true);
    expect((res.data as { code: string }).code).toMatch(/^BRG-/);
  });

  it("imageDocumentId tak valid menghasilkan photoWarning, barang tetap ada", async () => {
    const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
    const res = await inventoryHandlers["add_inventory_item"](orgId, "tester@test.id", {
      name: "Barang Foto Rusak",
      imageDocumentId: "00000000-0000-0000-0000-000000000000",
    });
    expect(res.success).toBe(true);
    expect((res.data as { photoWarning?: string }).photoWarning).toBeDefined();
  });
});
