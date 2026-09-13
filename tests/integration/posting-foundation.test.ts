import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import {
  createInvoiceRepo,
  getNextInvoiceNumberRepo,
} from "@/server/db/repos/invoices.repo";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("check tunggal je_source", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  it("definisi kanonis memuat 12 source", async () => {
    const r = await admin.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='je_source_chk'`);
    expect(r.rows).toHaveLength(1);
    for (const s of ["KAS_TERIMA", "KAS_BAYAR", "KAS_TRANSFER", "POS_SELISIH", "DIMUKA", "TAX"]) {
      expect(r.rows[0].def).toContain(s);
    }
    await admin.end();
    await truncateAll();
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("penomoran faktur anti-race", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await admin.end();
  });

  it("nomor faktur naik berurutan dalam satu tahun", async () => {
    const { orgId } = await makeOrg("Nomor Co");
    const contact = await createContactRepo(db, orgId, {
      type: "CUSTOMER",
      name: "PT Nomor",
    });
    const a = await db.transaction((tx) => getNextInvoiceNumberRepo(tx as never, orgId, "INVOICE", 2026));
    await db.transaction((tx) => createInvoiceRepo(tx as never, orgId, {
      type: "INVOICE",
      invoiceNumber: a,
      contactId: contact.id,
      issueDate: "2026-03-01",
      dueDate: "2026-03-15",
    }, []));
    const b = await db.transaction((tx) => getNextInvoiceNumberRepo(tx as never, orgId, "INVOICE", 2026));
    expect(a).toBe("INV-2026-0001");
    expect(b).toBe("INV-2026-0002");
    // Counter dipakai sebagai sumber penomoran (anti-race), bukan scan tabel.
    const c = await admin.query(
      `SELECT last_seq FROM invoice_seq_counters WHERE org_id = $1 AND year = 2026 AND type = 'INVOICE'`,
      [orgId],
    );
    expect(Number(c.rows[0]?.last_seq)).toBe(2);
  });

  it("counter punya RLS org-isolation", async () => {
    const r = await admin.query(
      `SELECT tablename FROM pg_policies WHERE tablename IN ('invoice_seq_counters','ast_seq_counters')`);
    expect(r.rows.map((x) => x.tablename).sort()).toEqual(["ast_seq_counters", "invoice_seq_counters"]);
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("tutup loophole trigger + FK reversal", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await admin.end();
  });

  async function seedPostedLinePlusDraft(): Promise<{ postedLineId: string; draftEntryId: string }> {
    const { orgId } = await makeOrg("Loophole Co");
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    // 1110 + 4200 selalu leaf di semua varian COA (bukan GROUP).
    const kas = byCode["1110"];
    const pendapatan = byCode["4200"];
    const { postJournalEntry, createDraftJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    const balanced = (memo: string, dateISO: string) => ({
      dateISO, memo,
      lines: [
        { accountId: kas, debitMinor: 1_000_000n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 1_000_000n },
      ],
    });
    const first = await db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", balanced("posted satu", `${year}-02-10`) as never));
    await db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", balanced("posted dua", `${year}-02-10`) as never));
    const draft = await db.transaction((tx) =>
      createDraftJournalEntry(tx as never, orgId, balanced("draf tujuan", `${year}-02-11`) as never));
    const line = await admin.query<{ id: string }>(
      `SELECT id FROM journal_lines WHERE entry_id=$1 ORDER BY position LIMIT 1`, [first.id]);
    return { postedLineId: line.rows[0].id, draftEntryId: draft.id };
  }

  it("pindah baris POSTED ke draf ditolak trigger", async () => {
    const { postedLineId, draftEntryId } = await seedPostedLinePlusDraft();
    await expect(admin.query(
      `UPDATE journal_lines SET entry_id=$2 WHERE id=$1`, [postedLineId, draftEntryId],
    )).rejects.toThrow();
  });

  async function postRandomReversalWithBogusTarget(orgId: string): Promise<void> {
    const p = await admin.query<{ id: string }>(
      `SELECT id FROM fiscal_periods WHERE org_id=$1 ORDER BY name LIMIT 1`, [orgId]);
    await admin.query(
      `INSERT INTO journal_entries (org_id, period_id, seq, number, entry_date, memo, status, reversal_of_id)
       VALUES ($1, $2, 4242, 'JE-BOGUS-1', $3, 'reversal bogus', 'DRAFT', $4)`,
      [orgId, p.rows[0].id, `${year}-02-12`, randomUUID()],
    );
  }

  it("reversal_of_id tanpa target ditolak FK", async () => {
    const { orgId } = await makeOrg("FK Co");
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    await expect(postRandomReversalWithBogusTarget(orgId)).rejects.toThrow();
  });
});
