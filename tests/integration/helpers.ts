import { Pool } from "pg";
import "dotenv/config";

// Runtime/tests connect as the non-superuser so RLS applies.
export function getPool(): Pool {
  const url = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL!;
  return new Pool({ connectionString: url });
}

export async function truncateAll(): Promise<void> {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  await admin.query(`
    TRUNCATE audit_log, journal_lines, journal_entries, journal_seq_counters,
             accounts, fiscal_periods, memberships, organizations CASCADE
  `);
  await admin.end();
}

export async function makeOrg(name: string): Promise<{ orgId: string }> {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const r = await admin.query<{ id: string }>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
    [name],
  );
  await admin.end();
  return { orgId: r.rows[0].id };
}
