import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { fiscalPeriods } from "@/server/db/schema/org";
import { journalEntries } from "@/server/db/schema/journal";

describe("skema prepaid", () => {
  beforeEach(async () => { await truncateAll(); });

  // Catatan: asersi isolasi RLS prepaid_contracts PINDAH ke
  // tests/integration/rls-isolation.test.ts (kasus 4, peran NOBYPASSRLS
  // + kontrol positif dua org).

  it("CHECK je_source_chk menerima DIMUKA", async () => {
    const { orgId } = await makeOrg("org-src");
    const [per] = await db.insert(fiscalPeriods).values({
      orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN",
    }).returning();
    const [je] = await db.insert(journalEntries).values({
      orgId, periodId: per.id, seq: 1, number: "JE-2026-0001",
      entryDate: "2026-01-05", memo: "cek", source: "DIMUKA", status: "DRAFT",
    }).returning();
    expect(je.id).toBeTruthy();
  });
});
