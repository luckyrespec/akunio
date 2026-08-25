import { describe, it, expect } from "vitest";

import { vi } from "vitest";
function hashToVector(text: string, dim = 768): number[] {
  const vec: number[] = new Array(dim);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let seed = h >>> 0;
  for (let i = 0; i < dim; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; vec[i] = (seed / 0xffffffff) * 2 - 1; }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return vec.map((v) => v / (norm || 1));
}
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      embedContent: vi.fn(async ({ contents }: { contents: Array<{ parts: Array<{ text: string }> }> }) => {
        const text = contents[0]?.parts[0]?.text ?? "default";
        return { embeddings: [{ values: hashToVector(text) }] };
      }),
    };
  },
}));
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "test-key";

describe("ifrs seed", () => {
  it("populates ifrs_chunks", async () => {
    const { seedIfsChunks } = await import("@/server/ai/seed-ifrs");
    const n = await seedIfsChunks();
    expect(n).toBeGreaterThan(0);

    const { db } = await import("@/server/db");
    const { sql } = await import("drizzle-orm");
    const res = await db.execute(sql`SELECT count(*)::int AS n FROM ifrs_chunks`);
    const count = (res as unknown as { rows: Array<{ n: number }> }).rows[0].n;
    expect(count).toBeGreaterThan(0);

    // Idempotent second run
    const n2 = await seedIfsChunks();
    expect(n2).toBe(count);
  });
});
