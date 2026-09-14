import { describe, it, expect } from "vitest";
import {
  ALL_NARA_TOOLS,
  SAFE_TOOLS,
  MUTATING_TOOLS,
  TOOL_REGISTRY,
  executeNaraTool,
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

describe("nara tools single-source registry", () => {
  it("tiap entri punya def valid + handler fungsi, kunci sama dengan nama def", () => {
    const keys = Object.keys(TOOL_REGISTRY);
    expect(keys.length).toBeGreaterThan(0);
    for (const [key, entry] of Object.entries(TOOL_REGISTRY)) {
      expect(entry.def, `def hilang: ${key}`).toBeTypeOf("object");
      expect(entry.def.type, `tipe salah: ${key}`).toBe("function");
      expect(entry.def.name, `nama tak cocok: ${key}`).toBe(key);
      expect(entry.def.description, `deskripsi hilang: ${key}`).toBeTypeOf("string");
      expect(entry.def.parameters, `parameters hilang: ${key}`).toBeTypeOf("object");
      expect(entry.def.parameters.type, `parameters.type salah: ${key}`).toBe("object");
      expect(entry.def.parameters.properties, `properties hilang: ${key}`).toBeTypeOf("object");
      expect(entry.handler, `handler hilang: ${key}`).toBeTypeOf("function");
    }
  });

  it("ALL_NARA_TOOLS diturunkan dari registry (def referensi sama, urutan sama)", () => {
    const defs = ALL_NARA_TOOLS as Array<{ name: string }>;
    const keys = Object.keys(TOOL_REGISTRY);
    expect(defs.length).toBe(keys.length);
    expect(defs.map((d) => d.name)).toEqual(keys);
    for (const [i, key] of keys.entries()) {
      expect(defs[i], `def bukan referensi registry: ${key}`).toBe(TOOL_REGISTRY[key]?.def);
    }
  });

  it("naraToolHandlers diturunkan dari registry (handler referensi sama)", () => {
    const keys = Object.keys(TOOL_REGISTRY).sort();
    expect(Object.keys(naraToolHandlers).sort()).toEqual(keys);
    for (const key of keys) {
      expect(naraToolHandlers[key], `handler bukan referensi registry: ${key}`).toBe(
        TOOL_REGISTRY[key]?.handler,
      );
    }
  });

  it("executeNaraTool resolve dari registry yang sama (bukan daftar kedua)", async () => {
    const unknown = await executeNaraTool("org-x", "a@b.c", "__tidak_ada__", {});
    expect(unknown.success).toBe(false);
    expect(unknown.error).toBe("Tool __tidak_ada__ tidak dikenali.");

    // Entri yang hanya ada di naraToolHandlers TAK BOLEH bisa dieksekusi.
    naraToolHandlers["__uji_drift__"] = async () => ({ success: true, data: { via: "handlers" } });
    try {
      const drift = await executeNaraTool("org-x", "a@b.c", "__uji_drift__", {});
      expect(drift.success).toBe(false);
      expect(drift.error).toBe("Tool __uji_drift__ tidak dikenali.");
    } finally {
      delete naraToolHandlers["__uji_drift__"];
    }

    // Entri registry SEMENTARA bisa dieksekusi + BigInt dinetralkan di jalur baru.
    TOOL_REGISTRY["__uji_registry__"] = {
      def: {
        type: "function",
        name: "__uji_registry__",
        description: "Tool uji sementara single-source.",
        parameters: { type: "object", properties: {}, required: [] },
      },
      handler: async () => ({ success: true, data: { total: 10n } }),
    };
    try {
      const routed = await executeNaraTool("org-x", "a@b.c", "__uji_registry__", {});
      expect(routed.success).toBe(true);
      expect(routed.data).toEqual({ total: "10" });
    } finally {
      delete TOOL_REGISTRY["__uji_registry__"];
    }
    const gone = await executeNaraTool("org-x", "a@b.c", "__uji_registry__", {});
    expect(gone.success).toBe(false);
  });
});
