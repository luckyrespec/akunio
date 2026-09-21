import { describe, it, expect } from "vitest";
import { parseExtractedInvoice, extractInvoice } from "@/server/ai/invoice-extract";
import { invoiceIntakeHandlers } from "@/server/ai/tools/invoice-intake.tools";
import { INVOICE_TOOL_NAMES } from "@/server/ai/agents/split";
import { MUTATING_TOOLS, TOOL_REGISTRY } from "@/server/ai/nara-tools";
import { routeIntent } from "@/server/ai/agents/router";

const RAW_100JT = {
  vendor: "PT ABC",
  invoiceNumber: "INV-ABC-001",
  dateISO: "2026-09-01",
  lines: [{ description: "Kopi susu 1kg", quantity: 2, unitPrice: 50000000 }],
  subtotal: 100000000,
  tax: 11000000,
  total: 111000000,
};

describe("invoice extract (mock + parse)", () => {
  it("parse minor benar untuk 100jt + 11jt = 111jt", () => {
    const parsed = parseExtractedInvoice(RAW_100JT);
    expect(parsed.vendor).toBe("PT ABC");
    expect(parsed.subtotalMinor).toBe(10000000000n);
    expect(parsed.taxMinor).toBe(1100000000n);
    expect(parsed.totalMinor).toBe(11100000000n);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].unitPriceMinor).toBe(5000000000n);
  });

  it("mock deterministik tanpa API key: PT ABC, 1 baris, 100jt/11jt/111jt", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    const prevMock = process.env.AI_MOCK;
    process.env.AI_MOCK = "1";
    try {
      const data = await extractInvoice(Buffer.from("fake-pdf"), "application/pdf", "inv.pdf");
      expect(data.vendor).toBe("PT ABC");
      expect(data.lines).toHaveLength(1);
      expect(data.subtotalMinor).toBe(10000000000n);
      expect(data.taxMinor).toBe(1100000000n);
      expect(data.totalMinor).toBe(11100000000n);
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
      if (prevMock === undefined) delete process.env.AI_MOCK;
      else process.env.AI_MOCK = prevMock;
    }
  });
});

describe("validate_invoice (murni, toleransi nol)", () => {
  it("lolos untuk 100jt + 11jt = 111jt", async () => {
    const out = await invoiceIntakeHandlers.validate_invoice("org-x", "a@b.c", {
      lines: [{ quantity: 2, unitPrice: 50000000 }],
      subtotalText: "100000000",
      taxText: "11000000",
      totalText: "111000000",
    });
    expect(out.success).toBe(true);
  });

  it("tolak selisih 1 rupiah pada total", async () => {
    const out = await invoiceIntakeHandlers.validate_invoice("org-x", "a@b.c", {
      lines: [{ quantity: 2, unitPrice: 50000000 }],
      subtotalText: "100000000",
      taxText: "11000000",
      totalText: "111000001",
    });
    expect(out.success).toBe(false);
    expect(out.error ?? "").toMatch(/111000001|Rp111\.000\.001/);
  });

  it("tolak selisih 1 rupiah pada subtotal vs jumlah baris", async () => {
    const out = await invoiceIntakeHandlers.validate_invoice("org-x", "a@b.c", {
      lines: [{ quantity: 2, unitPrice: 50000000 }],
      subtotalText: "99999999",
      taxText: "11000000",
      totalText: "110999999",
    });
    expect(out.success).toBe(false);
    expect(out.error ?? "").toMatch(/99999999|Rp99\.999\.999/);
  });
});

describe("invoice split (BILL-only, read-only)", () => {
  it("nol MUTATING + semua terdaftar di registry", () => {
    const leak = INVOICE_TOOL_NAMES.filter((n) => MUTATING_TOOLS.has(n));
    expect(leak).toEqual([]);
    for (const n of INVOICE_TOOL_NAMES) {
      expect(TOOL_REGISTRY[n], n).toBeDefined();
    }
  });
});

describe("routeIntent invoice", () => {
  it('"upload invoice PT ABC" → invoice', () => {
    expect(routeIntent("upload invoice PT ABC")).toBe("invoice");
  });
  it('regresi: "kenapa laba turun" → analyst', () => {
    expect(routeIntent("kenapa laba turun")).toBe("analyst");
  });
  it('regresi: "catat bayar sewa" → bookkeeping', () => {
    expect(routeIntent("catat bayar sewa")).toBe("bookkeeping");
  });
  it("analyst menang bila invoice compete dengan laporan", () => {
    expect(routeIntent("buatkan laporan invoice bulan ini")).toBe("analyst");
  });
});
