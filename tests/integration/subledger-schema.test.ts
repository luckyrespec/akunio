import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { accounts } from "@/server/db/schema/org";
import { subledgerControls, subledgerJournalLinks } from "@/server/db/schema/subledger";

describe("skema subledger", () => {
  beforeEach(async () => { await truncateAll(); });

  // Catatan: asersi isolasi RLS per-org PINDAH ke
  // tests/integration/rls-isolation.test.ts (kasus 3, peran NOBYPASSRLS
  // + kontrol positif). Di sini hanya ketersediaan tabel.
  it("tabel tersedia (controls + links)", async () => {
    const a = await makeOrg("rls-a");
    const [acc] = await db.insert(accounts).values({
      orgId: a.orgId, code: "1310", name: "Persediaan", type: "ASET", normal: "D",
    }).returning();
    const [ctl] = await db.insert(subledgerControls).values({
      orgId: a.orgId, kind: "PERSEDIAAN", controlAccountId: acc.id,
    }).returning();
    expect(ctl.id).toBeTruthy();

    await expect(db.select().from(subledgerJournalLinks)).resolves.toEqual([]);
  });
});
