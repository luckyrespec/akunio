import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  createInventoryItem,
  listArchivedInventoryItems,
  listInventoryItems,
  setItemActive,
} from "@/server/db/repos/inventory.repo";
import { contacts, invoices, invoiceItems } from "@/server/db/schema/invoicing";
import { inventoryItems } from "@/server/db/schema/inventory";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("inventory archive barang", () => {
  let orgId: string;
  let invCounter = 0;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Arsip")).orgId;
  });

  afterAll(async () => {
    await truncateAll().catch(() => {});
  });

  async function makeItem(code: string, name: string, qty: number, itemType: "BARANG" | "JASA" = "BARANG") {
    return db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, {
        code,
        name,
        unit: "Pcs",
        itemType,
        initialQty: qty,
        initialCostMinor: 100_000n,
      }),
    );
  }

  async function makeDraftInvoice(itemId: string) {
    invCounter += 1;
    return db.transaction(async (tx) => {
      const [c] = await tx
        .insert(contacts)
        .values({ orgId, name: "Toko Uji", type: "CUSTOMER" })
        .returning({ id: contacts.id });
      const [row] = await tx
        .insert(invoices)
        .values({
          orgId,
          type: "INVOICE",
          invoiceNumber: `INV-ARSIP-${invCounter}`,
          contactId: c.id,
          issueDate: "2026-01-01",
          dueDate: "2026-02-01",
          status: "DRAFT",
        })
        .returning({ id: invoices.id });
      await tx.insert(invoiceItems).values({
        invoiceId: row.id,
        description: "Barang uji",
        catalogItemId: itemId,
        quantity: "1.00",
      });
      return row.id;
    });
  }

  it("arsip + aktifkan ulang barang stok nol", async () => {
    const item = await makeItem("ARS-001", "Barang Arsip", 0);
    const archived = await db.transaction((tx) => setItemActive(tx as never, orgId, item.id, false));
    expect(archived?.isActive).toBe(false);

    const active = await listInventoryItems(db, orgId);
    expect(active.some((i) => i.id === item.id)).toBe(false);
    const archivedList = await listArchivedInventoryItems(db, orgId);
    expect(archivedList.some((i) => i.id === item.id)).toBe(true);

    const restored = await db.transaction((tx) => setItemActive(tx as never, orgId, item.id, true));
    expect(restored?.isActive).toBe(true);
  });

  it("menolak arsip bila stok masih ada", async () => {
    const item = await makeItem("ARS-002", "Barang Berstok", 5);
    await expect(
      db.transaction((tx) => setItemActive(tx as never, orgId, item.id, false)),
    ).rejects.toThrow("STOK_MASIH_ADA");
  });

  it("menolak arsip bila dirujuk faktur terbuka, lolos setelah lunas", async () => {
    const item = await makeItem("ARS-003", "Barang Difaktur", 0);
    const invoiceId = await makeDraftInvoice(item.id);
    await expect(
      db.transaction((tx) => setItemActive(tx as never, orgId, item.id, false)),
    ).rejects.toThrow("MASIH_DIPAKAI_DOKUMEN_TERBUKA");

    await db.update(invoices).set({ status: "PAID" }).where(eq(invoices.id, invoiceId));
    const archived = await db.transaction((tx) => setItemActive(tx as never, orgId, item.id, false));
    expect(archived?.isActive).toBe(false);
  });

  it("arsip tolak sisa nilai pembulatan", async () => {
    const item = await makeItem("ARS-004", "Barang Debu", 5);
    // Nol-kan qty, sisakan total 1 (debu pembulatan) via update langsung —
    // repo tak menyediakan write-off parsial; cara sah menolkannya: opname.
    await db
      .update(inventoryItems)
      .set({ currentQty: "0", totalCostMinor: 1n })
      .where(eq(inventoryItems.id, item.id));
    await expect(
      db.transaction((tx) => setItemActive(tx as never, orgId, item.id, false)),
    ).rejects.toThrow("NILAI_MASIH_ADA");
  });

  it("menolak jasa dan id tak dikenal", async () => {
    const jasa = await makeItem("JSA-001", "Jasa Uji", 0, "JASA");
    await expect(
      db.transaction((tx) => setItemActive(tx as never, orgId, jasa.id, false)),
    ).rejects.toThrow("HANYA_BARANG");
    await expect(
      db.transaction((tx) =>
        setItemActive(tx as never, orgId, "00000000-0000-0000-0000-000000000000", false),
      ),
    ).rejects.toThrow("BARANG_TIDAK_DITEMUKAN");
  });
});
