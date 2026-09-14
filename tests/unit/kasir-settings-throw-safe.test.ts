import { describe, expect, it, vi } from "vitest";

// Level termurah yang deterministik: panggil server component KasirPage langsung
// dengan getInventorySettings di-mock melempar — tanpa DB, tanpa jsdom.
// KasirShell di-stub agar tree klien (next/navigation) tak ikut ke-load;
// yang diuji adalah kode asli page: try/catch + fallback + tetap render.
vi.mock("@/server/auth/guard", () => ({
  requireContext: async () => ({ orgId: "org-c5-test" }),
}));

vi.mock("@/server/db", () => ({
  // withOrg butuh db.transaction + tx.execute(set_config): passthrough anti-DB.
  db: {
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => ({ rows: [] }) }),
  },
}));

vi.mock("@/server/actions/pos.actions", () => ({
  getPosCashAccountsAction: async () => ({ ok: true as const, data: [] }),
  getPosCatalogAction: async () => ({ ok: true as const, data: [] }),
  getOpenShiftsAction: async () => ({ ok: true as const, data: [] }),
}));

vi.mock("@/server/db/repos/inventory.repo", () => ({
  getInventorySettings: async () => {
    throw new Error("DB down");
  },
}));

vi.mock("@/app/kasir/_components/kasir-shell", () => ({
  KasirShell: (props: { recordingMethod: string }) => ({ __stubKasirShell: true, props }),
}));

import KasirPage from "@/app/kasir/page";

describe("KasirPage settings throw-safe (C5 fix1)", () => {
  it("throw getInventorySettings → halaman tetap render dengan PERPETUAL (tanpa catatan)", async () => {
    const el = (await KasirPage()) as unknown as {
      props: { recordingMethod?: unknown };
    };
    expect(el.props.recordingMethod).toBe("PERPETUAL");
  });
});
