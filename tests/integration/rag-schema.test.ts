import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";

describe("rag schema", () => {
  it("has pgvector and rag tables", async () => {
    const { db } = await import("@/server/db");
    // Vector type may be real extension or text-domain fallback on Windows dev Postgres.
    const typ = await db.execute(sql`SELECT typname FROM pg_type WHERE typname='vector'`);
    const rows = (typ as unknown as { rows: unknown[] }).rows ?? [];
    expect(rows.length).toBe(1);

    // Verify all 5 RAG tables exist
    const tables = await db.execute(sql`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
        AND tablename IN ('ifrs_chunks','tenant_chunks','chat_threads','chat_messages','rag_queue')
    `);
    const tRows = (tables as unknown as { rows: Array<{ tablename: string }> }).rows ?? [];
    expect(tRows.length).toBe(5);
  });
});
