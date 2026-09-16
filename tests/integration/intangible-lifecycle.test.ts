import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import {
  createIntangible,
  getIntangibleDetail,
  listIntangibleCards,
  postMonthlyAmortization,
  disposeIntangible,
} from "@/server/db/repos/intangible-assets.repo";
import { withOrg } from "@/server/db/repos/with-org";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Intangible lifecycle", () => {
  let orgId: string;
  let bankAccId: string;
  let assetAccId: string;
  let accumAccId: string;
  let expAccId: string;
  let gainLossAccId: string;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL! });

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Intangible Lifecycle")).orgId;

    await db.insert(fiscalPeriods).values([
      { orgId, name: "2026-01", startsOn: "2026-01-01", endsOn: "2026-01-31", status: "OPEN" },
      { orgId, name: "2026-02", startsOn: "2026-02-01", endsOn: "2026-02-28", status: "OPEN" },
    ]);

    const mk = (
      code: string,
      name: string,
      type: "ASET" | "BEBAN" | "PENDAPATAN",
      normal: "D" | "K",
      extra: Record<string, unknown> = {},
    ) =>
      db
        .insert(accounts)
        .values({ orgId, code, name, type, normal, ...extra })
        .returning();
    const [b] = await mk("1110", "Kas & Bank", "ASET", "D", { isBank: true });
    const [a] = await mk("1710", "Lisensi Software", "ASET", "D");
    const [d] = await mk("1810", "Akum. Amortisasi", "ASET", "K", { contra: true });
    const [e] = await mk("6210", "Beban Amortisasi", "BEBAN", "D");
    const [g] = await mk("7110", "Laba/Rugi Pelepasan", "PENDAPATAN", "K");
    bankAccId = b.id;
    assetAccId = a.id;
    accumAccId = d.id;
    expAccId = e.id;
    gainLossAccId = g.id;
  });

  afterAll(async () => {
    await admin.end();
    await truncateAll();
  });

  async function makeIntangible(name = "Lisensi Akuntansi") {
    return withOrg(orgId, (tx) =>
      createIntangible(tx, {
        orgId,
        name,
        category: "LISENSI_SOFTWARE",
        acquisitionDate: "2026-01-05",
        inServiceDate: "2026-01-01",
        acquisitionCostMinor: 12_000_000_00n,
        usefulLifeMonths: 12,
        assetAccountId: assetAccId,
        accumulatedAccountId: accumAccId,
        amortizationExpenseAccountId: expAccId,
      }),
    );
  }

  function runAmor(period: string) {
    return withOrg(orgId, (tx) =>
      postMonthlyAmortization(tx, { orgId, periodName: period, postedBy: "tester" }),
    );
  }

  it("kode ITB-YYYY-NNNN + 12 baris jadwal", async () => {
    const asset = await makeIntangible();
    expect(asset.code).toMatch(/^ITB-2026-\d{4}$/);
    const detail = await withOrg(orgId, (tx) => getIntangibleDetail(tx, orgId, asset.id));
    expect(detail?.schedule).toHaveLength(12);
    expect(detail?.schedule[0].amortizationAmountMinor).toBe(1_000_000_00n);
  });

  it("kartu membawa akumulasi + nilai buku", async () => {
    const asset = await makeIntangible("Lisensi Kartu");
    await runAmor("2026-02");
    const cards = await withOrg(orgId, (tx) => listIntangibleCards(tx, orgId));
    const card = cards.find((c) => c.id === asset.id);
    expect(card?.accumulatedMinor).toBe(1_000_000_00n);
    expect(card?.bookValueMinor).toBe(11_000_000_00n);
  });

  it("posting konkuren ganda satu jurnal", async () => {
    await makeIntangible("Lisensi Konkuren");
    const [a, b] = await Promise.all([runAmor("2026-01"), runAmor("2026-01")]);
    expect(a.journalEntryId).not.toBeNull();
    expect(a.journalEntryId).toBe(b.journalEntryId);
  });

  it("pelepasan SALE menutup jadwal sisa", async () => {
    const asset = await makeIntangible("Lisensi Dilepas");
    await runAmor("2026-01");
    const res = await withOrg(orgId, (tx) =>
      disposeIntangible(tx, {
        orgId,
        assetId: asset.id,
        disposalDate: "2026-02-10",
        disposalType: "SALE",
        proceedsMinor: 5_000_000_00n,
        depositAccountId: bankAccId,
        gainLossAccountId: gainLossAccId,
        postedBy: "tester",
      }),
    );
    expect(res.journalEntryId).not.toBeNull();
    const again = await withOrg(orgId, (tx) => getIntangibleDetail(tx, orgId, asset.id));
    expect(again?.asset.status).toBe("DISPOSED");
  });
});
