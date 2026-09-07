import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Batas pool eksplisit agar hemat resource baik di Neon serverless
// (koneksi idle menahan compute tetap hidup = CU terbakar) maupun di VPS
// (max_connections Postgres terbatas, dibagi seluruh instance aplikasi).
// statement_timeout memenggal query nyasar sebelum membakar CU/CPU.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: numEnv("PG_POOL_MAX", 10),
  idleTimeoutMillis: numEnv("PG_POOL_IDLE_MS", 30_000),
  connectionTimeoutMillis: numEnv("PG_POOL_CONNECT_TIMEOUT_MS", 10_000),
  statement_timeout: numEnv("PG_STATEMENT_TIMEOUT_MS", 30_000),
});

// Klien idle yang mati diam-diam tidak boleh men-crash proses server.
pool.on("error", (err) => {
  console.error("[db] pool idle client error:", err.message);
});

export const db = drizzle(pool);
export type Db = typeof db;
export { pool };
