import { describe, it, expect } from "vitest";
import { dailyInsight } from "@/core/kas-bank/insights";

describe("dailyInsight", () => {
  it("deterministik untuk tanggal yang sama", () => {
    const a = dailyInsight(new Date("2026-09-06"));
    const b = dailyInsight(new Date("2026-09-06"));
    expect(a).toEqual(b);
  });
  it("mengembalikan judul, isi, dan sumber", () => {
    const i = dailyInsight(new Date("2026-09-06"));
    expect(i.title.length).toBeGreaterThan(0);
    expect(i.body.length).toBeGreaterThan(0);
    expect(i.source).toContain("SAK EMKM");
  });
  it("bervariasi sepanjang tahun", () => {
    const titles = new Set(
      Array.from({ length: 30 }, (_, k) =>
        dailyInsight(new Date(2026, 0, k + 1)).title
      )
    );
    expect(titles.size).toBeGreaterThan(1);
  });
});
