import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeOrg, truncateAll } from "./helpers";
import { db } from "@/server/db";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import {
  evaluatePeriodReadiness,
  closePeriod,
} from "@/server/db/repos/periods-closing.repo";
import { postJournalEntry, PostingError } from "@/server/db/repos/journals.repo";
import { eq } from "drizzle-orm";

describe.skipIf(process.env.SKIP_DB_TESTS === "1")("Period Closing & Locking Guard", () => {
  let orgId: string;
  let cashAccId: string;
  let revAccId: string;
  let expAccId: string;
  let reAccId: string;

  beforeAll(async () => {
    await truncateAll();
    orgId = (await makeOrg("PT Tutup Buku Test")).orgId;

    // Buat fiscal period
    await db.insert(fiscalPeriods).values([
      {
        orgId,
        name: "2026-01",
        startsOn: "2026-01-01",
        endsOn: "2026-01-31",
        status: "OPEN",
      },
      {
        orgId,
        name: "2026-12",
        startsOn: "2026-12-01",
        endsOn: "2026-12-31",
        status: "OPEN",
      },
    ]);

    // Buat COA
    const [a1] = await db.insert(accounts).values({
      orgId, code: "1110", name: "Kas", type: "ASET", normal: "D", isCash: true
    }).returning();
    const [a2] = await db.insert(accounts).values({
      orgId, code: "4110", name: "Pendapatan Jasa", type: "PENDAPATAN", normal: "K"
    }).returning();
    const [a3] = await db.insert(accounts).values({
      orgId, code: "6110", name: "Beban Operasional", type: "BEBAN", normal: "D"
    }).returning();
    const [a4] = await db.insert(accounts).values({
      orgId, code: "3200", name: "Laba Ditahan", type: "EKUITAS", normal: "K"
    }).returning();

    cashAccId = a1.id;
    revAccId = a2.id;
    expAccId = a3.id;
    reAccId = a4.id;
  });

  afterAll(async () => {
    await truncateAll();
  });

  it("evaluates readiness, executes close, and forbids new postings to closed periods", async () => {
    // 1. Post a valid transaction in 2026-01
    await postJournalEntry(db, orgId, "test@example.com", {
      dateISO: "2026-01-10",
      memo: "Penerimaan Pendapatan Jasa",
      source: "MANUAL",
      lines: [
        { accountId: cashAccId, debitMinor: 100000000n, creditMinor: 0n },
        { accountId: revAccId, debitMinor: 0n, creditMinor: 100000000n },
      ],
    });

    // 2. Evaluasi kesiapan periode 2026-01
    const readiness = await evaluatePeriodReadiness(db, orgId, "2026-01");
    expect(readiness.isReady).toBe(true);

    // 3. Tutup periode 2026-01
    const closeRes = await closePeriod(db, {
      orgId,
      periodName: "2026-01",
      actorEmail: "test@example.com",
    });
    expect(closeRes.period.status).toBe("CLOSED");

    // 4. Coba posting transaksi baru di periode yang sudah CLOSED -> HARUS DITOLAK
    let caughtError: unknown = null;
    try {
      await postJournalEntry(db, orgId, "test@example.com", {
        dateISO: "2026-01-20",
        memo: "Transaksi Susulan Terlarang",
        source: "MANUAL",
        lines: [
          { accountId: cashAccId, debitMinor: 50000000n, creditMinor: 0n },
          { accountId: revAccId, debitMinor: 0n, creditMinor: 50000000n },
        ],
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(PostingError);
  });

  it("I3 tutup tahun tanpa akun laba ditahan ditolak (LABA_DITAHAN_WAJIB), periode tetap OPEN", async () => {
    const { orgId: oid } = await makeOrg("PT Tanpa RE");
    await db.insert(fiscalPeriods).values([
      {
        orgId: oid,
        name: "2026-12",
        startsOn: "2026-12-01",
        endsOn: "2026-12-31",
        status: "OPEN",
      },
    ]);
    await expect(
      closePeriod(db, {
        orgId: oid,
        periodName: "2026-12",
        actorEmail: "test@example.com",
      })
    ).rejects.toThrow("LABA_DITAHAN_WAJIB");
    const [p] = await db
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.orgId, oid))
      .limit(1);
    expect(p.status).toBe("OPEN");
  });
});
