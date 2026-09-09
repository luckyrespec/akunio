import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("nara new tools (kontak, pembantu, kas, faktur, opname, aset)", () => {
  let orgId: string;
  let cashAccountId = "";
  let expenseAccountId = "";
  let lossAccountId = "";
  let gainAccountId = "";
  let assetAccA = "";
  let assetAccB = "";
  let assetAccC = "";
  let contactId = "";
  let invoiceNumber = "";
  let itemId = "";
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });
  const actor = "tester@test.id";
  const year = new Date().getFullYear();

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Nara Tools")).orgId;
    await (await import("@/server/bootstrap/seed-org")).seedOrgData(orgId);
    const rows = await admin.query<{ id: string; code: string; is_cash: boolean; parent_code: string | null }>(
      `SELECT id, code, is_cash, parent_code FROM accounts WHERE org_id=$1 ORDER BY code`,
      [orgId],
    );
    const cash = rows.rows.find((r) => r.is_cash);
    const parents = new Set(rows.rows.map((r) => r.parent_code).filter(Boolean));
    // Lawan BAYAR harus akun beban DAUN (bukan header/kontrol) — repo menolak
    // kontrol via kas-bank dan validasi jurnal menolak akun induk.
    const leaves = rows.rows.filter((r) => !r.is_cash && !parents.has(r.code));
    const expenses = leaves.filter((r) => r.code.startsWith("5"));
    const others = rows.rows.filter((r) => !r.is_cash);
    if (!cash || expenses.length === 0 || others.length < 4) {
      throw new Error("COA seed tidak lengkap untuk test tools");
    }
    cashAccountId = cash.id;
    expenseAccountId = expenses[0].id;
    const lossRow = rows.rows.find((r) => r.code === "5900") ?? expenses[0];
    const gainRow = rows.rows.find((r) => r.code === "4200") ?? others[0];
    if (!lossRow || !gainRow) {
      throw new Error("COA seed tidak lengkap untuk test tools");
    }
    lossAccountId = lossRow.id;
    gainAccountId = gainRow.id;
    [assetAccA, assetAccB, assetAccC] = [others[1].id, others[2].id, others[3].id];
  });
  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  it("kontak: create → list → find → update, gagal bila id tak dikenal", async () => {
    const { contactsHandlers } = await import("@/server/ai/tools/contacts.tools");
    const created = await contactsHandlers.create_contact(orgId, actor, {
      type: "CUSTOMER",
      name: "Budi Tools",
      phone: "0811",
    });
    expect(created.success).toBe(true);
    contactId = (created.data as { contact: { id: string } }).contact.id;

    const listed = await contactsHandlers.list_contacts(orgId, actor, { search: "budi" });
    expect(listed.success).toBe(true);
    expect((listed.data as { totalCount: number }).totalCount).toBeGreaterThanOrEqual(1);

    const found = await contactsHandlers.find_contact(orgId, actor, { name: "budi tools" });
    expect(found.success).toBe(true);
    expect((found.data as { contact: { id: string } }).contact.id).toBe(contactId);

    const updated = await contactsHandlers.update_contact(orgId, actor, {
      contactId,
      phone: "0822",
    });
    expect(updated.success).toBe(true);
    expect((updated.data as { contact: { phone: string } }).contact.phone).toBe("0822");

    const missing = await contactsHandlers.update_contact(orgId, actor, {
      contactId: "00000000-0000-0000-0000-000000000000",
      phone: "0833",
    });
    expect(missing.success).toBe(false);
  });

  it("faktur & pembantu: invoice → list/detail/ledger happy, gagal bila nomor tak dikenal", async () => {
    const { createInvoiceRepo } = await import("@/server/db/repos/invoices.repo");
    const { db } = await import("@/server/db");
    const inv = await createInvoiceRepo(
      db,
      orgId,
      {
        type: "INVOICE",
        contactId,
        issueDate: `${year}-02-01`,
        dueDate: `${year}-03-01`,
      } as never,
      [{ description: "Jasa tools", quantity: 1, unitPriceMinor: 100_000n } as never],
    );
    invoiceNumber = inv.invoiceNumber;

    const { invoicingHandlers } = await import("@/server/ai/tools/invoicing.tools");
    const listed = await invoicingHandlers.list_invoices(orgId, actor, {});
    expect(listed.success).toBe(true);
    expect((listed.data as { totalCount: number }).totalCount).toBeGreaterThanOrEqual(1);

    const detail = await invoicingHandlers.get_invoice_detail(orgId, actor, { invoiceNumber });
    expect(detail.success).toBe(true);
    const d = detail.data as { remaining: string; status: string };
    expect(typeof d.remaining).toBe("string");
    expect(d.remaining.length).toBeGreaterThan(0);

    const missing = await invoicingHandlers.get_invoice_detail(orgId, actor, {
      invoiceNumber: "INV-TIDAK-ADA",
    });
    expect(missing.success).toBe(false);

    const { subsidiaryHandlers } = await import("@/server/ai/tools/subsidiary.tools");
    const cards = await subsidiaryHandlers.list_contact_ledgers(orgId, actor, { type: "INVOICE" });
    expect(cards.success).toBe(true);
    expect((cards.data as { totalCount: number }).totalCount).toBeGreaterThanOrEqual(1);

    const ledger = await subsidiaryHandlers.get_contact_ledger(orgId, actor, {
      contactId,
      type: "INVOICE",
    });
    expect(ledger.success).toBe(true);
    expect((ledger.data as { totalMoves: number }).totalMoves).toBeGreaterThanOrEqual(1);

    const ledgerMissing = await subsidiaryHandlers.get_contact_ledger(orgId, actor, {
      contactId: "00000000-0000-0000-0000-000000000000",
      type: "INVOICE",
    });
    expect(ledgerMissing.success).toBe(false);
  });

  it("kas-bank: record draf → list → summary, gagal bila kind tak valid", async () => {
    const { cashBankHandlers } = await import("@/server/ai/tools/cash-bank.tools");
    const recorded = await cashBankHandlers.record_cash_entry(orgId, actor, {
      kind: "BAYAR",
      entryDate: `${year}-02-05`,
      cashAccountId,
      counterAccountId: expenseAccountId,
      amountText: "50000",
      memo: "Beli bensin via tools",
    });
    expect(recorded.success).toBe(true);
    expect((recorded.data as { status: string }).status).toBe("DRAFT");

    const listed = await cashBankHandlers.list_cash_entries(orgId, actor, {});
    expect(listed.success).toBe(true);
    expect((listed.data as { totalCount: number }).totalCount).toBeGreaterThanOrEqual(1);

    const summary = await cashBankHandlers.get_cash_summary(orgId, actor, { kind: "BAYAR" });
    expect(summary.success).toBe(true);
    expect(typeof (summary.data as { postedTotal: string }).postedTotal).toBe("string");

    const bad = await cashBankHandlers.record_cash_entry(orgId, actor, {
      kind: "BOGUS",
      entryDate: `${year}-02-05`,
      cashAccountId,
      counterAccountId: expenseAccountId,
      amountText: "50000",
      memo: "x",
    });
    expect(bad.success).toBe(false);
  });

  it("opname: buat item → draf opname + kartu stok, gagal bila item kosong", async () => {
    const { withOrg } = await import("@/server/db/repos/with-org");
    const { createInventoryItem } = await import("@/server/db/repos/inventory.repo");
    const item = await withOrg(orgId, (tx) =>
      createInventoryItem(tx as never, orgId, {
        name: "Barang Tools",
        unit: "Pcs",
        minStockAlert: "5",
        initialQty: 10,
        initialCostMinor: 1_000n,
        standardSellingPriceMinor: 1_500n,
      }),
    );
    itemId = (item as { id: string }).id;

    const { inventoryHandlers } = await import("@/server/ai/tools/inventory.tools");
    // Pemetaan akun selisih (jalur Pengaturan > Persediaan) wajib ada sebelum
    // rantai sahkan+posting bisa berjalan — fail-closed by design.
    const { upsertInventorySettings } = await import("@/server/db/repos/inventory.repo");
    await withOrg(orgId, (tx) =>
      upsertInventorySettings(tx as never, orgId, {
        adjustmentLossAccountId: lossAccountId,
        adjustmentGainAccountId: gainAccountId,
      }),
    );
    const created = await inventoryHandlers.create_stock_opname(orgId, actor, {
      opnameDate: `${year}-02-10`,
      items: [{ itemId, physicalQty: 9 }],
    });
    expect(created.success).toBe(true);
    expect((created.data as { status: string }).status).toBe("COMPLETED");
    expect(typeof (created.data as { journalNumber: string }).journalNumber).toBe("string");

    const draftOnly = await inventoryHandlers.create_stock_opname(orgId, actor, {
      opnameDate: `${year}-02-10`,
      postImmediately: false,
      items: [{ itemId, physicalQty: 8 }],
    });
    expect(draftOnly.success).toBe(true);
    expect((draftOnly.data as { status: string }).status).toBe("DRAFT");

    const listed = await inventoryHandlers.list_stock_opnames(orgId, actor, {});
    expect(listed.success).toBe(true);
    expect((listed.data as { totalCount: number }).totalCount).toBeGreaterThanOrEqual(1);

    const empty = await inventoryHandlers.create_stock_opname(orgId, actor, {
      opnameDate: `${year}-02-10`,
      items: [],
    });
    expect(empty.success).toBe(false);

    const { subsidiaryHandlers } = await import("@/server/ai/tools/subsidiary.tools");
    const card = await subsidiaryHandlers.get_item_stock_card(orgId, actor, { itemId });
    expect(card.success).toBe(true);
    const missing = await subsidiaryHandlers.get_item_stock_card(orgId, actor, {
      itemId: "00000000-0000-0000-0000-000000000000",
    });
    expect(missing.success).toBe(false);
  });

  it("aset: list → register happy, gagal bila kategori tak valid", async () => {
    const { assetsAndClosingHandlers } = await import(
      "@/server/ai/tools/assets-closing.tools"
    );
    const before = await assetsAndClosingHandlers.list_fixed_assets(orgId, actor, {});
    expect(before.success).toBe(true);

    const registered = await assetsAndClosingHandlers.register_fixed_asset(orgId, actor, {
      name: "Laptop Tools",
      category: "INVENTARIS_KANTOR",
      acquisitionDate: `${year}-01-15`,
      acquisitionCostText: "10000000",
      usefulLifeMonths: 48,
      depreciationMethod: "STRAIGHT_LINE",
      assetAccountId: assetAccA,
      accumulatedDepAccountId: assetAccB,
      depreciationExpenseAccountId: assetAccC,
    });
    expect(registered.success).toBe(true);
    expect((registered.data as { code: string }).code).toMatch(/^AST-/);

    const after = await assetsAndClosingHandlers.list_fixed_assets(orgId, actor, {
      query: "laptop tools",
    });
    expect(after.success).toBe(true);
    expect((after.data as { totalCount: number }).totalCount).toBeGreaterThanOrEqual(1);

    const bad = await assetsAndClosingHandlers.register_fixed_asset(orgId, actor, {
      name: "X",
      category: "BOGUS",
      acquisitionDate: `${year}-01-15`,
      acquisitionCostText: "1000",
      usefulLifeMonths: 12,
      depreciationMethod: "STRAIGHT_LINE",
      assetAccountId: assetAccA,
      accumulatedDepAccountId: assetAccB,
      depreciationExpenseAccountId: assetAccC,
    });
    expect(bad.success).toBe(false);
  });
});
