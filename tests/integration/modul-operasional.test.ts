import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import type { CashKind } from "@/server/db/schema/cash-bank";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "modul operasional: idempotency kas-bank",
  () => {
    let orgId: string;
    let kas = "",
      lawan = "";
    const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
    const year = new Date().getFullYear();

    beforeAll(async () => {
      await truncateAll();
      orgId = (await makeOrg("PT Operasional Idempoten")).orgId;
      await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
      const rows = await admin.query<{ id: string; code: string }>(
        `SELECT id, code FROM accounts WHERE org_id=$1`,
        [orgId]
      );
      const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
      kas = byCode["1110"];
      // Lawan leaf (bukan 4100/5100 yang bisa jadi GROUP pasca-onboarding).
      lawan = byCode["4200"];
    });
    afterAll(async () => {
      await admin.end();
      await truncateAll();
    });

    async function createCashEntryWithKey(
      forOrgId: string,
      args: { kind: CashKind; amountMinor: bigint; idempotencyKey: string }
    ) {
      const { withOrg } = await import("@/server/db/repos/with-org");
      const { createCashEntryRepo } = await import(
        "@/server/db/repos/cash-bank.repo"
      );
      return withOrg(forOrgId, (tx) =>
        createCashEntryRepo(
          tx as never,
          forOrgId,
          "t@t.id",
          {
            kind: args.kind,
            entryDate: `${year}-06-10`,
            cashAccountId: kas,
            counterAccountId: lawan,
            amountMinor: args.amountMinor,
            memo: "Setoran operasional",
            idempotencyKey: args.idempotencyKey,
          },
          { post: true }
        )
      );
    }

    it("double-submit kas TERIMA satu jurnal satu baris", async () => {
      const key = "kas-t1";
      const r1 = await createCashEntryWithKey(orgId, {
        kind: "TERIMA",
        amountMinor: 75_000n,
        idempotencyKey: key,
      });
      const r2 = await createCashEntryWithKey(orgId, {
        kind: "TERIMA",
        amountMinor: 75_000n,
        idempotencyKey: key,
      });
      expect(r2.journalEntryId).toBe(r1.journalEntryId);
      expect(r2.id).toBe(r1.id);
      const n = await admin.query<{ n: number }>(
        `SELECT count(*)::int n FROM kas_bank_entries WHERE org_id=$1`,
        [orgId]
      );
      expect(n.rows[0].n).toBe(1);
      const j = await admin.query<{ n: number }>(
        `SELECT count(*)::int n FROM journal_entries WHERE org_id=$1 AND idempotency_key=$2`,
        [orgId, key]
      );
      expect(j.rows[0].n).toBe(1);
    });
  }
);

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "modul operasional: guard pelunasan + log kas",
  () => {
    let orgId: string;
    let kasId = "",
      nonKasId = "";
    let invId = "";
    const totalMinor = 100_000n;
    const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
    const year = new Date().getFullYear();

    beforeAll(async () => {
      await truncateAll();
      orgId = (await makeOrg("PT Pelunasan Guard")).orgId;
      await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
      const rows = await admin.query<{ id: string; code: string }>(
        `SELECT id, code FROM accounts WHERE org_id=$1`,
        [orgId]
      );
      const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
      kasId = byCode["1110"];
      // Lawan leaf non-kas (bukan 4100/5100 yang bisa jadi GROUP pasca-onboarding).
      nonKasId = byCode["4200"];
      const { db } = await import("@/server/db");
      const { contacts, invoices } = await import(
        "@/server/db/schema/invoicing"
      );
      const [c] = await db
        .insert(contacts)
        .values({ orgId, type: "CUSTOMER", name: "PT Pelunasan" })
        .returning();
      const [inv] = await db
        .insert(invoices)
        .values({
          orgId,
          type: "INVOICE",
          invoiceNumber: `INV-${year}-0901`,
          contactId: c.id,
          issueDate: `${year}-06-01`,
          dueDate: `${year}-06-30`,
          subtotalMinor: totalMinor,
          totalMinor,
          status: "ISSUED",
        })
        .returning();
      invId = inv.id;
    });
    afterAll(async () => {
      await admin.end();
      await truncateAll();
    });

    async function pay(
      invoiceId: string,
      amountMinor: bigint,
      accountId: string = kasId
    ) {
      const { recordInvoicePaymentRepo } = await import(
        "@/server/db/repos/invoices.repo"
      );
      const { db } = await import("@/server/db");
      return recordInvoicePaymentRepo(db, orgId, {
        invoiceId,
        paymentDate: `${year}-06-11`,
        amountMinor,
        paymentAccountId: accountId,
      });
    }

    async function payAndPost(
      invoiceId: string,
      amountMinor: bigint,
      accountId: string = kasId
    ) {
      const { postInvoicePaymentToLedger } = await import(
        "@/server/invoicing/posting"
      );
      const { db } = await import("@/server/db");
      const { payment } = await pay(invoiceId, amountMinor, accountId);
      const journalEntryId = await postInvoicePaymentToLedger(
        db,
        orgId,
        payment.id,
        "t@t.id"
      );
      return { payment, journalEntryId };
    }

    it("pelunasan nol dan overpayment ditolak", async () => {
      const inv = (
        await admin.query<{ total_minor: string; amount_paid_minor: string }>(
          `SELECT total_minor, amount_paid_minor FROM invoices WHERE id=$1`,
          [invId]
        )
      ).rows[0];
      const remaining = BigInt(inv.total_minor) - BigInt(inv.amount_paid_minor);
      await expect(pay(invId, 0n)).rejects.toThrow();
      await expect(pay(invId, remaining + 1n)).rejects.toThrow("MELEBIHI_SISA");
    });

    it("pelunasan tanpa akun kas atau akun non-kas ditolak", async () => {
      await expect(pay(invId, 10_000n, "")).rejects.toThrow();
      await expect(pay(invId, 10_000n, nonKasId)).rejects.toThrow("BUKAN_AKUN_KAS");
    });

    it("pelunasan tampil di daftar kas", async () => {
      const p = await payAndPost(invId, 50_000n, kasId);
      const r = await admin.query<{ journal_entry_id: string; number: string }>(
        `SELECT journal_entry_id, number FROM kas_bank_entries WHERE org_id=$1`,
        [orgId]
      );
      expect(r.rows.map((x) => x.journal_entry_id)).toContain(p.journalEntryId);
      expect(r.rows.map((x) => x.number)).toContainEqual(
        expect.stringMatching(/^PMB-\d{4}-\d{4}$/)
      );
    });
  }
);

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "modul operasional: AI record_invoice_payment ikut posting",
  () => {
    let orgId: string;
    let invNumber = "";
    const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
    const year = new Date().getFullYear();

    beforeAll(async () => {
      await truncateAll();
      orgId = (await makeOrg("PT AI Pelunasan Posting")).orgId;
      await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
      const { db } = await import("@/server/db");
      const { contacts, invoices } = await import(
        "@/server/db/schema/invoicing"
      );
      const [c] = await db
        .insert(contacts)
        .values({ orgId, type: "CUSTOMER", name: "PT AI Bayar" })
        .returning();
      invNumber = `INV-${year}-0902`;
      await db.insert(invoices).values({
        orgId,
        type: "INVOICE",
        invoiceNumber: invNumber,
        contactId: c.id,
        issueDate: `${year}-06-01`,
        dueDate: `${year}-06-30`,
        subtotalMinor: 100_000n,
        totalMinor: 100_000n,
        status: "ISSUED",
      });
    });
    afterAll(async () => {
      await admin.end();
      await truncateAll();
    });

    it("AI record_invoice_payment menghasilkan jurnal", async () => {
      const { executeNaraTool } = await import("@/server/ai/nara-tools");
      const out = await executeNaraTool(orgId, "t@t.id", "record_invoice_payment", {
        invoiceNumber: invNumber,
        amount: 500,
        accountCode: "1110",
        paymentDate: `${year}-06-11`,
      });
      expect(out.success).toBe(true);
      const paymentId = (out.data as { paymentId?: string } | undefined)?.paymentId;
      const row = paymentId
        ? await admin.query<{ journal_entry_id: string | null }>(
            `SELECT journal_entry_id FROM invoice_payments WHERE id=$1`,
            [paymentId]
          )
        : await admin.query<{ journal_entry_id: string | null }>(
            `SELECT journal_entry_id FROM invoice_payments WHERE invoice_id=(SELECT id FROM invoices WHERE org_id=$1 AND invoice_number=$2)`,
            [orgId, invNumber]
          );
      expect(row.rows[0].journal_entry_id).not.toBeNull();
    });

    it("I1 nominal desimal eksak: 100.5 → 10050 minor (tanpa float)", async () => {
      const { executeNaraTool } = await import("@/server/ai/nara-tools");
      const { db } = await import("@/server/db");
      const { contacts, invoices } = await import(
        "@/server/db/schema/invoicing"
      );
      const { eq } = await import("drizzle-orm");
      const [c] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
        .limit(1);
      const num = `INV-${year}-0904`;
      await db.insert(invoices).values({
        orgId,
        type: "INVOICE",
        invoiceNumber: num,
        contactId: c.id,
        issueDate: `${year}-06-01`,
        dueDate: `${year}-06-30`,
        subtotalMinor: 1_000_000n,
        totalMinor: 1_000_000n,
        status: "ISSUED",
      });
      const out = await executeNaraTool(orgId, "t@t.id", "record_invoice_payment", {
        invoiceNumber: num,
        amount: 100.5,
        accountCode: "1110",
        paymentDate: `${year}-06-11`,
      });
      expect(out.success).toBe(true);
      const pay = await admin.query<{ amount_minor: string }>(
        `SELECT amount_minor FROM invoice_payments WHERE invoice_id=(SELECT id FROM invoices WHERE org_id=$1 AND invoice_number=$2) ORDER BY created_at DESC LIMIT 1`,
        [orgId, num]
      );
      // "100.5" rupiah = Rp100,50 = 10_050 sen — eksak, bukan hasil float.
      expect(BigInt(pay.rows[0].amount_minor)).toBe(10_050n);
    });

    it("I1 nominal >2 desimal ditolak (1.005 tak boleh dibulatkan diam-diam)", async () => {
      const { executeNaraTool } = await import("@/server/ai/nara-tools");
      const { db } = await import("@/server/db");
      const { contacts, invoices } = await import(
        "@/server/db/schema/invoicing"
      );
      const { eq } = await import("drizzle-orm");
      const [c] = await db
        .select()
        .from(contacts)
        .where(eq(contacts.orgId, orgId))
        .limit(1);
      const num = `INV-${year}-0905`;
      await db.insert(invoices).values({
        orgId,
        type: "INVOICE",
        invoiceNumber: num,
        contactId: c.id,
        issueDate: `${year}-06-01`,
        dueDate: `${year}-06-30`,
        subtotalMinor: 1_000_000n,
        totalMinor: 1_000_000n,
        status: "ISSUED",
      });
      // Bukti float pre-fix: Number("1.005")*100 = 100.49999999999999 →
      // Math.round = 100n (Rp1,00) — salah dan diam-diam. Pasca-fix: tolak.
      const out = await executeNaraTool(orgId, "t@t.id", "record_invoice_payment", {
        invoiceNumber: num,
        amount: 1.005,
        accountCode: "1110",
        paymentDate: `${year}-06-11`,
      });
      expect(out.success).toBe(false);
      expect(out.error ?? "").toMatch(/DESIMAL/i);
      const pay = await admin.query<{ n: string }>(
        `SELECT count(*)::text n FROM invoice_payments WHERE invoice_id=(SELECT id FROM invoices WHERE org_id=$1 AND invoice_number=$2)`,
        [orgId, num]
      );
      expect(pay.rows[0].n).toBe("0");
    });

    it("I1 nominal nol/negatif ditolak", async () => {
      const { executeNaraTool } = await import("@/server/ai/nara-tools");
      const zero = await executeNaraTool(orgId, "t@t.id", "record_invoice_payment", {
        invoiceNumber: invNumber,
        amount: 0,
        accountCode: "1110",
        paymentDate: `${year}-06-11`,
      });
      expect(zero.success).toBe(false);
      expect(zero.error ?? "").toMatch(/NOMINAL|positif|Rp 0/i);
      const neg = await executeNaraTool(orgId, "t@t.id", "record_invoice_payment", {
        invoiceNumber: invNumber,
        amount: -100,
        accountCode: "1110",
        paymentDate: `${year}-06-11`,
      });
      expect(neg.success).toBe(false);
      expect(neg.error ?? "").toMatch(/NOMINAL|positif|Rp 0|DESIMAL/i);
    });
  }
);

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "modul operasional: counter faktur dalam tx (B4)",
  () => {
    let orgId: string;
    let contactId = "";
    const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
    const year = new Date().getFullYear();

    beforeAll(async () => {
      await truncateAll();
      orgId = (await makeOrg("PT Faktur Counter Tx")).orgId;
      const { db } = await import("@/server/db");
      const { contacts } = await import("@/server/db/schema/invoicing");
      const [c] = await db
        .insert(contacts)
        .values({ orgId, type: "CUSTOMER", name: "PT Counter" })
        .returning();
      contactId = c.id;
    });
    afterAll(async () => {
      await admin.end();
      await truncateAll();
    });

    it("faktur tanpa nomor otomatis berurutan dari counter dalam tx", async () => {
      const { createInvoiceRepo } = await import(
        "@/server/db/repos/invoices.repo"
      );
      const { db } = await import("@/server/db");
      const base = {
        type: "INVOICE" as const,
        contactId,
        issueDate: `${year}-06-01`,
        dueDate: `${year}-06-30`,
      };
      const a = await createInvoiceRepo(db, orgId, base, []);
      const b = await createInvoiceRepo(db, orgId, base, []);
      expect(a.invoiceNumber).toBe(`INV-${year}-0001`);
      expect(b.invoiceNumber).toBe(`INV-${year}-0002`);
      const c = await admin.query<{ last_seq: number }>(
        `SELECT last_seq FROM invoice_seq_counters WHERE org_id=$1 AND year=$2 AND type='INVOICE'`,
        [orgId, year]
      );
      expect(Number(c.rows[0]?.last_seq)).toBe(2);
    });
  }
);

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "modul operasional: POS B5",
  () => {
    let orgId: string;
    let kas = "",
      piutangCtl = "",
      beban = "";
    let barang = "";
    const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
    const year = new Date().getFullYear();
    const soldDate = `${year}-06-10`;

    beforeAll(async () => {
      await truncateAll();
      orgId = (await makeOrg("PT POS B5")).orgId;
      await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
      const rows = await admin.query<{ id: string; code: string }>(
        `SELECT id, code FROM accounts WHERE org_id=$1`,
        [orgId]
      );
      const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
      kas = byCode["1110"];
      piutangCtl = byCode["1200"];
      beban = byCode["5900"];
      // Daftarkan 1200 sebagai akun kontrol PIUTANG agar penolakan akun
      // kontrol sebagai akun selisih punya makna (registry subledger_controls).
      await admin.query(
        `INSERT INTO subledger_controls (org_id, kind, control_account_id)
         VALUES ($1, 'PIUTANG', $2) ON CONFLICT DO NOTHING`,
        [orgId, piutangCtl]
      );
      const { db } = await import("@/server/db");
      const { createInventoryItem } = await import(
        "@/server/db/repos/inventory.repo"
      );
      const item = await createInventoryItem(db, orgId, {
        name: "Mie Instan",
        initialQty: 50,
        initialCostMinor: 10_000n,
        standardSellingPriceMinor: 50_000n,
      });
      barang = item.id;
    });
    afterAll(async () => {
      await admin.end();
      await truncateAll();
    });

    function input(key: string) {
      return { key };
    }

    async function checkout(arg: string | { key: string }) {
      const key = typeof arg === "string" ? arg : arg.key;
      const { db } = await import("@/server/db");
      const { checkoutPosSale } = await import("@/server/db/repos/pos.repo");
      return db.transaction((tx) =>
        checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
          soldDate,
          paymentMethod: "TUNAI",
          cashAccountId: kas,
          lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
          cashReceivedMinor: 50_000n,
          idempotencyKey: key,
        })
      );
    }

    async function openShiftWithSale(keyPrefix: string) {
      const { db } = await import("@/server/db");
      const { openShift, checkoutPosSale } = await import(
        "@/server/db/repos/pos.repo"
      );
      const shift = await db.transaction((tx) =>
        openShift(tx as never, orgId, "kasir@toko.id", {
          cashAccountId: kas,
          openingCashMinor: 0n,
        })
      );
      await db.transaction((tx) =>
        checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
          soldDate,
          paymentMethod: "TUNAI",
          cashAccountId: kas,
          lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
          cashReceivedMinor: 50_000n,
          shiftId: shift.id,
          idempotencyKey: `${keyPrefix}-${shift.id}`,
        })
      );
      return shift;
    }

    async function closeWith(
      shiftId: string,
      varianceAccountId: string | null,
      cashCountedMinor = 40_000n
    ) {
      const { db } = await import("@/server/db");
      const { closeShift } = await import("@/server/db/repos/pos.repo");
      return db.transaction((tx) =>
        closeShift(tx as never, orgId, "kasir@toko.id", {
          shiftId,
          cashCountedMinor,
          varianceAccountId,
          dateISO: soldDate,
        })
      );
    }

    async function closeShiftWithVarianceAccount(varianceAccountId: string) {
      const shift = await openShiftWithSale("b5-var");
      try {
        return await closeWith(shift.id, varianceAccountId);
      } finally {
        // Gagal tutup (tes RED) tidak boleh mengunci kas 1110 untuk tes berikut.
        await closeWith(shift.id, beban).catch(() => {});
      }
    }

    it("dupe checkout kembalikan nomor jurnal asli", async () => {
      const f = await checkout(input("dup-pos"));
      const s = await checkout(input("dup-pos"));
      expect(s.journalNumber).toBe(f.journalNumber);
      expect(s.journalNumber).not.toBe("");
    });

    it("dua baris item sama atribusikan biaya per baris", async () => {
      const { db } = await import("@/server/db");
      const {
        checkoutPosSale,
      } = await import("@/server/db/repos/pos.repo");
      const { getEntryWithLines } = await import(
        "@/server/db/repos/journals.repo"
      );
      const out = await db.transaction((tx) =>
        checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
          soldDate,
          paymentMethod: "TUNAI",
          cashAccountId: kas,
          lines: [
            { itemId: barang, qty: 1, unitPriceMinor: 50_000n },
            { itemId: barang, qty: 3, unitPriceMinor: 50_000n },
          ],
          cashReceivedMinor: 200_000n,
          idempotencyKey: "b5-atribusi",
        })
      );
      // Total HPP tetap 4 x 10rb pada jurnal.
      const entry = await db.transaction((tx) =>
        getEntryWithLines(tx as never, orgId, out.journalEntryId)
      );
      const hpp = entry!.lines.find((l) => l.memo?.startsWith("HPP "));
      expect(hpp?.debitMinor).toBe(40_000n);
      // Porsi per baris proporsional: qty 1 dan qty 3 masing-masing 10rb/unit.
      const rows = (
        await admin.query<{
          qty: string;
          unit_cost_minor: string;
        }>(
          `SELECT qty, unit_cost_minor FROM pos_sale_items
           WHERE sale_id=$1 ORDER BY qty::float`,
          [out.saleId]
        )
      ).rows;
      expect(rows).toHaveLength(2);
      expect(BigInt(rows[0].unit_cost_minor)).toBe(10_000n);
      expect(BigInt(rows[1].unit_cost_minor)).toBe(10_000n);
    });

    it("I2 baris diskon ikut teratribusi per baris (biaya struktural, bukan posisional)", async () => {
      const { db } = await import("@/server/db");
      const {
        checkoutPosSale,
      } = await import("@/server/db/repos/pos.repo");
      const { getEntryWithLines } = await import(
        "@/server/db/repos/journals.repo"
      );
      const out = await db.transaction((tx) =>
        checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
          soldDate,
          paymentMethod: "TUNAI",
          cashAccountId: kas,
          lines: [
            { itemId: barang, qty: 1, unitPriceMinor: 50_000n, discountMinor: 5_000n },
            { itemId: barang, qty: 2, unitPriceMinor: 50_000n },
          ],
          cashReceivedMinor: 145_000n,
          idempotencyKey: "b5-diskon",
        })
      );
      // Bruto 150rb - diskon 5rb = 145rb.
      expect(out.totalMinor).toBe(145_000n);
      const entry = await db.transaction((tx) =>
        getEntryWithLines(tx as never, orgId, out.journalEntryId)
      );
      const hpp = entry!.lines.find((l) => l.memo?.startsWith("HPP "));
      expect(hpp?.debitMinor).toBe(30_000n);
      const rows = (
        await admin.query<{
          qty: string;
          unit_cost_minor: string;
          line_total_minor: string;
        }>(
          `SELECT qty, unit_cost_minor, line_total_minor FROM pos_sale_items
           WHERE sale_id=$1 ORDER BY qty::float`,
          [out.saleId]
        )
      ).rows;
      expect(rows).toHaveLength(2);
      // Biaya per unit tetap 10rb di kedua baris walau baris pertama berdiskon.
      expect(BigInt(rows[0].unit_cost_minor)).toBe(10_000n);
      expect(BigInt(rows[1].unit_cost_minor)).toBe(10_000n);
      expect(BigInt(rows[0].line_total_minor)).toBe(45_000n);
      expect(BigInt(rows[1].line_total_minor)).toBe(100_000n);
    });

    it("akun kontrol ditolak sebagai akun selisih", async () => {
      await expect(closeShiftWithVarianceAccount(piutangCtl)).rejects.toThrow(
        /KONTROL/
      );
    });

    it("tutup konkuren hanya satu draf selisih", async () => {
      const { db } = await import("@/server/db");
      const { openShift, checkoutPosSale, closeShift } = await import(
        "@/server/db/repos/pos.repo"
      );
      const shift = await db.transaction((tx) =>
        openShift(tx as never, orgId, "kasir@toko.id", {
          cashAccountId: kas,
          openingCashMinor: 0n,
        })
      );
      await db.transaction((tx) =>
        checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
          soldDate,
          paymentMethod: "TUNAI",
          cashAccountId: kas,
          lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
          cashReceivedMinor: 50_000n,
          shiftId: shift.id,
          idempotencyKey: `b5-race-${shift.id}`,
        })
      );
      const before = await admin.query<{ n: number }>(
        `SELECT count(*)::int n FROM journal_entries WHERE org_id=$1 AND source='POS_SELISIH'`,
        [orgId]
      );
      const results = await Promise.allSettled([
        db.transaction((tx) =>
          closeShift(tx as never, orgId, "kasir@toko.id", {
            shiftId: shift.id,
            cashCountedMinor: 40_000n,
            varianceAccountId: beban,
            dateISO: soldDate,
          })
        ),
        db.transaction((tx) =>
          closeShift(tx as never, orgId, "kasir@toko.id", {
            shiftId: shift.id,
            cashCountedMinor: 40_000n,
            varianceAccountId: beban,
            dateISO: soldDate,
          })
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const after = await admin.query<{ n: number }>(
        `SELECT count(*)::int n FROM journal_entries WHERE org_id=$1 AND source='POS_SELISIH'`,
        [orgId]
      );
      expect(after.rows[0].n - before.rows[0].n).toBe(1);
    });

    it("laci hanya menghitung tunai (transfer/qris di luar ekspektasi)", async () => {
      const { db } = await import("@/server/db");
      const { openShift, checkoutPosSale, getShiftSummary } = await import(
        "@/server/db/repos/pos.repo"
      );
      const shift = await db.transaction((tx) =>
        openShift(tx as never, orgId, "kasir@toko.id", {
          cashAccountId: kas,
          openingCashMinor: 100_000n,
        })
      );
      const sell = async (
        method: "TUNAI" | "TRANSFER",
        key: string,
        accountId: string
      ) =>
        db.transaction((tx) =>
          checkoutPosSale(tx as never, orgId, "kasir@toko.id", {
            soldDate,
            paymentMethod: method,
            cashAccountId: accountId,
            lines: [{ itemId: barang, qty: 1, unitPriceMinor: 50_000n }],
            cashReceivedMinor: 50_000n,
            shiftId: shift.id,
            idempotencyKey: key,
          })
        );
      const bankRows = await admin.query<{ id: string }>(
        `SELECT id FROM accounts WHERE org_id=$1 AND code='1120'`,
        [orgId]
      );
      await sell("TUNAI", `b5-laci-tunai-${shift.id}`, kas);
      await sell("TRANSFER", `b5-laci-transfer-${shift.id}`, bankRows.rows[0].id);
      const summary = await db.transaction((tx) =>
        getShiftSummary(tx as never, orgId, shift.id)
      );
      expect(summary.tunaiMinor).toBe(50_000n);
      expect(summary.transferMinor).toBe(50_000n);
      expect(summary.expectedCashMinor).toBe(150_000n);
      const { closeShift } = await import("@/server/db/repos/pos.repo");
      const closed = await db.transaction((tx) =>
        closeShift(tx as never, orgId, "kasir@toko.id", {
          shiftId: shift.id,
          cashCountedMinor: 150_000n,
        })
      );
      expect(closed.shift.status).toBe("TUTUP");
    });

    it("picker akun selisih mengecualikan kas dan kontrol", async () => {
      process.env.TEST_CTX_ORG = orgId;
      try {
        const { getVarianceAccountOptionsAction } = await import(
          "@/server/actions/pos.actions"
        );
        const res = await getVarianceAccountOptionsAction();
        expect(res.ok).toBe(true);
        const codes = res.ok
          ? res.data.map((a) => a.code)
          : ([] as string[]);
        expect(codes).not.toContain("1110");
        expect(codes).not.toContain("1200");
        expect(codes).toContain("5900");
      } finally {
        delete process.env.TEST_CTX_ORG;
      }
    });
  }
);

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "B8 withOrg read-path: isolasi antar-org",
  () => {
    const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
    let orgA = "",
      orgB = "";

    beforeAll(async () => {
      await truncateAll();
      orgA = (await makeOrg("PT B8 Alpha")).orgId;
      orgB = (await makeOrg("PT B8 Beta")).orgId;
      await admin.query(
        `INSERT INTO accounts (org_id, code, name, type, normal) VALUES
          ($1, 'B8A0001', 'Kas Isolasi Alpha', 'ASET', 'D'),
          ($2, 'B8B0001', 'Kas Isolasi Beta', 'ASET', 'D')`,
        [orgA, orgB]
      );
      await admin.query(
        `INSERT INTO tenant_chunks (org_id, source_kind, content, embedding) VALUES
          ($1, 'DOCUMENT', 'memo unik alpha zxqw', '[]'),
          ($2, 'DOCUMENT', 'memo unik beta qwer', '[]')`,
        [orgA, orgB]
      );
    });
    afterAll(async () => {
      await admin.end();
      await truncateAll();
    });

    it("read antar-org terisolasi predikat", async () => {
      const { coaHandlers } = await import("@/server/ai/tools/coa.tools");
      const a = await coaHandlers.list_accounts(orgA, "", {});
      const b = await coaHandlers.list_accounts(orgB, "", {});
      expect(a.success).toBe(true);
      expect(b.success).toBe(true);
      const codesA = ((a.data ?? []) as Array<{ code: string }>).map(
        (r) => r.code
      );
      const codesB = ((b.data ?? []) as Array<{ code: string }>).map(
        (r) => r.code
      );
      expect(codesA).toContain("B8A0001");
      expect(codesA).not.toContain("B8B0001");
      expect(codesB).toContain("B8B0001");
      expect(codesB).not.toContain("B8A0001");
    });

    it("hybridSearch tenant-half lewat tx pemanggil + hasil tenant-only", async () => {
      const { withOrg } = await import("@/server/db/repos/with-org");
      const { hybridSearch } = await import("@/server/db/repos/rag-search");
      let tenantExecs = 0;
      const hits = await withOrg(orgA, async (tx) => {
        const probe = new Proxy(tx, {
          get(t, p, r) {
            if (p === "execute") {
              return async (...args: Array<unknown>) => {
                tenantExecs += 1;
                return (t.execute as (...a: Array<unknown>) => unknown)(
                  ...args
                );
              };
            }
            const v = Reflect.get(t, p, r);
            return typeof v === "function"
              ? (v as (...a: Array<unknown>) => unknown).bind(t)
              : v;
          },
        });
        return hybridSearch(
          orgA,
          [],
          "zxqw",
          6,
          probe as never
        );
      });
      expect(tenantExecs).toBeGreaterThanOrEqual(1);
      const contents = hits.map((h) => h.content);
      expect(contents.some((c) => c.includes("alpha"))).toBe(true);
      expect(contents.some((c) => c.includes("beta"))).toBe(false);
    });
  }
);
