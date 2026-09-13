import { describe, it, expect } from "vitest";
import {
  matchPickerItems,
  resolvePickerList,
  type PickerCandidate,
} from "@/app/(app)/persediaan/opname/baru/opname-picker";

const items: PickerCandidate[] = [
  { id: "a", code: "BRG-001", name: "Shampo", unit: "pcs", currentQty: "10" },
  { id: "b", code: "BRG-002", name: "Sabun", unit: "pcs", currentQty: "5" },
  { id: "c", code: "MIE-003", name: "Pasta Gigi", unit: "pcs", currentQty: "20" },
];

describe("matchPickerItems", () => {
  it("default abjad A–Z", () => {
    expect(matchPickerItems(items, "", "name").map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("mencari di kode dan nama tanpa peduli kapital", () => {
    expect(matchPickerItems(items, "sHam", "name").map((i) => i.id)).toEqual(["a"]);
    expect(matchPickerItems(items, "mie-", "name").map((i) => i.id)).toEqual(["c"]);
  });

  it("sort stok terbanyak / tersedikit", () => {
    expect(matchPickerItems(items, "", "stock-desc").map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(matchPickerItems(items, "", "stock-asc").map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});

describe("resolvePickerList", () => {
  it("tanpa query tetap tampil halaman 1 (default 10/halaman)", () => {
    const r = resolvePickerList(items, "");
    expect(r.total).toBe(3);
    expect(r.visible.map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(r.totalPages).toBe(1);
    expect(r.page).toBe(1);
  });

  it("pagination memotong dan menjepit halaman", () => {
    const p2 = resolvePickerList(items, "", { pageSize: 2, page: 2 });
    expect(p2.totalPages).toBe(2);
    expect(p2.visible.map((i) => i.id)).toEqual(["a"]);
    expect(p2.startIndex).toBe(2);
    const over = resolvePickerList(items, "", { pageSize: 2, page: 99 });
    expect(over.page).toBe(2);
    const under = resolvePickerList(items, "", { pageSize: 2, page: 0 });
    expect(under.page).toBe(1);
  });

  it("query tanpa hasil", () => {
    const r = resolvePickerList(items, "tidak-ada");
    expect(r.visible).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(1);
  });
});
