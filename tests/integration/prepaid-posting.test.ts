import { describe, expect, it, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { subledgerControls } from "@/server/db/schema/subledger";
import { prepaidScheduleLines } from "@/server/db/schema/prepaid";
import { subledgerJournalLinks } from "@/server/db/schema/subledger";
import { withOrg } from "@/server/db/repos/with-org";
import { createPrepaidContract, postMonthlyAmortization } from "@/server/db/repos/prepaid.repo";

async function seedAccounts(orgId: string) {
  const mk = async (code: string, name: string, type: "ASET" | "BEBAN", normal: "D" | "K") => {
    const [r] = await db.insert(accounts).values({ orgId, code, name, type, normal }).returning();
    return r.id;
  };
  const kas = await mk("1110", "Kas", "ASET", "D");
  const dimuka = await mk("1600", "Sewa Dibayar di Muka", "ASET", "D");
  const beban = await mk("5300", "Beban Sewa", "BEBAN", "D");
  await db.insert(fiscalPeriods).values([
    { orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN" },
    { orgId, name: "2026-02", startsOn: "2026-02-01", endsOn: "2026-02-28", status: "OPEN" },
  ]);
  await db.insert(subledgerControls).values({ orgId, kind: "DIMUKA", controlAccountId: dimuka });
  return { kas, dimuka, beban };
}

const newContract = (orgId: string, acc: { kas: string; dimuka: string; beban: string }) => ({
  orgId, name: "Sewa Ruko 12 bln", startDate: "2026-01-05", months: 12,
  totalMinor: 1200000000n, controlAccountId: acc.dimuka,
  expenseAccountId: acc.beban, paymentAccountId: acc.kas, postedBy: "owner@x.id",
});

describe("prepaid dimuka", () => {
  beforeEach(async () => { await truncateAll(); });
  it("buat kontrak → 12 jadwal + JE awal Dr1600/Cr1110 + links", async () => {
    const { orgId } = await makeOrg("org-prepaid");
    const acc = await seedAccounts(orgId);
    const res = await withOrg(orgId, (tx) => createPrepaidContract(tx, newContract(orgId, acc)));
    expect(res.contract.code).toMatch(/^DM-2026-\d{4}$/);
    const sched = await db.select().from(prepaidScheduleLines)
      .where(eq(prepaidScheduleLines.contractId, res.contract.id));
    expect(sched).toHaveLength(12);
    const links = await db.select().from(subledgerJournalLinks)
      .where(eq(subledgerJournalLinks.refId, res.contract.id));
    expect(links).toHaveLength(1);
    expect(links[0].kind).toBe("DIMUKA");
  });
  it("posting 2x idempotent (recon DIMUKA diuji di Task 5)", async () => {
    const { orgId } = await makeOrg("org-prepaid-2");
    const acc = await seedAccounts(orgId);
    await withOrg(orgId, (tx) => createPrepaidContract(tx, newContract(orgId, acc)));
    const r1 = await withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "owner@x.id" }));
    const r2 = await withOrg(orgId, (tx) => postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "owner@x.id" }));
    expect(r1.postedCount).toBe(1);
    expect(r1.journalEntryId).toBeTruthy();
    expect(r2.postedCount).toBe(0);
    const posted = await db.select().from(prepaidScheduleLines)
      .where(and(eq(prepaidScheduleLines.orgId, orgId), eq(prepaidScheduleLines.status, "POSTED")));
    expect(posted).toHaveLength(1);
  });
  it("periode CLOSED ditolak", async () => {
    const { orgId } = await makeOrg("org-prepaid-3");
    const acc = await seedAccounts(orgId);
    await withOrg(orgId, (tx) => createPrepaidContract(tx, newContract(orgId, acc)));
    await db.update(fiscalPeriods).set({ status: "CLOSED" })
      .where(and(eq(fiscalPeriods.orgId, orgId), eq(fiscalPeriods.name, "2026-01")));
    await expect(withOrg(orgId, (tx) =>
      postMonthlyAmortization(tx, { orgId, periodName: "2026-01", postedBy: "owner@x.id" }),
    )).rejects.toThrow();
  });
  it("penomoran DM-YYYY sekuensial + tahan race konkuren", async () => {
    const { orgId } = await makeOrg("org-prepaid-numbering");
    const acc = await seedAccounts(orgId);
    const mk = () => newContract(orgId, acc);
    // Berurutan (kontrak brief): 0001 lalu 0002.
    const r1 = await withOrg(orgId, (tx) => createPrepaidContract(tx, mk()));
    const r2 = await withOrg(orgId, (tx) => createPrepaidContract(tx, mk()));
    expect(r1.contract.code).toBe("DM-2026-0001");
    expect(r2.contract.code).toBe("DM-2026-0002");
    // Konkuren: advisory-xact-lock menyerikan read-modify-write kode —
    // tanpa lock, keduanya membaca 0002 dan tabrakan pada 0003 (uq).
    const [r3, r4] = await Promise.all([
      withOrg(orgId, (tx) => createPrepaidContract(tx, mk())),
      withOrg(orgId, (tx) => createPrepaidContract(tx, mk())),
    ]);
    expect([r3.contract.code, r4.contract.code].sort()).toEqual([
      "DM-2026-0003",
      "DM-2026-0004",
    ]);
  });
});
