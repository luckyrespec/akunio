import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
describe("doctor schema", () => {
  it("has ai_findings and ai_proposals tables with RLS", async () => {
    const { db } = await import("@/server/db");
    const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('ai_findings','ai_proposals')`);
    const rows = (tables as unknown as { rows: Array<{ tablename: string }> }).rows;
    expect(rows.length).toBe(2);
    const policies = await db.execute(sql`SELECT policyname FROM pg_policies WHERE tablename IN ('ai_findings','ai_proposals')`);
    const pRows = (policies as unknown as { rows: Array<{ policyname: string }> }).rows;
    expect(pRows.length).toBe(2);
  });
});
