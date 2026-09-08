import { describe, it, expect } from "vitest";
import {
  ALL_NARA_TOOLS,
  SAFE_TOOLS,
  MUTATING_TOOLS,
  naraToolHandlers,
} from "@/server/ai/nara-tools";

/**
 * Penjaga konsistensi registry: setiap tool yang dideklarasikan harus bisa
 * dieksekusi dan terklasifikasi tepat satu kebijakan (kasus nyata:
 * add_service_item pernah tercecer dari kedua set).
 */
describe("nara tools registry", () => {
  const defNames = (ALL_NARA_TOOLS as Array<{ name: string }>).map((d) => d.name);

  it("tidak ada nama tool yang duplikat", () => {
    expect(new Set(defNames).size).toBe(defNames.length);
  });

  it("setiap definisi punya handler", () => {
    for (const name of defNames) {
      expect(naraToolHandlers[name], `handler hilang: ${name}`).toBeTypeOf("function");
    }
  });

  it("setiap nama di SAFE/MUTATING punya definisi + handler, tepat satu set", () => {
    for (const name of [...SAFE_TOOLS, ...MUTATING_TOOLS]) {
      expect(defNames, `definisi hilang: ${name}`).toContain(name);
      expect(naraToolHandlers[name], `handler hilang: ${name}`).toBeTypeOf("function");
    }
    const overlap = [...SAFE_TOOLS].filter((n) => MUTATING_TOOLS.has(n));
    expect(overlap).toEqual([]);
  });

  it("setiap definisi terklasifikasi tepat satu set", () => {
    for (const name of defNames) {
      const inSafe = SAFE_TOOLS.has(name);
      const inMut = MUTATING_TOOLS.has(name);
      expect(inSafe !== inMut, `klasifikasi ganda/hilang: ${name}`).toBe(true);
    }
  });

  it("regresi: add_service_item mutating, tool baru terdaftar", () => {
    expect(MUTATING_TOOLS.has("add_service_item")).toBe(true);
    for (const name of [
      "list_contacts",
      "find_contact",
      "create_contact",
      "update_contact",
      "list_contact_ledgers",
      "get_contact_ledger",
      "get_item_stock_card",
      "list_cash_entries",
      "get_cash_summary",
      "record_cash_entry",
      "list_invoices",
      "get_invoice_detail",
      "list_stock_opnames",
      "create_stock_opname",
      "list_fixed_assets",
      "register_fixed_asset",
    ]) {
      expect(defNames).toContain(name);
      expect(naraToolHandlers[name]).toBeTypeOf("function");
    }
  });
});
