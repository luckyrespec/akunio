import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { contacts, invoices } from "@/server/db/schema/invoicing";
import { postInvoiceToLedger, postInvoicePaymentToLedger } from "@/server/invoicing/posting";
import { accounts } from "@/server/db/schema/org";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import { recordInvoicePaymentRepo } from "@/server/db/repos/invoices.repo";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Invoicing Ledger Posting", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Invoicing Posting Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("posts an invoice to General Ledger as a balanced accrual journal entry", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ orgId, type: "CUSTOMER", name: "PT Sukses Bersama" })
      .returning();

    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        type: "INVOICE",
        invoiceNumber: "INV-2026-0002",
        contactId: c.id,
        issueDate: "2026-09-01",
        dueDate: "2026-09-15",
        subtotalMinor: 100000000n, // Rp 1.000.000
        taxMinor: 11000000n,       // Rp 110.000
        totalMinor: 111000000n,     // Rp 1.110.000
        status: "ISSUED",
      })
      .returning();

    const journalId = await postInvoiceToLedger(db, orgId, inv.id, "test@test.id");
    expect(journalId).toBeDefined();

    // Verify invoice is linked to journalEntryId
    const [updatedInv] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(updatedInv.journalEntryId).toBe(journalId);

    // Verify journal entry lines are balanced
    const lines = await db.select().from(journalLines).where(eq(journalLines.entryId, journalId));
    expect(lines.length).toBeGreaterThanOrEqual(2);

    let totalDebit = 0n;
    let totalCredit = 0n;
    for (const l of lines) {
      totalDebit += BigInt(Math.round(parseFloat(l.debit) * 100));
      totalCredit += BigInt(Math.round(parseFloat(l.credit) * 100));
    }
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(111000000n);
  });

  it("posts an invoice payment to General Ledger as cash receipt journal entry", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ orgId, type: "CUSTOMER", name: "Ibu Maya" })
      .returning();

    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        type: "INVOICE",
        invoiceNumber: "INV-2026-0003",
        contactId: c.id,
        issueDate: "2026-09-01",
        dueDate: "2026-09-15",
        subtotalMinor: 50000000n,
        totalMinor: 50000000n,
        status: "ISSUED",
      })
      .returning();

    const [bankAcc] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1120")));
    expect(bankAcc).toBeDefined();

    const { payment } = await recordInvoicePaymentRepo(db, orgId, {
      invoiceId: inv.id,
      paymentDate: "2026-09-03",
      amountMinor: 50000000n,
      paymentAccountId: bankAcc.id,
    });

    const paymentJournalId = await postInvoicePaymentToLedger(
      db,
      orgId,
      payment.id,
      "test@test.id"
    );
    expect(paymentJournalId).toBeDefined();

    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.entryId, paymentJournalId));
    expect(lines).toHaveLength(2);
  });
});
