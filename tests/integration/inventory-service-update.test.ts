import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { createInventoryItem, updateServiceItem } from "@/server/db/repos/inventory.repo";
import { inventoryItems } from "@/server/db/schema/inventory";
import { accounts } from "@/server/db/schema/org";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("inventory update jasa", () => {
  let orgId: string;
  let accPendapatan: string;
  let accBeban: string;
  let accAset: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Jasa Edit")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await db
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(eq(accounts.orgId, orgId))
      .orderBy(accounts.code);
    accPendapatan = rows.find((r) => r.type === "PENDAPATAN")!.id;
    accBeban = rows.find((r) => r.type === "BEBAN")!.id;
    accAset = rows.find((r) => r.type === "ASET")!.id;
  });

  afterAll(async () => {
    await truncateAll().catch(() => {});
  });

  async function makeJasa(code: string, name: string) {
    return db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, { code, name, unit: "Sesi", itemType: "JASA" }),
    );
  }

  async function getItem(id: string) {
    const [row] = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);
    return row;
  }

  it("mengubah jasa termasuk akun, kode terkunci", async () => {
    const jasa = await makeJasa("JSA-101", "Cuci");
    await db.transaction((tx) =>
      updateServiceItem(tx as never, orgId, jasa.id, {
        name: "Cuci Rambut",
        category: "Perawatan",
        unit: "Kali",
        standardSellingPriceMinor: 75_000n,
        revenueAccountId: accPendapatan,
        expenseAccountId: accBeban,
      }),
    );
    const row = await getItem(jasa.id);
    expect(row.name).toBe("Cuci Rambut");
    expect(row.category).toBe("Perawatan");
    expect(row.unit).toBe("Kali");
    expect(row.standardSellingPriceMinor).toBe(75_000n);
    expect(row.revenueAccountId).toBe(accPendapatan);
    expect(row.expenseAccountId).toBe(accBeban);
    expect(row.code).toBe("JSA-101");
  });

  it("bisa mengembalikan akun ke default (null)", async () => {
    const jasa = await makeJasa("JSA-102", "Pijat");
    await db.transaction((tx) =>
      updateServiceItem(tx as never, orgId, jasa.id, {
        name: "Pijat",
        revenueAccountId: accPendapatan,
        expenseAccountId: null,
      }),
    );
    const row = await getItem(jasa.id);
    expect(row.revenueAccountId).toBe(accPendapatan);
    expect(row.expenseAccountId).toBeNull();
  });

  it("menolak akun salah tipe, akun asing, dan id tak dikenal", async () => {
    const jasa = await makeJasa("JSA-103", "Lulur");
    const run = (input: Parameters<typeof updateServiceItem>[3]) =>
      db.transaction((tx) => updateServiceItem(tx as never, orgId, jasa.id, input));

    await expect(run({ name: "Lulur", revenueAccountId: accAset })).rejects.toThrow(
      "AKUN_PENDAPATAN_TIPE_SALAH",
    );
    await expect(run({ name: "Lulur", expenseAccountId: accPendapatan })).rejects.toThrow(
      "AKUN_BEBAN_TIPE_SALAH",
    );
    await expect(
      run({ name: "Lulur", revenueAccountId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow("AKUN_PENDAPATAN_TIDAK_DITEMUKAN");
    await expect(run({ name: "x" })).rejects.toThrow("NAMA_JASA_MINIMAL_2_HURUF");
    await expect(run({ name: "Lulur", standardSellingPriceMinor: -1n })).rejects.toThrow(
      "HARGA_JUAL_TIDAK_VALID",
    );
    await expect(
      db.transaction((tx) =>
        updateServiceItem(tx as never, orgId, "00000000-0000-0000-0000-000000000000", {
          name: "Hantu",
        }),
      ),
    ).rejects.toThrow("JASA_TIDAK_DITEMUKAN");
  });

  it("menolak barang di jalur jasa", async () => {
    const barang = await db.transaction((tx) =>
      createInventoryItem(tx as never, orgId, { code: "BRG-901", name: "Sabun", unit: "Pcs" }),
    );
    await expect(
      db.transaction((tx) => updateServiceItem(tx as never, orgId, barang.id, { name: "Sabun X" })),
    ).rejects.toThrow("JASA_TIDAK_DITEMUKAN");
  });
});
