import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("jurnal detail & lampiran", () => {
  let orgId: string;
  let kas = "", pendapatan = "";
  let entryId = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Detail")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; pendapatan = byCode["4100"];

    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const r = await db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-02-01`,
        memo: "Jual tunai Boundary",
        lines: [
          { accountId: kas, debitMinor: 250_000n, creditMinor: 0n },
          { accountId: pendapatan, debitMinor: 0n, creditMinor: 250_000n },
        ],
      } as never));
    entryId = r.id;
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  it("menautkan dan membaca dokumen lampiran entri", async () => {
    const { linkDocumentToEntry, listEntryDocuments } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const doc = await admin.query<{ id: string }>(
      `INSERT INTO documents (org_id, storage_key, mime, size_bytes)
       VALUES ($1, 'test/nota.pdf', 'application/pdf', 1234) RETURNING id`,
      [orgId],
    );
    const documentId = doc.rows[0].id;

    await db.transaction((tx) =>
      linkDocumentToEntry(tx as never, { orgId, entryId, documentId, fileName: "nota.pdf" }));
    // idempoten bila ditautkan ulang
    await db.transaction((tx) =>
      linkDocumentToEntry(tx as never, { orgId, entryId, documentId, fileName: "nota.pdf" }));

    const docs = await listEntryDocuments(db, orgId, entryId);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.fileName).toBe("nota.pdf");
    expect(docs[0]?.mime).toBe("application/pdf");
  });

  it("menolak dokumen milik org lain", async () => {
    const { linkDocumentToEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const other = await makeOrg("PT Lain");
    const doc = await admin.query<{ id: string }>(
      `INSERT INTO documents (org_id, storage_key, mime, size_bytes)
       VALUES ($1, 'x/y.pdf', 'application/pdf', 10) RETURNING id`,
      [other.orgId],
    );
    await expect(
      db.transaction((tx) =>
        linkDocumentToEntry(tx as never, { orgId, entryId, documentId: doc.rows[0].id })),
    ).rejects.toThrow("DOKUMEN_TIDAK_DITEMUKAN");
  });

  it("findReversalEntries menemukan jurnal pembalik", async () => {
    const { findReversalEntries, postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    let empty = await findReversalEntries(db, orgId, entryId);
    expect(empty).toHaveLength(0);

    await db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-02-02`,
        memo: "Reversal test",
        lines: [
          { accountId: pendapatan, debitMinor: 250_000n, creditMinor: 0n },
          { accountId: kas, debitMinor: 0n, creditMinor: 250_000n },
        ],
      } as never, { reversalOfId: entryId }));

    const found = await findReversalEntries(db, orgId, entryId);
    expect(found).toHaveLength(1);
    expect(found[0]?.number).toMatch(/^JE-/);
  });
});
