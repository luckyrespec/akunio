import { Pool } from "pg";
import "dotenv/config";

function guardTestDb(url: string): string {
  if (!/ledger_test/.test(url)) {
    throw new Error(
      `SAFETY: refusing to touch non-test database (${url}). Run "bun run test:db:setup" first.`,
    );
  }
  return url;
}

// Runtime/tests connect as the non-superuser so RLS applies.
export function getPool(): Pool {
  const url = guardTestDb(
    process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  return new Pool({ connectionString: url });
}

export async function truncateAll(): Promise<void> {
  const admin = new Pool({ connectionString: guardTestDb(process.env.DATABASE_URL!) });
  await admin.query(`
    TRUNCATE tax_summaries, audit_log, journal_lines, journal_entries, journal_seq_counters,
              kas_bank_entries, kas_bank_seq_counters,
              bank_statement_lines, bank_reconciliations,
              journal_documents, documents,
              accounts, fiscal_periods, memberships, organizations,
              org_profiles, onboarding_messages CASCADE
  `);
  await admin.end();
}

export async function makeOrg(name: string): Promise<{ orgId: string }> {
  const admin = new Pool({ connectionString: guardTestDb(process.env.DATABASE_URL!) });
  const r = await admin.query<{ id: string }>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
    [name],
  );
  await admin.end();
  return { orgId: r.rows[0].id };
}
