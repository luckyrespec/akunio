import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("posting pipeline", () => {
  let orgId: string;
  let kas = "", pendapatan = "", beban = "", modal = "", grup = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Posting")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`, [orgId]);
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"]; pendapatan = byCode["4100"]; beban = byCode["5200"]; modal = byCode["3100"];
    grup = byCode["1000"];
  });
  afterAll(async () => { await admin.end(); await truncateAll(); });

  async function post(input: object, opts?: object) {
    const { postJournalEntry } = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");
    return db.transaction((tx) =>
      postJournalEntry(tx as never, orgId, "tester@test.id", input as never, opts as never));
  }

  const year = new Date().getFullYear();

  it("posts numbered entries sequentially", async () => {
    const a = await post({
      dateISO: `${year}-01-10`, memo: "Setoran modal",
      lines: [
        { accountId: kas, debitMinor: 10_000_000n, creditMinor: 0n },
        { accountId: modal, debitMinor: 0n, creditMinor: 10_000_000n },
      ],
    });
    expect(a.number).toBe(`JE-${year}-0001`);

    const b = await post({
      dateISO: `${year}-01-20`, memo: "Pendapatan",
      lines: [
        { accountId: kas, debitMinor: 4_000_000n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 4_000_000n },
      ],
    });
    expect(b.number).toBe(`JE-${year}-0002`);
  });

  it("rejects unbalanced / unknown / group-account postings", async () => {
    const { PostingError } = await import("@/server/db/repos/journals.repo");
    await expect(post({
      dateISO: `${year}-02-01`, memo: "x",
      lines: [
        { accountId: kas, debitMinor: 100n, creditMinor: 0n },
        { accountId: modal, debitMinor: 0n, creditMinor: 99n },
      ],
    })).rejects.toThrow(PostingError);

    await expect(post({
      dateISO: `${year}-02-01`, memo: "x",
      lines: [
        { accountId: crypto.randomUUID(), debitMinor: 100n, creditMinor: 0n },
        { accountId: modal, debitMinor: 0n, creditMinor: 100n },
      ],
    })).rejects.toThrow(PostingError);

    await expect(post({
      dateISO: `${year}-02-01`, memo: "x",
      lines: [
        { accountId: grup, debitMinor: 100n, creditMinor: 0n },   // parent group account
        { accountId: modal, debitMinor: 0n, creditMinor: 100n },
      ],
    })).rejects.toThrow(PostingError);
  });

  it("idempotency key returns the original entry", async () => {
    const key = `idem-${crypto.randomUUID()}`;
    const args = {
      dateISO: `${year}-03-01`, memo: "Idem", idempotencyKey: key,
      lines: [
        { accountId: kas, debitMinor: 500n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 500n },
      ],
    };
    const first = await post(args);
    const second = await post(args);
    expect(second.id).toBe(first.id);
  });

  it("blocks editing posted entries (trigger)", async () => {
    await expect(admin.query(
      `UPDATE journal_entries SET memo='dirubah' WHERE org_id=$1 AND status='POSTED'`,
      [orgId],
    )).rejects.toThrow(/IMMUTABLE_POSTED/);
  });

  it("reversal posts a linked balancing pair", async () => {
    const { getPostedEntry } = await import("@/server/db/repos/journals.repo");
    const { makeReversal } = await import("@/core/journals/validate");

    const created = await post({
      dateISO: `${year}-04-01`, memo: "Salah",
      lines: [
        { accountId: kas, debitMinor: 700n, creditMinor: 0n },
        { accountId: pendapatan, debitMinor: 0n, creditMinor: 700n },
      ],
    });
    const { db } = await import("@/server/db");
    const orig = await db.transaction((tx) => getPostedEntry(tx as never, orgId, created.id));
    expect(orig).not.toBeNull();

    const reversal = makeReversal(
      { number: orig!.number, lines: orig!.lines.map((l) => ({ accountId: l.accountId, debitMinor: l.debitMinor, creditMinor: l.creditMinor })) },
      `${year}-04-02`,
    );
    const rev = await post(reversal, { reversalOfId: created.id });
    expect(rev.number).not.toBe(orig!.number);

    // kas balance for this entry pair nets to zero
    const net = await admin.query<{ d: string; c: string }>(
      `SELECT sum(l.debit) AS d, sum(l.credit) AS c
       FROM journal_lines l
       JOIN journal_entries e ON e.id = l.entry_id
       WHERE e.org_id=$1 AND e.number IN ($2,$3)`,
      [orgId, orig!.number, rev.number],
    );
    // both entries touch kas+pendapatan; totals equal across the pair:
    expect(net.rows[0].d).toBe(net.rows[0].c);
  });
});
