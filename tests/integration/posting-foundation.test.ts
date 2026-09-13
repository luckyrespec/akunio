import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
