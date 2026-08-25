import { describe, it, expect, vi, beforeEach } from "vitest";

function hashToVector(text: string, dim = 768): number[] {
  const vec: number[] = new Array(dim);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let seed = h >>> 0;
  for (let i = 0; i < dim; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    vec[i] = (seed / 0xffffffff) * 2 - 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class {
      models = {
        embedContent: vi.fn(async ({ contents }: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
          const text = contents[0]?.parts[0]?.text ?? "default";
          return { embeddings: [{ values: hashToVector(text) }] };
        }),
      };
    },
  };
});

describe("embed (mocked Gemini)", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });
  it("returns deterministic 768-dim vectors via mocked model", async () => {
    const { embed } = await import("./embeddings");
    const a = await embed("hello world");
    const b = await embed("hello world");
    const c = await embed("different text");
    expect(a.length).toBe(768);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
