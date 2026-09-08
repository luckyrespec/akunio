import { describe, it, expect } from "vitest";
import { filterInvoices } from "@/components/invoicing/invoice-dashboard";
import type { InvoiceRow } from "@/components/invoicing/invoice-list";

function row(over: Partial<InvoiceRow> & { invoiceNumber: string; contactName: string }): InvoiceRow {
  return {
    id: over.invoiceNumber,
    type: "INVOICE",
    contactId: "c1",
    issueDate: "2026-09-01",
    dueDate: "2026-09-15",
    totalMinor: 1_000_000n,
    amountPaidMinor: 0n,
    status: "ISSUED",
    ...over,
  };
}

const rows = [
  row({ invoiceNumber: "INV-2026-0001", contactName: "Toko Maju", status: "ISSUED" }),
  row({ invoiceNumber: "INV-2026-0002", contactName: "Warung Budi", status: "OVERDUE" }),
  row({ invoiceNumber: "INV-2026-0003", contactName: "Toko Maju Jaya", status: "PAID" }),
];

describe("filterInvoices", () => {
  it("tanpa filter mengembalikan semua", () => {
    expect(filterInvoices(rows, { query: "", status: null })).toHaveLength(3);
  });
  it("query cocok nomor (tak peduli kapital)", () => {
    expect(filterInvoices(rows, { query: "inv-2026-0002", status: null }).map((r) => r.id)).toEqual([
      "INV-2026-0002",
    ]);
  });
  it("query cocok sebagian nama kontak", () => {
    expect(filterInvoices(rows, { query: "maju", status: null })).toHaveLength(2);
  });
  it("status saja", () => {
    expect(filterInvoices(rows, { query: "", status: "OVERDUE" }).map((r) => r.id)).toEqual([
      "INV-2026-0002",
    ]);
  });
  it("query + status digabung", () => {
    expect(filterInvoices(rows, { query: "maju", status: "PAID" }).map((r) => r.id)).toEqual([
      "INV-2026-0003",
    ]);
    expect(filterInvoices(rows, { query: "budi", status: "PAID" })).toHaveLength(0);
  });
});
