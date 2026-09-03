import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { contacts, invoices, invoiceItems } from "@/server/db/schema/invoicing";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Invoicing Database Schema", () => {
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Invoicing Schema Test")).orgId;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("inserts and queries contact, invoice, items, and foreign keys correctly", async () => {
    // 1. Insert contact
    const [c] = await db
      .insert(contacts)
      .values({
        orgId,
        type: "CUSTOMER",
        name: "Toko Berkah Mandiri",
        phone: "081234567890",
        email: "berkah@example.com",
      })
      .returning();
    expect(c.id).toBeDefined();
    expect(c.name).toBe("Toko Berkah Mandiri");

    // 2. Insert invoice
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        type: "INVOICE",
        invoiceNumber: "INV-2026-0001",
        contactId: c.id,
        issueDate: "2026-09-01",
        dueDate: "2026-09-15",
        subtotalMinor: 50000000n, // Rp 500.000
        taxMinor: 5500000n,       // Rp 55.000 (PPN 11%)
        totalMinor: 55500000n,     // Rp 555.000
        status: "ISSUED",
      })
      .returning();
    expect(inv.id).toBeDefined();
    expect(inv.invoiceNumber).toBe("INV-2026-0001");

    // 3. Insert invoice item
    const [item] = await db
      .insert(invoiceItems)
      .values({
        invoiceId: inv.id,
        description: "Kertas HVS A4 80gr (5 rim)",
        quantity: "5.00",
        unitPriceMinor: 10000000n,
        taxRatePercent: "11.00",
        totalMinor: 55500000n,
      })
      .returning();
    expect(item.id).toBeDefined();

    // 4. Query relation
    const foundInv = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(foundInv).toHaveLength(1);
    expect(foundInv[0].totalMinor).toBe(55500000n);
  });
});
