import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { contacts } from "@/server/db/schema/invoicing";
import { accounts } from "@/server/db/schema/org";
import { createInvoiceRepo } from "@/server/db/repos/invoices.repo";
import { postInvoiceToLedger } from "@/server/invoicing/posting";
import { toMinor } from "@/server/db/repos/journals.repo";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Invoice Create-With-Posting Flow", () => {
  let orgId: string;
  let contactId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Faktur Baru")).orgId;
    await seedOrgData(orgId);

    const [c] = await db
      .insert(contacts)
      .values({ orgId, type: "CUSTOMER", name: "PT Maju Jaya", paymentTermsDays: 30 })
      .returning();
    contactId = c.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("membuat faktur lalu memposting Dr 1200 / Cr 4100+2200 seperti aksi halaman baru", async () => {
    // 1. Buat faktur (subledger saja, tanpa jurnal)
    const invoice = await createInvoiceRepo(
      db,
      orgId,
      {
        type: "INVOICE",
        contactId,
        issueDate: "2026-09-03",
        dueDate: "2026-10-03",
        notes: "Test halaman baru",
      },
      [
        {
          description: "Jasa Konsultasi",
          quantity: "2",
          unitPriceMinor: 500000000n, // 5.000.000 x 2 = 10.000.000
          discountMinor: 0n,
          taxRatePercent: "11", // PPN 1.100.000
        },
      ],
    );

    expect(invoice.id).toBeDefined();
    expect(invoice.invoiceNumber).toMatch(/^INV-/);
    expect(invoice.journalEntryId).toBeNull();
    expect(invoice.totalMinor).toBe(1110000000n);

    // 2. Posting ke jurnal (urutan yang dipakai createInvoiceWithPostingAction)
    const journalEntryId = await postInvoiceToLedger(db, orgId, invoice.id, "test-user");
    expect(journalEntryId).toBeDefined();

    const [je] = await db.select().from(journalEntries).where(eq(journalEntries.id, journalEntryId));
    expect(je.status).toBe("POSTED");
    expect(je.memo).toContain(invoice.invoiceNumber);

    const lines = await db
      .select({ code: accounts.code, debit: journalLines.debit, credit: journalLines.credit })
      .from(journalLines)
      .innerJoin(accounts, eq(journalLines.accountId, accounts.id))
      .where(eq(journalLines.entryId, journalEntryId));
    expect(lines).toHaveLength(3);

    const leg = (code: string) => lines.find((l) => l.code === code)!;
    expect(toMinor(leg("1200").debit)).toBe(1110000000n); // Dr Piutang: total
    expect(toMinor(leg("4100").credit)).toBe(1000000000n); // Cr Pendapatan: neto
    expect(toMinor(leg("2200").credit)).toBe(110000000n); // Cr PPN Keluaran

    const totalDebit = lines.reduce((s, l) => s + toMinor(l.debit), 0n);
    const totalCredit = lines.reduce((s, l) => s + toMinor(l.credit), 0n);
    expect(totalDebit).toBe(totalCredit);
  });
});
