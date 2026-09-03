import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import {
  createContactRepo,
  listContactsRepo,
  getContactByIdRepo,
} from "@/server/db/repos/contacts.repo";
import {
  createInvoiceRepo,
  listInvoicesRepo,
  getInvoiceByIdRepo,
  recordInvoicePaymentRepo,
  getAgingReportRepo,
} from "@/server/db/repos/invoices.repo";
import { accounts } from "@/server/db/schema/org";
import { eq, and } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Invoicing and Contacts Repositories", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Invoicing Repo Test")).orgId;
    await seedOrgData(orgId);
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("handles full lifecycle: contact CRUD, invoice creation, payment, and aging report", async () => {
    // 1. Create contact
    const contact = await createContactRepo(db, orgId, {
      type: "CUSTOMER",
      name: "CV Mitra Abadi",
      phone: "081999888777",
      email: "mitra@abadi.com",
      paymentTermsDays: 14,
    });
    expect(contact.id).toBeDefined();
    expect(contact.name).toBe("CV Mitra Abadi");

    const contactsList = await listContactsRepo(db, orgId);
    expect(contactsList.length).toBeGreaterThanOrEqual(1);

    // 2. Create invoice with 2 items
    const inv = await createInvoiceRepo(
      db,
      orgId,
      {
        type: "INVOICE",
        invoiceNumber: "INV-2026-0001",
        contactId: contact.id,
        issueDate: "2026-09-01",
        dueDate: "2026-09-15",
        status: "ISSUED",
      },
      [
        {
          description: "Jasa Konsultasi Pajak",
          quantity: "1.00",
          unitPriceMinor: 100000000n, // Rp 1.000.000
          discountMinor: 0n,
          taxRatePercent: "11.00",
        },
        {
          description: "Buku Panduan Akuntansi",
          quantity: "2.00",
          unitPriceMinor: 10000000n, // 2 x Rp 100.000 = Rp 200.000
          discountMinor: 2000000n,   // diskon Rp 20.000
          taxRatePercent: "0.00",
        },
      ]
    );

    expect(inv.id).toBeDefined();
    // Subtotal: 1.000.000 + 200.000 = 1.200.000 (120_000_000n)
    // Discount: 20.000 (2_000_000n)
    // Tax 11% on 1.000.000 = 110.000 (11_000_000n)
    // Total: 1.180.000 + 110.000 = 1.290.000 (129_000_000n)
    expect(inv.totalMinor).toBe(129000000n);
    expect(inv.amountPaidMinor).toBe(0n);
    expect(inv.status).toBe("ISSUED");

    // 3. Get invoice by ID with items and contact
    const loaded = await getInvoiceByIdRepo(db, orgId, inv.id);
    expect(loaded).toBeDefined();
    expect(loaded?.items).toHaveLength(2);
    expect(loaded?.contact.name).toBe("CV Mitra Abadi");

    // 4. Record partial payment (Rp 500.000 = 50_000_000n)
    const [cashAcc] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.orgId, orgId), eq(accounts.code, "1110")));
    expect(cashAcc).toBeDefined();

    const paymentRes = await recordInvoicePaymentRepo(db, orgId, {
      invoiceId: inv.id,
      amountMinor: 50000000n,
      paymentDate: "2026-09-05",
      paymentAccountId: cashAcc.id,
      referenceNumber: "TRF-987654",
      notes: "Pembayaran DP",
    });

    expect(paymentRes.updatedInvoice.amountPaidMinor).toBe(50000000n);
    expect(paymentRes.updatedInvoice.status).toBe("PARTIALLY_PAID");

    // 5. Get Aging report
    const aging = await getAgingReportRepo(db, orgId, "INVOICE");
    expect(aging.totalOutstandingMinor).toBe(79000000n); // 129.000.000 - 50.000.000 = 79.000.000
    expect(aging.buckets).toBeDefined();
  });
});
