import { describe, it, expect } from "vitest";
describe("toolchain", () => {
  it("runs vitest with alias", async () => {
    const m = await import("@/core/sanity");
    expect(m.truth()).toBe(true);
  });
});
