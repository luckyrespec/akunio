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

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("postDraftEntry validasi penuh", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await admin.end();
  });

  async function seedLeafOrg(name: string): Promise<{ orgId: string; kas: string; pendapatan: string }> {
    const { orgId } = await makeOrg(name);
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    // 1110 + 4200 selalu leaf di semua varian COA (bukan GROUP).
    return { orgId, kas: byCode["1110"], pendapatan: byCode["4200"] };
  }

  async function createValidDraft(orgId: string, kas: string, pendapatan: string) {
    const { createDraftJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      createDraftJournalEntry(tx as never, orgId, {
        dateISO: `${year}-02-10`,
        memo: "draf valid",
        lines: [
          { accountId: kas, debitMinor: 1_000_000n, creditMinor: 0n },
          { accountId: pendapatan, debitMinor: 0n, creditMinor: 1_000_000n },
        ],
      } as never));
  }

  it("draf tak-seimbang ditolak saat posting", async () => {
    const { orgId, kas, pendapatan } = await seedLeafOrg("DrafUnbalanced Co");
    const draft = await createValidDraft(orgId, kas, pendapatan);
    // createDraftJournalEntry memvalidasi saat pembuatan, jadi selipkan
    // ketidakseimbangan langsung via SQL (draf masih editable) sebelum posting.
    await admin.query(
      `UPDATE journal_lines SET debit = '20000.00' WHERE entry_id = $1 AND position = 0`,
      [draft.id],
    );
    const { postDraftEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    await expect(db.transaction((tx) => postDraftEntry(tx as never, orgId, "a@b.c", draft.id)))
      .rejects.toThrow("UNBALANCED");
  });

  it("draf akun grup/arsip ditolak saat posting", async () => {
    const { postDraftEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");

    // Kasus grup: arahkan satu baris draf valid ke akun induk (punya anak).
    const g = await seedLeafOrg("DrafGrup Co");
    const draftG = await createValidDraft(g.orgId, g.kas, g.pendapatan);
    const parent = await admin.query<{ id: string }>(
      `SELECT p.id FROM accounts p WHERE p.org_id = $1
       AND EXISTS (SELECT 1 FROM accounts c WHERE c.org_id = $1 AND c.parent_code = p.code)
       LIMIT 1`,
      [g.orgId],
    );
    expect(parent.rows[0]?.id).toBeTruthy();
    await admin.query(
      `UPDATE journal_lines SET account_id = $2 WHERE entry_id = $1 AND position = 1`,
      [draftG.id, parent.rows[0].id],
    );
    await expect(db.transaction((tx) => postDraftEntry(tx as never, g.orgId, "a@b.c", draftG.id)))
      .rejects.toThrow("GROUP_ACCOUNT");

    // Kasus arsip: buat draf valid lalu arsipkan akunnya, baru posting.
    const a = await seedLeafOrg("DrafArsip Co");
    const draftA = await createValidDraft(a.orgId, a.kas, a.pendapatan);
    await admin.query(`UPDATE accounts SET archived_at = now() WHERE id = $1`, [a.kas]);
    await expect(db.transaction((tx) => postDraftEntry(tx as never, a.orgId, "a@b.c", draftA.id)))
      .rejects.toThrow("ARCHIVED_ACCOUNT");
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("idempotency ujung-ke-ujung + reverse idempoten", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await admin.end();
  });

  async function seedLeafOrg(name: string): Promise<{ orgId: string; kas: string; pendapatan: string }> {
    const { orgId } = await makeOrg(name);
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    // 1110 + 4200 selalu leaf di semua varian COA (bukan GROUP).
    return { orgId, kas: byCode["1110"], pendapatan: byCode["4200"] };
  }

  // Helper test lokal: posting 2 baris seimbang via postJournalEntry
  // dengan idempotencyKey eksplisit (pola byCode seperti suite lain).
  async function postWithKey(orgId: string, kas: string, pendapatan: string, key: string) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-02-10`,
        memo: "idem",
        idempotencyKey: key,
        lines: [
          { accountId: kas, debitMinor: 1_000_000n, creditMinor: 0n },
          { accountId: pendapatan, debitMinor: 0n, creditMinor: 1_000_000n },
        ],
      } as never));
  }

  it("double postJournalEntry key sama kembali existing", async () => {
    const { orgId, kas, pendapatan } = await seedLeafOrg("Idem Co");
    const p1 = await postWithKey(orgId, kas, pendapatan, "k-1");
    const p2 = await postWithKey(orgId, kas, pendapatan, "k-1");
    expect(p2.id).toBe(p1.id);
  });

  it("reverse ganda kembali reversal yang sama", async () => {
    const { orgId, kas, pendapatan } = await seedLeafOrg("Reverse Idem Co");
    const posted = await postWithKey(orgId, kas, pendapatan, "k-seed-reverse");
    process.env.TEST_CTX_ORG = orgId;
    try {
      const { reverseEntryAction } = await import("@/server/actions/journal.actions");
      const r1 = await reverseEntryAction(posted.id, `${year}-02-11`);
      expect(r1.ok).toBe(true);
      expect(r1.id).toBeTruthy();
      const r2 = await reverseEntryAction(posted.id, `${year}-02-11`);
      expect(r2.ok).toBe(true);
      expect(r2.id).toBe(r1.id);
    } finally {
      delete process.env.TEST_CTX_ORG;
    }
  });
});

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("dedup baris pelunasan (Ruling R8)", () => {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await truncateAll();
    await admin.end();
  });

  async function seedOrgWithKas(name: string): Promise<{ orgId: string; kas: string }> {
    const { orgId } = await makeOrg(name);
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    // 1110 selalu leaf di semua varian COA (bukan GROUP).
    return { orgId, kas: byCode["1110"] as string };
  }

  async function makeInvoice(orgId: string, contactId: string, n: string) {
    const { createInvoiceRepo } = await import("@/server/db/repos/invoices.repo");
    const { db } = await import("@/server/db");
    return createInvoiceRepo(db as never, orgId, {
      type: "INVOICE",
      invoiceNumber: n,
      contactId,
      issueDate: "2026-09-01",
      dueDate: "2026-09-15",
      status: "ISSUED",
    }, [{
      description: "Jasa",
      quantity: "1.00",
      unitPriceMinor: 10_000_000n,
      discountMinor: 0n,
      taxRatePercent: "0.00",
    }]);
  }

  it("double-submit pelunasan satu baris satu jurnal", async () => {
    const { orgId, kas } = await seedOrgWithKas("R8 Pay Co");
    const { createContactRepo } = await import("@/server/db/repos/contacts.repo");
    const { db } = await import("@/server/db");
    const contact = await createContactRepo(db as never, orgId, { type: "CUSTOMER", name: "PT R8" });
    const inv = await makeInvoice(orgId, contact.id, "INV-R8-0001");
    const { recordInvoicePaymentRepo } = await import("@/server/db/repos/invoices.repo");
    const { postInvoicePaymentToLedger } = await import("@/server/invoicing/posting");
    const base = {
      invoiceId: inv.id,
      paymentDate: "2026-09-03",
      amountMinor: 5_000_000n,
      paymentAccountId: kas,
      idempotencyKey: "pay-1",
    };
    const p1 = await recordInvoicePaymentRepo(db as never, orgId, base);
    const p2 = await recordInvoicePaymentRepo(db as never, orgId, base);
    expect(p2.payment.id).toBe(p1.payment.id);
    expect(p2.updatedInvoice.amountPaidMinor).toBe(p1.updatedInvoice.amountPaidMinor);
    const cnt = await admin.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM invoice_payments WHERE invoice_id=$1`, [inv.id]);
    expect(cnt.rows[0].c).toBe(1);
    const j1 = await postInvoicePaymentToLedger(db as never, orgId, p1.payment.id, "tester@test.id");
    const j2 = await postInvoicePaymentToLedger(db as never, orgId, p2.payment.id, "tester@test.id");
    expect(j2).toBe(j1);
  });

  it("key sama di invoice berbeda → record berbeda (unik per invoice)", async () => {
    const { orgId, kas } = await seedOrgWithKas("R8 Scope Co");
    const { createContactRepo } = await import("@/server/db/repos/contacts.repo");
    const { db } = await import("@/server/db");
    const contact = await createContactRepo(db as never, orgId, { type: "CUSTOMER", name: "PT R8 Scope" });
    const invA = await makeInvoice(orgId, contact.id, "INV-R8-0002");
    const invB = await makeInvoice(orgId, contact.id, "INV-R8-0003");
    const { recordInvoicePaymentRepo } = await import("@/server/db/repos/invoices.repo");
    const pay = (invoiceId: string) => recordInvoicePaymentRepo(db as never, orgId, {
      invoiceId,
      paymentDate: "2026-09-03",
      amountMinor: 5_000_000n,
      paymentAccountId: kas,
      idempotencyKey: "pay-shared",
    });
    const pa = await pay(invA.id);
    const pb = await pay(invB.id);
    expect(pb.payment.id).not.toBe(pa.payment.id);
    for (const inv of [invA, invB]) {
      const cnt = await admin.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM invoice_payments WHERE invoice_id=$1`, [inv.id]);
      expect(cnt.rows[0].c).toBe(1);
    }
  });
});
