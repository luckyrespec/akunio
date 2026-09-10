import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { accounts } from "@/server/db/schema/org";
import { createInventoryItem, getInventoryItem } from "@/server/db/repos/inventory.repo";
import { getEntryWithLines } from "@/server/db/repos/journals.repo";
import { checkoutPosSale, openShift, closeShift, postShiftVariance, getShiftSummary } from "@/server/db/repos/pos.repo";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("pos lite checkout", () => {
  let orgId: string;
  let kas = "", barang = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();
  const soldDate = `${year}-06-10`;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("Toko Kasir")).orgId;
    await seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"];
    const item = await createInventoryItem(db, orgId, {
      name: "Teh Botol",
      initialQty: 10,
      initialCostMinor: 30_000n,
      standardSellingPriceMinor: 50_000n,
    });
    barang = item.id;
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("checkout tunai pas: total benar, stok berkurang, jurnal seimbang", async () => {
    const out = await db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate,
        paymentMethod: "TUNAI",
        cashAccountId: kas,
        lines: [{ itemId: barang, qty: 2, unitPriceMinor: 50_000n }],
        cashReceivedMinor: 100_000n,
        idempotencyKey: "kasir-t1",
      }));
    expect(out.number).toMatch(new RegExp(`^POS-${year}-\\d{4}$`));
    expect(out.totalMinor).toBe(100_000n);
    expect(out.changeMinor).toBe(0n);

    const after = await getInventoryItem(db, orgId, barang);
    expect(Number(after!.currentQty)).toBeCloseTo(8, 9);

    const entry = await db.transaction((tx) => getEntryWithLines(tx as never, orgId, out.journalEntryId));
    expect(entry!.status).toBe("POSTED");
    const debit = entry!.lines.reduce((a, l) => a + l.debitMinor, 0n);
    const credit = entry!.lines.reduce((a, l) => a + l.creditMinor, 0n);
    expect(debit).toBe(credit);
    expect(debit).toBe(160_000n); // kas 100rb + hpp 60rb
    const codes = entry!.lines.map((l) => l.accountCode);
    expect(codes).toContain("1110");
  });

  it("stok kurang ditolak dan tidak ada penjualan tercatat", async () => {
    await expect(db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate,
        paymentMethod: "TUNAI",
        cashAccountId: kas,
        lines: [{ itemId: barang, qty: 99, unitPriceMinor: 50_000n }],
        cashReceivedMinor: 4_950_000n,
        idempotencyKey: "kasir-t2",
      }))).rejects.toThrow("STOK_KURANG");
    const n = await admin.query(`SELECT count(*)::int AS n FROM pos_sales WHERE org_id=$1`, [orgId]);
    expect(n.rows[0].n).toBe(1);
  });

  it("double-submit idempotencyKey sama menghasilkan satu penjualan", async () => {
    const input = {
      soldDate,
      paymentMethod: "TUNAI" as const,
      cashAccountId: kas,
      lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
      cashReceivedMinor: 60_000n,
      idempotencyKey: "kasir-t3",
    };
    const first = await db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", input));
    const second = await db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", input));
    expect(second.saleId).toBe(first.saleId);
    expect(second.changeMinor).toBe(10_000n);
    const n = await admin.query(
      `SELECT count(*)::int AS n FROM pos_sales WHERE org_id=$1 AND idempotency_key=$2`,
      [orgId, "kasir-t3"]);
    expect(n.rows[0].n).toBe(1);
  });

  it("tunai kurang dari total ditolak", async () => {
    await expect(db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate,
        paymentMethod: "TUNAI",
        cashAccountId: kas,
        lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
        cashReceivedMinor: 40_000n,
        idempotencyKey: "kasir-t4",
      }))).rejects.toThrow("TUNAI_KURANG");
  });

  it("tanggal tanpa periode ditolak", async () => {
    await expect(db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate: "1999-01-10",
        paymentMethod: "TUNAI",
        cashAccountId: kas,
        lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
        cashReceivedMinor: 50_000n,
        idempotencyKey: "kasir-t5",
      }))).rejects.toThrow("PERIODE_TIDAK_DITEMUKAN");
  });

  it("jasa tidak bisa dijual di kasir", async () => {
    const jasa = await createInventoryItem(db, orgId, { name: "Cuci Motor", itemType: "JASA" });
    await expect(db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate,
        paymentMethod: "TUNAI",
        cashAccountId: kas,
        lines: [{ itemId: jasa.id, qty: 1, unitPriceMinor: 20_000n }],
        cashReceivedMinor: 20_000n,
        idempotencyKey: "kasir-t6",
      }))).rejects.toThrow("KASIR_HANYA_BARANG");
  });

  it("qris tanpa kembalian tercatat dengan metode QRIS", async () => {
    const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const bank = accRows.find((a) => a.code === "1120")!.id;
    const out = await db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate,
        paymentMethod: "QRIS",
        cashAccountId: bank,
        lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
        cashReceivedMinor: 50_000n,
        idempotencyKey: "kasir-t7",
      }));
    expect(out.changeMinor).toBe(0n);
    const n = await admin.query(
      `SELECT payment_method FROM pos_sales WHERE id=$1`, [out.saleId]);
    expect(n.rows[0].payment_method).toBe("QRIS");
  });

  it("shift: buka, jual, ringkasan cocok, tutup pas tanpa selisih", async () => {
    const shift = await db.transaction((tx) =>
      openShift(tx as never, orgId, "kasir@toko.id", { cashAccountId: kas, openingCashMinor: 100_000n }));
    expect(shift.status).toBe("BUKA");
    await db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate,
        paymentMethod: "TUNAI",
        cashAccountId: kas,
        lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
        cashReceivedMinor: 50_000n,
        shiftId: shift.id,
        idempotencyKey: "kasir-s1",
      }));
    const summary = await db.transaction((tx) => getShiftSummary(tx as never, orgId, shift.id));
    expect(summary.saleCount).toBe(1);
    expect(summary.tunaiMinor).toBe(50_000n);
    expect(summary.expectedCashMinor).toBe(150_000n);
    const closed = await db.transaction((tx) =>
      closeShift(tx as never, orgId, "kasir@toko.id", { shiftId: shift.id, cashCountedMinor: 150_000n }));
    expect(closed.shift.status).toBe("TUTUP");
    expect(closed.varianceMinor).toBe(0n);
    expect(closed.varianceJournalEntryId).toBeNull();
  });

  it("shift selisih kurang: DRAFT POS_SELISIH lalu posting", async () => {
    const beban = await admin.query(
      `SELECT id FROM accounts WHERE org_id=$1 AND code='5100'`, [orgId]);
    const shift = await db.transaction((tx) =>
      openShift(tx as never, orgId, "kasir@toko.id", { cashAccountId: kas, openingCashMinor: 0n }));
    await db.transaction((tx) =>
      checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
        soldDate,
        paymentMethod: "TUNAI",
        cashAccountId: kas,
        lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
        cashReceivedMinor: 50_000n,
        shiftId: shift.id,
        idempotencyKey: "kasir-s2",
      }));
    const closed = await db.transaction((tx) =>
      closeShift(tx as never, orgId, "kasir@toko.id", {
        shiftId: shift.id,
        cashCountedMinor: 40_000n,
        varianceAccountId: beban.rows[0].id,
      }));
    expect(closed.varianceMinor).toBe(-10_000n);
    expect(closed.varianceJournalEntryId).not.toBeNull();
    const posted = await db.transaction((tx) =>
      postShiftVariance(tx as never, orgId, "kasir@toko.id", shift.id));
    expect(posted.journalEntryId).toBe(closed.varianceJournalEntryId);
    const entry = await db.transaction((tx) =>
      getEntryWithLines(tx as never, orgId, posted.journalEntryId));
    expect(entry!.status).toBe("POSTED");
    expect(entry!.lines.reduce((a, l) => a + l.debitMinor, 0n)).toBe(10_000n);
  });
});
