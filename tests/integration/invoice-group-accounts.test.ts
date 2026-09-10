import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { db } from "@/server/db";
import { contacts, invoices } from "@/server/db/schema/invoicing";
import { accounts } from "@/server/db/schema/org";
import { postInvoiceToLedger } from "@/server/invoicing/posting";
import { createInvoiceRepo } from "@/server/db/repos/invoices.repo";
import { createInventoryItem } from "@/server/db/repos/inventory.repo";
import { getEntryWithLines } from "@/server/db/repos/journals.repo";

/** COA onboarding (cth. Kuliner): 4100/5100 adalah akun GRUP (punya anak),
 *  jadi fallback kode mentah harus memilih detail postable, bukan induknya. */
describe.skipIf(process.env.SKIP_DB_TESTS === "1")("posting faktur di COA grup", () => {
  let orgId: string;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Kuliner Grup")).orgId;
    await seedOrgData(orgId);
    await db.insert(accounts).values([
      { orgId, code: "4150", name: "Pendapatan Makanan & Minuman", type: "PENDAPATAN", normal: "K", parentCode: "4100" },
      { orgId, code: "5140", name: "Beban Bahan Baku", type: "BEBAN", normal: "D", parentCode: "5100" },
    ]);
  });
  afterAll(async () => { await truncateAll(); });

  async function newCustomer(name: string) {
    const [c] = await db.insert(contacts).values({ orgId, type: "CUSTOMER", name }).returning();
    return c;
  }

  it("faktur tanpa baris memakai detail pendapatan, bukan grup 4100", async () => {
    const c = await newCustomer("Kantin A");
    const [inv] = await db
      .insert(invoices)
      .values({
        orgId,
        type: "INVOICE",
        invoiceNumber: `INV-${year}-0901`,
        contactId: c.id,
        issueDate: `${year}-09-01`,
        dueDate: `${year}-09-15`,
        subtotalMinor: 1_000_000_000n,
        totalMinor: 1_000_000_000n,
        status: "ISSUED",
      })
      .returning();
    const journalId = await postInvoiceToLedger(db, orgId, inv.id, "test@test.id");
    const entry = await db.transaction((tx) => getEntryWithLines(tx as never, orgId, journalId));
    const codes = entry!.lines.map((l) => l.accountCode);
    expect(codes).toContain("4150");
    expect(codes).not.toContain("4100");
  });

  it("jual barang memakai 4150 + HPP 5140 dan mengurangi stok", async () => {
    const c = await newCustomer("Kantin B");
    const item = await createInventoryItem(db, orgId, {
      name: "Ayam Geprek",
      initialQty: 10,
      initialCostMinor: 15_000_000n,
      standardSellingPriceMinor: 25_000_000n,
    });
    const inv = await createInvoiceRepo(db, orgId, {
      type: "INVOICE",
      invoiceNumber: `INV-${year}-0902`,
      contactId: c.id,
      issueDate: `${year}-09-02`,
      dueDate: `${year}-09-16`,
    }, [
      { description: "Ayam Geprek", quantity: 2, unitPriceMinor: 25_000_000n, catalogItemId: item.id },
    ]);
    const journalId = await postInvoiceToLedger(db, orgId, inv.id, "test@test.id");
    const entry = await db.transaction((tx) => getEntryWithLines(tx as never, orgId, journalId));
    const codes = entry!.lines.map((l) => l.accountCode);
    expect(codes).toContain("4150");
    expect(codes).toContain("5140");
    const debit = entry!.lines.reduce((a, l) => a + l.debitMinor, 0n);
    expect(debit).toBe(entry!.lines.reduce((a, l) => a + l.creditMinor, 0n));
  });

  it("beli jasa memakai beban postable, bukan grup 5100", async () => {
    const c = await newCustomer("Bengkel C");
    const jasa = await createInventoryItem(db, orgId, { name: "Servis Kompor", itemType: "JASA" });
    const inv = await createInvoiceRepo(db, orgId, {
      type: "BILL",
      invoiceNumber: `BILL-${year}-0901`,
      contactId: c.id,
      issueDate: `${year}-09-03`,
      dueDate: `${year}-09-17`,
    }, [
      { description: "Servis Kompor", quantity: 1, unitPriceMinor: 30_000_000n, catalogItemId: jasa.id },
    ]);
    const journalId = await postInvoiceToLedger(db, orgId, inv.id, "test@test.id");
    const entry = await db.transaction((tx) => getEntryWithLines(tx as never, orgId, journalId));
    const codes = entry!.lines.map((l) => l.accountCode);
    expect(codes).not.toContain("5100");
    const debit = entry!.lines.reduce((a, l) => a + l.debitMinor, 0n);
    expect(debit).toBe(entry!.lines.reduce((a, l) => a + l.creditMinor, 0n));
  });
});
