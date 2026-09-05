import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { resolveRelatedRefs } from "@/app/(app)/temuan/finding-meta";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("temuan detail related", () => {
  let orgId: string;
  let kas = "";
  let modal = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Temuan")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string }>(
      `SELECT id, code FROM accounts WHERE org_id=$1`,
      [orgId],
    );
    const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
    kas = byCode["1110"];
    modal = byCode["3100"];
  });
  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  it("resolveRelatedRefs memetakan entryId dan code", () => {
    expect(resolveRelatedRefs(null)).toEqual([]);
    expect(resolveRelatedRefs({})).toEqual([]);
    const refs = resolveRelatedRefs({
      entryId: "e1",
      entryNumber: "JE-2026-0001",
      code: "1110",
    });
    expect(refs).toEqual([
      { kind: "journal", ref: "e1", label: "Jurnal JE-2026-0001" },
      { kind: "account", ref: "1110", label: "Akun 1110" },
    ]);
  });

  it("getEntryWithLines membaca DRAFT maupun POSTED", async () => {
    const journals = await import("@/server/db/repos/journals.repo");
    const { db } = await import("@/server/db");

    const draft = await db.transaction((tx) =>
      journals.createDraftJournalEntry(tx as never, orgId, {
        dateISO: `${year}-05-01`,
        memo: "Draf temuan",
        lines: [
          { accountId: kas, debitMinor: 1000n, creditMinor: 0n },
          { accountId: modal, debitMinor: 0n, creditMinor: 1000n },
        ],
      }),
    );
    const readDraft = await db.transaction((tx) =>
      journals.getEntryWithLines(tx as never, orgId, draft.id),
    );
    expect(readDraft?.status).toBe("DRAFT");
    expect(readDraft?.lines).toHaveLength(2);

    const posted = await db.transaction((tx) =>
      journals.postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-05-02`,
        memo: "Posted temuan",
        lines: [
          { accountId: kas, debitMinor: 2000n, creditMinor: 0n },
          { accountId: modal, debitMinor: 0n, creditMinor: 2000n },
        ],
      }),
    );
    const readPosted = await db.transaction((tx) =>
      journals.getEntryWithLines(tx as never, orgId, posted.id),
    );
    expect(readPosted?.status).toBe("POSTED");

    expect(
      await db.transaction((tx) =>
        journals.getEntryWithLines(tx as never, orgId, crypto.randomUUID()),
      ),
    ).toBeNull();
  });

  it("temuan menunjuk akun + jurnal terkait", async () => {
    const findings = await import("@/server/db/repos/findings.repo");
    const journals = await import("@/server/db/repos/journals.repo");
    const ledger = await import("@/server/db/repos/ledger.repo");
    const { db } = await import("@/server/db");

    const entry = await db.transaction((tx) =>
      journals.postJournalEntry(tx as never, orgId, "tester@test.id", {
        dateISO: `${year}-05-03`,
        memo: "Kas abnormal",
        lines: [
          { accountId: kas, debitMinor: 5000n, creditMinor: 0n },
          { accountId: modal, debitMinor: 0n, creditMinor: 5000n },
        ],
      }),
    );
    const created = await db.transaction((tx) =>
      findings.createFinding(tx as never, orgId, {
        type: "duplicates",
        severity: "MEDIUM",
        evidence: { entryId: entry.id, entryNumber: "X", code: "1110" },
      }),
    );
    const fetched = await db.transaction((tx) =>
      findings.getFinding(tx as never, orgId, created.id),
    );
    expect(fetched?.id).toBe(created.id);

    const refs = resolveRelatedRefs(fetched!.evidence as Record<string, unknown>);
    expect(refs.map((r) => r.kind)).toEqual(["journal", "account"]);

    const journal = await db.transaction((tx) =>
      journals.getEntryWithLines(tx as never, orgId, entry.id),
    );
    expect(journal?.number).toBeTruthy();

    const balances = await db.transaction((tx) =>
      ledger.listAccountsWithBalances(tx as never, orgId),
    );
    expect(balances.find((a) => a.code === "1110")).toBeTruthy();
  });
});
