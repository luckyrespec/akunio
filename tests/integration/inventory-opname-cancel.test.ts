import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

// Probe S3 (SeaweedFS): pola storage.test.ts — bila tak reachable, suite S3
// di-skip, bukan fail. Put di dalam test tetap di-try/catch (weed lokal bisa
// menolak key demo walau server menjawab) agar SKIP anggun.
const s3Reachable = await (async () => {
  try {
    const { getDocument } = await import("@/server/storage/storage");
    await getDocument("orgs/probe/definitely-missing.pdf");
    return true;
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
      return false;
    }
    return true;
  }
})();

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("opname: batalkan sesi pra-posting", () => {
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
    orgId = (await makeOrg("PT Opname Batal")).orgId;
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

  it("batalkan draf perhitungan (tanpa jurnal)", async () => {
    await setupInventorySettings();
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "CAN-001",
        name: "Barang Dibatalkan",
        unit: "Pcs",
        initialQty: 4,
        initialCostMinor: 1_000_00n,
      }),
    );
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-08-01`,
        items: [{ itemId: item.id, physicalQty: 4 }],
      }),
    );

    await db.transaction((tx) => inv.cancelStockOpname(tx as never, orgId, opname.id));

    const op = await db.transaction((tx) =>
      inv.getStockOpnameWithItems(tx as never, orgId, opname.id),
    );
    expect(op!.status).toBe("CANCELLED");
    expect(op!.journalEntryId).toBeNull();

    // Stok tidak berubah.
    const after = await db.transaction((tx) =>
      inv.getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(after!.currentQty)).toBe(4);

    // Tidak bisa dibatalkan dua kali.
    await expect(
      db.transaction((tx) => inv.cancelStockOpname(tx as never, orgId, opname.id)),
    ).rejects.toThrow("OPNAME_SUDAH_DIBATALKAN");
  });

  it("batalkan draf jurnal terbit: jurnal ikut terhapus, stok tetap", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "CAN-002",
        name: "Barang Draf Jurnal",
        unit: "Pcs",
        initialQty: 10,
        initialCostMinor: 2_000_00n,
      }),
    );
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-08-02`,
        items: [{ itemId: item.id, physicalQty: 8 }],
      }),
    );
    const draft = await db.transaction((tx) =>
      inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
    );
    expect(draft.journalEntryId).toBeTruthy();
    const entryId = draft.journalEntryId!;

    await db.transaction((tx) => inv.cancelStockOpname(tx as never, orgId, opname.id));

    const op = await db.transaction((tx) =>
      inv.getStockOpnameWithItems(tx as never, orgId, opname.id),
    );
    expect(op!.status).toBe("CANCELLED");
    expect(op!.journalEntryId).toBeNull();

    // Jurnal + baris + links hilang (cascade), bukan menggantung.
    const je = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM journal_entries WHERE id=$1`,
      [entryId],
    );
    expect(Number(je.rows[0].n)).toBe(0);
    const jl = await admin.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM journal_lines WHERE entry_id=$1`,
      [entryId],
    );
    expect(Number(jl.rows[0].n)).toBe(0);

    // Stok masih 10 (belum tersentuh draf).
    const after = await db.transaction((tx) =>
      inv.getInventoryItem(tx as never, orgId, item.id),
    );
    expect(Number(after!.currentQty)).toBe(10);

    // Posting setelah dibatalkan harus ditolak.
    await expect(
      db.transaction((tx) => inv.postOpnameAdjustment(tx as never, orgId, opname.id, "t@t.id")),
    ).rejects.toThrow(/SUDAH_SELESAI|BELUM_SIAP/);
  });

  it("menolak membatalkan sesi yang sudah COMPLETED", async () => {
    const inv = await import("@/server/db/repos/inventory.repo");
    const { db } = await import("@/server/db");

    const item = await db.transaction((tx) =>
      inv.createInventoryItem(tx as never, orgId, {
        code: "CAN-003",
        name: "Barang Selesai",
        unit: "Pcs",
        initialQty: 6,
        initialCostMinor: 1_500_00n,
      }),
    );
    const opname = await db.transaction((tx) =>
      inv.createStockOpname(tx as never, orgId, {
        opnameDate: `${year}-08-03`,
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
      db.transaction((tx) => inv.cancelStockOpname(tx as never, orgId, opname.id)),
    ).rejects.toThrow("OPNAME_SELESAI_TIDAK_BISA_DIBATALKAN");
  });

  describe.skipIf(!s3Reachable || process.env.SKIP_STORAGE_TESTS === "1")("cancel bersih S3 ter-link draf", () => {
    it("menghapus objek S3 eksklusif draf saat sesi dibatalkan", async () => {
      const { putDocument, getDocument } = await import("@/server/storage/storage");
      const buf = Buffer.from("%PDF-1.4 opname-cancel");
      let storageKey: string;
      try {
        ({ storageKey } = await putDocument(orgId, { buffer: buf, mime: "application/pdf" }));
      } catch (e) {
        console.warn(`[skip] S3 put ditolak (${(e as Error).message}) — SKIP anggun`);
        return;
      }
      const inv = await import("@/server/db/repos/inventory.repo");
      const { db } = await import("@/server/db");
      const docRepo = await import("@/server/db/repos/documents.repo");
      const jRepo = await import("@/server/db/repos/journals.repo");

      const item = await db.transaction((tx) =>
        inv.createInventoryItem(tx as never, orgId, {
          code: "CAN-S3",
          name: "Barang S3",
          unit: "Pcs",
          initialQty: 10,
          initialCostMinor: 2_000_00n,
        }),
      );
      const opname = await db.transaction((tx) =>
        inv.createStockOpname(tx as never, orgId, {
          opnameDate: `${year}-08-04`,
          items: [{ itemId: item.id, physicalQty: 8 }],
        }),
      );
      const draft = await db.transaction((tx) =>
        inv.generateAdjustmentJournalDraft(tx as never, orgId, opname.id),
      );
      expect(draft.journalEntryId).toBeTruthy();
      const entryId = draft.journalEntryId!;

      await db.transaction(async (tx) => {
        const doc = await docRepo.createDocumentRow(tx as never, {
          orgId,
          storageKey,
          mime: "application/pdf",
          sizeBytes: buf.length,
        });
        await jRepo.linkDocumentToEntry(tx as never, {
          orgId,
          entryId,
          documentId: doc.id,
          fileName: "bukti.pdf",
        });
      });

      await db.transaction((tx) => inv.cancelStockOpname(tx as never, orgId, opname.id));

      // Objek S3 ikut terhapus (best-effort di repo); link DB hilang via cascade.
      await expect(getDocument(storageKey)).rejects.toThrow();
      const links = await admin.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM journal_documents WHERE entry_id=$1`,
        [entryId],
      );
      expect(Number(links.rows[0].n)).toBe(0);
    });
  });
});
