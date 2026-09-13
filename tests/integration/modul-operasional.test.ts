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
  }
);
