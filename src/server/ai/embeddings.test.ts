import { describe, it, expect } from "vitest";
import { embed } from "./embeddings";

process.env.AI_MOCK = "1";

describe("embed", () => {
  it("returns deterministic 768-dim vectors", async () => {
    const a = await embed("hello world");
    const b = await embed("hello world");
    const c = await embed("different text");
    expect(a.length).toBe(768);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
