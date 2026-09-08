import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { ragQueue, tenantChunks } from "@/server/db/schema/rag";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import { accounts } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { embed } from "./embeddings";
import { chunkJournal } from "./chunking";

/**
 * Kill-switch ingestion RAG per tenant: RAG_TENANT_INDEXING="0" mematikan
 * enqueue (journals/inventory repo) + drain (cron). Dibaca saat dipanggil
 * (bukan saat import) agar test bisa mengubah env di tengah jalan.
 * Default (unset / nilai lain): aktif.
 */
export function isRagTenantIndexingEnabled(): boolean {
  return process.env.RAG_TENANT_INDEXING !== "0";
}

export async function enqueueRagJob(
  q: { execute: (s: unknown) => Promise<unknown>; insert: (t: unknown) => unknown } & Record<string, unknown>,
  orgId: string,
  kind: "JOURNAL" | "ACCOUNT" | "PERIOD_SUMMARY" | "DOCUMENT",
  refId: string,
): Promise<void> {
  // Use raw SQL to avoid needing Queryable typing complexity in call sites
  await (q as unknown as { execute: (s: unknown) => Promise<unknown> }).execute(
    sql`INSERT INTO rag_queue (org_id, kind, ref_id) VALUES (${orgId}, ${kind}, ${refId})`,
  );
}

// Overload for direct db usage
export async function enqueueRagJobDirect(
  orgId: string,
  kind: "JOURNAL" | "ACCOUNT" | "PERIOD_SUMMARY" | "DOCUMENT",
  refId: string,
): Promise<void> {
  await db.execute(sql`INSERT INTO rag_queue (org_id, kind, ref_id) VALUES (${orgId}, ${kind}, ${refId})`);
}

export async function processQueueBatch(limit = 20): Promise<number> {
  // Kill-switch: biarkan antrean utuh, laporkan 0 diproses.
  if (!isRagTenantIndexingEnabled()) return 0;
  const jobs = await db.execute(sql`
    SELECT id, org_id, kind, ref_id, attempts
    FROM rag_queue
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}
  `);
  const rows = (jobs as unknown as { rows: Array<{ id: string; org_id: string; kind: string; ref_id: string; attempts: number }> }).rows ?? [];
  let processed = 0;
  for (const job of rows) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${job.org_id}))`);
        // Re-check job still exists (another worker may have taken it)
        const still = await tx.execute(sql`SELECT id FROM rag_queue WHERE id = ${job.id} FOR UPDATE`);
        const stillRows = (still as unknown as { rows: unknown[] }).rows ?? [];
        if (stillRows.length === 0) return;

        let content = "";
        if (job.kind === "JOURNAL") {
          const entry = await tx.execute(sql`
            SELECT number, entry_date, memo FROM journal_entries WHERE id = ${job.ref_id}
          `);
          const eRows = (entry as unknown as { rows: Array<{ number: string; entry_date: string; memo: string }> }).rows ?? [];
          if (eRows.length > 0) {
            const e = eRows[0];
            const lines = await tx.execute(sql`
              SELECT a.code as account_code, l.debit, l.credit
              FROM journal_lines l JOIN accounts a ON a.id = l.account_id
              WHERE l.entry_id = ${job.ref_id}
            `);
            const lRows = (lines as unknown as { rows: Array<{ account_code: string; debit: string; credit: string }> }).rows ?? [];
            content = chunkJournal({
              number: e.number,
              entryDate: e.entry_date,
              memo: e.memo,
              lines: lRows.map((r) => ({ accountCode: r.account_code, debitText: r.debit, creditText: r.credit })),
            });
          }
        } else {
          content = `${job.kind} ${job.ref_id}`;
        }

        if (!content) {
          await tx.execute(sql`DELETE FROM rag_queue WHERE id = ${job.id}`);
          return;
        }

        const embedding = await embed(content);
        const tsv = content; // store raw; GIN index uses to_tsvector at query time, or store as tsvector via to_tsvector()
        await tx.execute(sql`
          INSERT INTO tenant_chunks (org_id, source_kind, ref_id, content, embedding, tsv)
          VALUES (${job.org_id}, ${job.kind}, ${job.ref_id}, ${content}, ${JSON.stringify(embedding)}, to_tsvector('english', ${content}))
          ON CONFLICT DO NOTHING
        `);
        await tx.execute(sql`DELETE FROM rag_queue WHERE id = ${job.id}`);
        processed++;
      });
    } catch (e) {
      console.error("rag worker job failed", job.id, e);
      await db.execute(sql`UPDATE rag_queue SET attempts = attempts + 1 WHERE id = ${job.id}`);
      // After 3 attempts, leave for manual inspection (don't delete)
      const attempts = job.attempts + 1;
      if (attempts >= 3) {
        // Could mark as failed, but keep for now
      }
    }
  }
  return processed;
}
