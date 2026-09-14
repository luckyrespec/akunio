import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("ai tables + rls", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  let orgId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT AI")).orgId;
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("inserts document and draft with defaults", async () => {
    const doc = await admin.query(
      `INSERT INTO documents (org_id, storage_key, mime, size_bytes)
       VALUES ($1,'orgs/x/1.pdf','application/pdf',10) RETURNING id, status`, [orgId]);
    expect(doc.rows[0].status).toBe("UPLOADED");

    const draft = await admin.query(
      `INSERT INTO ai_drafts (org_id, kind, document_id, draft, model)
       VALUES ($1,'DOCUMENT',$2,'{"lines":[]}','gemini-3.5-flash') RETURNING id, status`,
      [orgId, doc.rows[0].id]);
    expect(draft.rows[0].status).toBe("PENDING");

    // posted_entry_id references an empty journal_entries table → FK violation
    await expect(admin.query(
      `UPDATE ai_drafts SET posted_entry_id = $2 WHERE id = $1`,
      [draft.rows[0].id, draft.rows[0].id],
    )).rejects.toThrow();
  });

  // Catatan: asersi isolasi RLS documents PINDAH ke
  // tests/integration/rls-isolation.test.ts (kasus 6, peran NOBYPASSRLS
  // + kontrol positif dua org).
});
