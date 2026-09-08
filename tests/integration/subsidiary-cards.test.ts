import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { truncateAll, makeOrg } from "./helpers";
import { withOrg } from "@/server/db/repos/with-org";
import { seedOrgData } from "@/server/bootstrap/seed-org";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { createContactRepo } from "@/server/db/repos/contacts.repo";
import { createInvoiceRepo, recordInvoicePaymentRepo, getInvoiceByIdRepo } from "@/server/db/repos/invoices.repo";
import { createInventoryItem, upsertInventorySettings } from "@/server/db/repos/inventory.repo";
import { seedSubledgerControls } from "@/server/db/repos/subledger.repo";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import {
  getControlForAccount, listItemCards, getItemCard, listContactCards, getContactCard,
} from "@/server/db/repos/subsidiary.repo";
import { postInvoiceToLedger } from "@/server/invoicing/posting";

const year = new Date().getFullYear();
// Tanggal dinamis (hari ini) agar urutan kartu deterministik —
 // saldo awal (hari ini) selalu segaris waktu dengan mutasi uji.
const today = new Date().toISOString().slice(0, 10);

async function setupCards(name: string) {
  const { orgId } = await makeOrg(name);
  await seedOrgData(orgId);
  const rows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const byCode = (c: string) => rows.find((a) => a.code === c)!;
  await withOrg(orgId, (tx) =>
    upsertInventorySettings(tx, orgId, {
      valuationMethod: "WEIGHTED_AVERAGE", recordingMethod: "PERPETUAL", cogsAccountId: byCode("5100").id,
    }),
  );
  await withOrg(orgId, (tx) => seedSubledgerControls(tx, orgId, {
    receivableAccountId: byCode("1200").id, payableAccountId: byCode("2100").id, inventoryAccountId: byCode("1300").id,
  }));
  const item = await withOrg(orgId, (tx) =>
    createInventoryItem(tx, orgId, {
      name: "Kopi", initialQty: 10, initialCostMinor: 20_000n, standardSellingPriceMinor: 35_000n,
    }),
  );
  const customer = await createContactRepo(db, orgId, { name: "Pelanggan", type: "CUSTOMER" });
  const inv = await createInvoiceRepo(db, orgId,
    { type: "INVOICE", contactId: customer.id, issueDate: today, dueDate: `${year}-09-21` },
    [{ description: "Kopi", quantity: 2, unitPriceMinor: 35_000n, catalogItemId: item.id }]);
  await postInvoiceToLedger(db, orgId, inv.id, "t@t.id");
  const full = await getInvoiceByIdRepo(db, orgId, inv.id);
  const { payment } = await recordInvoicePaymentRepo(db, orgId, {
    invoiceId: inv.id, paymentDate: today, amountMinor: 20_000n, paymentAccountId: byCode("1110").id,
  });
  const { postInvoicePaymentToLedger } = await import("@/server/invoicing/posting");
  await postInvoicePaymentToLedger(db, orgId, payment.id, "t@t.id");
  return { orgId, byCode, item, customer, invNo: full!.invoiceNumber };
}

describe("kartu pembantu", () => {
  beforeEach(async () => { await truncateAll(); });

  it("manual persediaan↔kas ditolak (repro user)", async () => {
    const { orgId, byCode } = await setupCards("repro-blokir");
    await expect(withOrg(orgId, (tx) => postJournalEntry(tx, orgId, "t@t.id", {
      dateISO: `${year}-09-07`, memo: "manual ke persediaan", source: "MANUAL",
      lines: [
        { accountId: byCode("1300").id, debitMinor: 50_000n, creditMinor: 0n },
        { accountId: byCode("1110").id, debitMinor: 0n, creditMinor: 50_000n },
      ],
    }))).rejects.toThrow("AKUN_KONTROL_WAJIB_VIA_MODUL");
  });

  it("kartu item: saldo awal + OUT dengan ref nomor faktur", async () => {
    const { orgId, item, invNo } = await setupCards("kartu-item");
    const cards = await withOrg(orgId, (tx) => listItemCards(tx, orgId));
    expect(cards.length).toBe(1);
    expect(cards[0].code).toBe(item.code);
    expect(Number(cards[0].currentQty)).toBe(8);
    const card = await withOrg(orgId, (tx) => getItemCard(tx, orgId, item.id));
    expect(card).not.toBeNull();
    expect(card!.rows.length).toBe(2);
    expect(card!.rows[0].desc).toBe("Saldo Awal Persediaan");
    expect(card!.rows[1].ref).toBe(invNo);
    expect(Number(card!.rows[1].outQty)).toBe(2);
    expect(Number(card!.rows[1].resultingQty)).toBe(8);
  });

  it("kartu piutang: outstanding + saldo berjalan", async () => {
    const { orgId, customer, invNo } = await setupCards("kartu-piutang");
    const list = await withOrg(orgId, (tx) => listContactCards(tx, orgId, "INVOICE"));
    expect(list.length).toBe(1);
    expect(list[0].name).toBe("Pelanggan");
    expect(list[0].totalMinor).toBe(70_000n);
    expect(list[0].paidMinor).toBe(20_000n);
    expect(list[0].outstandingMinor).toBe(50_000n);
    const card = await withOrg(orgId, (tx) => getContactCard(tx, orgId, customer.id, "INVOICE"));
    expect(card!.entries.map((e) => [e.debitMinor, e.creditMinor, e.balanceMinor])).toEqual([
      [70_000n, 0n, 70_000n],
      [0n, 20_000n, 50_000n],
    ]);
    expect(card!.entries[0].ref).toBe(invNo);
  });

  it("getControlForAccount memetakan kontrol vs non-kontrol", async () => {
    const { orgId, byCode } = await setupCards("kontrol-map");
    const kind = await withOrg(orgId, (tx) => getControlForAccount(tx, orgId, byCode("1300").id));
    expect(kind).toBe("PERSEDIAAN");
    const none = await withOrg(orgId, (tx) => getControlForAccount(tx, orgId, byCode("5100").id));
    expect(none).toBeNull();
  });
});
