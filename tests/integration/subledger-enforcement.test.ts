import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { seedSubledgerControls } from "@/server/db/repos/subledger.repo";
import { postJournalEntry, createDraftJournalEntry, postDraftEntry } from "@/server/db/repos/journals.repo";

async function setup() {
  const { orgId } = await makeOrg("enforce");
  await seedOrgData(orgId);
  const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byCode = (c: string) => rows.find((a) => a.code === c)!.id;
  await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
    receivableAccountId: byCode("1200"), payableAccountId: byCode("2100"), inventoryAccountId: byCode("1300"),
  }));
  return { orgId, byCode };
}
const year = new Date().getFullYear();

describe("enforcement B1", () => {
  beforeEach(async () => { await truncateAll(); });

  it("MANUAL ke 1300 ditolak", async () => {
    const { orgId, byCode } = await setup();
    await expect(withOrg(orgId, (tx) => postJournalEntry(tx, orgId, "t@t.id", {
      dateISO: `${year}-09-07`, memo: "manual nakal", source: "MANUAL",
      lines: [
        { accountId: byCode("5900"), debitMinor: 1_000n, creditMinor: 0n },
        { accountId: byCode("1300"), debitMinor: 0n, creditMinor: 1_000n },
      ],
    }))).rejects.toThrow("AKUN_KONTROL_WAJIB_VIA_MODUL");
  });

  it("draft manual ke kontrol ditolak saat create; draft modul tanpa links ditolak saat post", async () => {
    const { orgId, byCode } = await setup();
    await expect(withOrg(orgId, (tx) => createDraftJournalEntry(tx, orgId, {
      dateISO: `${year}-09-07`, memo: "draft nakal", source: "MANUAL",
      lines: [
        { accountId: byCode("5900"), debitMinor: 2_000n, creditMinor: 0n },
        { accountId: byCode("2100"), debitMinor: 0n, creditMinor: 2_000n },
      ],
    }))).rejects.toThrow("AKUN_KONTROL_WAJIB_VIA_MODUL");

    // Draft modul tanpa links lolos saat create (guard di create juga menolak...
    // verifikasi di bawah) — jadi buat draft non-kontrol lalu cek postDraftEntry
    // menolak draft kontrol yang disusupkan langsung via SQL akan diuji di modul.
    // Di sini: draft modul tanpa links ke kontrol DITOLAK saat create:
    await expect(withOrg(orgId, (tx) => createDraftJournalEntry(tx, orgId, {
      dateISO: `${year}-09-07`, memo: "draft tanpa links", source: "DOCUMENT",
      lines: [
        { accountId: byCode("1200"), debitMinor: 3_000n, creditMinor: 0n },
        { accountId: byCode("4100"), debitMinor: 0n, creditMinor: 3_000n },
      ],
    }))).rejects.toThrow("SUBLEDGER_REF_WAJIB");
  });

  it("modul dengan links lolos + links tersimpan + postDraftEntry lolos", async () => {
    const { orgId, byCode } = await setup();
    const contact = await createContactRepo(db, orgId, { name: "C", type: "CUSTOMER" });
    const draft = await withOrg(orgId, (tx) => createDraftJournalEntry(tx, orgId, {
      dateISO: `${year}-09-07`, memo: "dengan links", source: "DOCUMENT",
      lines: [
        { accountId: byCode("1200"), debitMinor: 5_000n, creditMinor: 0n, subledgerLinks: [{ kind: "PIUTANG", refId: contact.id, amountMinor: 5_000n }] },
        { accountId: byCode("4100"), debitMinor: 0n, creditMinor: 5_000n },
      ],
    }));
    expect(draft.number.startsWith("JE-")).toBe(true);
    const posted = await withOrg(orgId, (tx) => postDraftEntry(tx, orgId, "t@t.id", draft.id));
    expect(posted.id).toBe(draft.id);
    const { listLinksForEntry } = await import("@/server/db/repos/subledger.repo");
    const links = await withOrg(orgId, (tx) => listLinksForEntry(tx, orgId, draft.id));
    expect(links.filter((l) => l.linkId !== null).length).toBe(1);
  });

  it("opening balance bypass", async () => {
    const { orgId, byCode } = await setup();
    const ok = await withOrg(orgId, (tx) => postJournalEntry(tx, orgId, "t@t.id", {
      dateISO: `${year}-09-07`, memo: "saldo awal", source: "MANUAL", isOpeningBalance: true,
      lines: [
        { accountId: byCode("1300"), debitMinor: 9_000n, creditMinor: 0n },
        { accountId: byCode("3100"), debitMinor: 0n, creditMinor: 9_000n },
      ],
    }));
    expect(ok.number.startsWith("JE-")).toBe(true);
  });
});
