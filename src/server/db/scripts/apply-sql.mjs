import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import "dotenv/config";

const dir = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  process.stdout.write(`applying ${f} ... `);
  try {
    await pool.query(sql);
    console.log("ok");
  } catch (e) {
    if (String(e.message).includes("already exists")) console.log("skipped (exists)");
    else throw e;
  }
}
await pool.end();
