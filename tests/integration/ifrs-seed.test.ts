import { describe, it, expect } from "vitest";

describe("ifrs seed", () => {
  it("populates ifrs_chunks", async () => {
    process.env.AI_MOCK = "1";
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
