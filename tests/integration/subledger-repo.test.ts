import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { createInvoiceRepo } from "@/server/db/repos/invoices.repo";
import {
  seedSubledgerControls, getControlKindByAccount, reconcileSubledger, reportSubledgerMismatch,
} from "@/server/db/repos/subledger.repo";

describe("subledger repo", () => {
  beforeEach(async () => { await truncateAll(); });

  it("seed idempoten + recon nol + mismatch terdeteksi", async () => {
    const { orgId } = await makeOrg("recon");
    await seedOrgData(orgId);
    const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
    const byCode = (c: string) => rows.find((a) => a.code === c)!.id;
    await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
      receivableAccountId: byCode("1200"), payableAccountId: byCode("2100"), inventoryAccountId: byCode("1300"),
    }));
    await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
      receivableAccountId: byCode("1200"), payableAccountId: byCode("2100"), inventoryAccountId: byCode("1300"),
    }));
    const kinds = await withOrg(orgId, (tx) => getControlKindByAccount(tx, orgId));
    expect(kinds.get(byCode("1200"))).toBe("PIUTANG");
    expect(kinds.get(byCode("1300"))).toBe("PERSEDIAAN");

    const clean = await withOrg(orgId, (tx) => reconcileSubledger(tx, orgId));
    expect(clean.every((r) => r.differenceMinor === 0n)).toBe(true);

    const contact = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
    await createInvoiceRepo(db, orgId,
      { type: "INVOICE", contactId: contact.id, issueDate: "2026-09-07", dueDate: "2026-09-21" },
      [{ description: "Jasa", quantity: 1, unitPriceMinor: 1_000_000n }]);

    const dirty = await withOrg(orgId, (tx) => reconcileSubledger(tx, orgId));
    const ar = dirty.find((r) => r.kind === "PIUTANG")!;
    expect(ar.subledgerTotalMinor).toBe(1_000_000n);
    expect(ar.differenceMinor).toBe(1_000_000n);
    const n = await withOrg(orgId, (tx) => reportSubledgerMismatch(tx, orgId, dirty));
    expect(n).toBe(1);
  });
});
