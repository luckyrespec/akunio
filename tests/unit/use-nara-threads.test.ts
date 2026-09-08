import { describe, expect, it, afterEach, vi } from "vitest";
import { parseThreadsResponse } from "@/lib/parse-threads";

afterEach(() => vi.unstubAllGlobals());

describe("threads sync", () => {
  it("fetch objek dibaca sama dengan fetch array lama", () => {
    const objShape: unknown = { threads: [{ id: "a", title: "A", updatedAt: "2026-09-08" }] };
    const arrShape: unknown = [{ id: "a", title: "A", updatedAt: "2026-09-08" }];
    expect(parseThreadsResponse(objShape)).toEqual(parseThreadsResponse(arrShape));
  });
  it("prepend thread baru di depan", () => {
    const prev = parseThreadsResponse([{ id: "a", title: "A", updatedAt: "2026-09-08" }]);
    const next = [{ id: "n", title: "Baru", updatedAt: new Date().toISOString() }, ...prev];
    expect(next[0].id).toBe("n");
    expect(next).toHaveLength(2);
  });
});
