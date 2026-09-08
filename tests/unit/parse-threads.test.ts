import { describe, expect, it } from "vitest";
import { parseThreadsResponse } from "@/lib/parse-threads";

describe("parseThreadsResponse", () => {
  it("membaca kontrak baru { threads }", () => {
    const out = parseThreadsResponse({ threads: [{ id: "a", title: "Kas", updatedAt: "2026-09-08" }] });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("a");
  });
  it("tahan kontrak lama array mentah", () => {
    const out = parseThreadsResponse([{ id: "b", title: "Lama", updatedAt: "2026-09-07" }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });
  it("buang item tak valid, kembalikan [] untuk bentuk asing", () => {
    expect(parseThreadsResponse({ threads: [{ id: 1 }] })).toEqual([]);
    expect(parseThreadsResponse(null)).toEqual([]);
    expect(parseThreadsResponse({ error: "x" })).toEqual([]);
  });
});
