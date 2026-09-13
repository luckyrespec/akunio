import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import type { CashKind } from "@/server/db/schema/cash-bank";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "modul operasional: idempotency kas-bank",
  () => {
    let orgId: string;
    let kas = "",
      lawan = "";
    const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
    const year = new Date().getFullYear();

    beforeAll(async () => {
      await truncateAll();
      orgId = (await makeOrg("PT Operasional Idempoten")).orgId;
      await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
      const rows = await admin.query<{ id: string; code: string }>(
        `SELECT id, code FROM accounts WHERE org_id=$1`,
        [orgId]
      );
      const byCode = Object.fromEntries(rows.rows.map((r) => [r.code, r.id]));
      kas = byCode["1110"];
      // Lawan leaf (bukan 4100/5100 yang bisa jadi GROUP pasca-onboarding).
      lawan = byCode["4200"];
    });
    afterAll(async () => {
      await admin.end();
      await truncateAll();
    });

    async function createCashEntryWithKey(
      forOrgId: string,
      args: { kind: CashKind; amountMinor: bigint; idempotencyKey: string }
    ) {
      const { withOrg } = await import("@/server/db/repos/with-org");
      const { createCashEntryRepo } = await import(
        "@/server/db/repos/cash-bank.repo"
      );
      return withOrg(forOrgId, (tx) =>
        createCashEntryRepo(
          tx as never,
          forOrgId,
          "t@t.id",
          {
            kind: args.kind,
            entryDate: `${year}-06-10`,
            cashAccountId: kas,
            counterAccountId: lawan,
            amountMinor: args.amountMinor,
            memo: "Setoran operasional",
            idempotencyKey: args.idempotencyKey,
          },
          { post: true }
        )
      );
    }

    it("double-submit kas TERIMA satu jurnal satu baris", async () => {
      const key = "kas-t1";
      const r1 = await createCashEntryWithKey(orgId, {
        kind: "TERIMA",
        amountMinor: 75_000n,
        idempotencyKey: key,
      });
      const r2 = await createCashEntryWithKey(orgId, {
        kind: "TERIMA",
        amountMinor: 75_000n,
        idempotencyKey: key,
      });
      expect(r2.journalEntryId).toBe(r1.journalEntryId);
      expect(r2.id).toBe(r1.id);
      const n = await admin.query<{ n: number }>(
        `SELECT count(*)::int n FROM kas_bank_entries WHERE org_id=$1`,
        [orgId]
      );
      expect(n.rows[0].n).toBe(1);
      const j = await admin.query<{ n: number }>(
        `SELECT count(*)::int n FROM journal_entries WHERE org_id=$1 AND idempotency_key=$2`,
        [orgId, key]
      );
      expect(j.rows[0].n).toBe(1);
    });
  }
);
