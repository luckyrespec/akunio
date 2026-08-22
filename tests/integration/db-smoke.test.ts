import "dotenv/config";
import { describe, it, expect } from "vitest";

const d = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
describe.skipIf(!d || process.env.SKIP_DB_TESTS === "1")("db", () => {
  it("connects", async () => {
    process.env.DATABASE_URL = d;
    const { pool } = await import("@/server/db");
    const r = await pool.query("select version()");
    expect(r.rows[0].version).toContain("PostgreSQL");
    await pool.end();
  });
});
