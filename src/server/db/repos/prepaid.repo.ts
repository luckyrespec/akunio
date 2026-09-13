import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import type { Queryable } from "./queryable";
import { prepaidContracts, prepaidScheduleLines } from "../schema/prepaid";
import { postJournalEntry } from "./journals.repo";
import { getSubledgerControls } from "./subledger.repo";
import { calculateAmortizationSchedule } from "@/core/prepaid/amortization";

export interface CreatePrepaidContractInput {
  orgId: string;
  name: string;
  vendor?: string;
  startDate: string; // YYYY-MM-DD
  months: number;
  totalMinor: bigint;
  controlAccountId: string;
  expenseAccountId: string;
  paymentAccountId: string;
  postedBy: string;
  notes?: string;
}

export async function createPrepaidContract(
  q: Queryable,
  input: CreatePrepaidContractInput,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate))
    throw new Error("TANGGAL_TIDAK_VALID: tanggal mulai wajib format YYYY-MM-DD.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120)
    throw new Error("NAMA_TIDAK_VALID: nama kontrak 2–120 huruf.");
  // Melempar JUMLAH_BULAN_TIDAK_VALID / NOMINAL_TIDAK_VALID bila input buruk.
  const schedule = calculateAmortizationSchedule({
    totalMinor: input.totalMinor,
    startDate: input.startDate,
    months: input.months,
  });

  const controls = await getSubledgerControls(q, input.orgId);
  const dimuka = controls.find((c) => c.kind === "DIMUKA");
  if (!dimuka)
    throw new Error("DIMUKA_BELUM_DIPETAKAN: registry subledger DIMUKA belum di-seed (dijalankan otomatis saat onboarding)");
  if (dimuka.controlAccountId !== input.controlAccountId)
    throw new Error("KONTROL_TIDAK_COCok: akun kontrol kontrak wajib sama dengan registry DIMUKA");

  const year = input.startDate.slice(0, 4);
  // Serialkan penomoran DM-YYYY-NNNN per org-tahun (anti-race): pemanggil
  // menjalankan fungsi ini di dalam transaksi (withOrg) sehingga xact lock
  // membuat read-modify-write kode di bawah atomik antar penulis konkuren.
  await q.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`dm:${input.orgId}:${year}`}))`);
  const [last] = await q
    .select({ code: prepaidContracts.code })
    .from(prepaidContracts)
    .where(and(eq(prepaidContracts.orgId, input.orgId), like(prepaidContracts.code, `DM-${year}-%`)))
    .orderBy(desc(prepaidContracts.code))
    .limit(1);
  let nextSeq = 1;
  if (last?.code) {
    const m = last.code.match(/DM-\d{4}-(\d+)/);
    if (m) nextSeq = parseInt(m[1], 10) + 1;
  }
  const code = `DM-${year}-${String(nextSeq).padStart(4, "0")}`;
  const contractId = randomUUID();

  await q.insert(prepaidContracts).values({
    id: contractId,
    orgId: input.orgId,
    code,
    name,
    vendor: input.vendor?.trim() || null,
    controlAccountId: input.controlAccountId,
    expenseAccountId: input.expenseAccountId,
    paymentAccountId: input.paymentAccountId,
    totalMinor: input.totalMinor,
    startDate: input.startDate,
    months: input.months,
    monthlyMinor: input.totalMinor / BigInt(input.months),
    accumulatedMinor: 0n,
    remainingMinor: input.totalMinor,
    status: "ACTIVE",
    notes: input.notes?.trim() || null,
  });
  await q.insert(prepaidScheduleLines).values(
    schedule.map((s) => ({
      orgId: input.orgId,
      contractId,
      periodName: s.periodName,
      amortDate: s.amortDate,
      amountMinor: s.amountMinor,
      accumulatedMinor: s.accumulatedMinor,
      remainingMinor: s.remainingMinor,
      status: "SCHEDULED" as const,
    })),
  );

  // Jurnal awal Dr 1600 / Cr kas-bank. Validasi akun (induk/arsip/tidak dikenal)
  // dan periode dikerjakan postJournalEntry; gagal di sini me-rollback kontrak
  // + jadwal karena pemanggil membungkus semuanya dalam satu transaksi.
  const je = await postJournalEntry(q, input.orgId, input.postedBy, {
    dateISO: input.startDate,
    memo: `Sewa dibayar di muka: ${name} (${code})`,
    source: "DIMUKA",
    idempotencyKey: `dimuka-open-${input.orgId}-${code}`,
    lines: [
      {
        accountId: input.controlAccountId,
        debitMinor: input.totalMinor,
        creditMinor: 0n,
        subledgerLinks: [{ kind: "DIMUKA", refId: contractId, amountMinor: input.totalMinor }],
      },
      { accountId: input.paymentAccountId, debitMinor: 0n, creditMinor: input.totalMinor },
    ],
  });

  const [contract] = await q.select().from(prepaidContracts)
    .where(and(eq(prepaidContracts.orgId, input.orgId), eq(prepaidContracts.id, contractId)))
    .limit(1);
  return { contract, openingEntryId: je.id };
}

export async function postMonthlyAmortization(
  q: Queryable,
  params: {
    orgId: string;
    periodName: string; // YYYY-MM
    postedBy: string;
    contractId?: string;
  },
) {
  const { orgId, periodName, postedBy, contractId } = params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodName))
    throw new Error("PERIODE_TIDAK_VALID: periodName wajib format YYYY-MM.");

  const conds = [
    eq(prepaidScheduleLines.orgId, orgId),
    eq(prepaidScheduleLines.periodName, periodName),
    eq(prepaidScheduleLines.status, "SCHEDULED"),
  ];
  if (contractId) conds.push(eq(prepaidScheduleLines.contractId, contractId));
  const lines = await q
    .select({
      lineId: prepaidScheduleLines.id,
      contractId: prepaidScheduleLines.contractId,
      amountMinor: prepaidScheduleLines.amountMinor,
      amortDate: prepaidScheduleLines.amortDate,
      expenseAccountId: prepaidContracts.expenseAccountId,
      controlAccountId: prepaidContracts.controlAccountId,
    })
    .from(prepaidScheduleLines)
    .innerJoin(prepaidContracts, eq(prepaidScheduleLines.contractId, prepaidContracts.id))
    .where(and(...conds, eq(prepaidContracts.status, "ACTIVE")));

  if (lines.length === 0) return { postedCount: 0, journalEntryId: null };

  // Baris nol (total < jumlah bulan) ditandai POSTED tanpa jurnal — meniru depresiasi.
  const zeroIds = lines.filter((l) => l.amountMinor <= 0n).map((l) => l.lineId);
  if (zeroIds.length > 0) {
    await q.update(prepaidScheduleLines).set({ status: "POSTED" })
      .where(inArray(prepaidScheduleLines.id, zeroIds));
  }
  const valid = lines.filter((l) => l.amountMinor > 0n);
  let journalEntryId: string | null = null;
  if (valid.length > 0) {
    const groups = new Map<string, {
      expenseAccountId: string; controlAccountId: string;
      total: bigint; perContract: Map<string, bigint>;
    }>();
    for (const l of valid) {
      const key = `${l.expenseAccountId}|${l.controlAccountId}`;
      const g = groups.get(key) ?? {
        expenseAccountId: l.expenseAccountId, controlAccountId: l.controlAccountId,
        total: 0n, perContract: new Map<string, bigint>(),
      };
      g.total += l.amountMinor;
      g.perContract.set(l.contractId, (g.perContract.get(l.contractId) ?? 0n) + l.amountMinor);
      groups.set(key, g);
    }
    const glLines = [...groups.values()].flatMap((g) => [
      { accountId: g.expenseAccountId, debitMinor: g.total, creditMinor: 0n },
      {
        accountId: g.controlAccountId, debitMinor: 0n, creditMinor: g.total,
        subledgerLinks: [...g.perContract.entries()].map(([refId, amountMinor]) => ({
          kind: "DIMUKA" as const, refId, amountMinor,
        })),
      },
    ]);
    const je = await postJournalEntry(q, orgId, postedBy, {
      dateISO: valid[0].amortDate,
      memo: `Amortisasi dimuka periode ${periodName}`,
      source: "DIMUKA",
      idempotencyKey: `amort-${orgId}-${contractId ?? "all"}-${periodName}`,
      lines: glLines,
    });
    journalEntryId = je.id;
    await q.update(prepaidScheduleLines)
      .set({ status: "POSTED", journalEntryId: je.id })
      .where(inArray(prepaidScheduleLines.id, valid.map((l) => l.lineId)));
  }

  // Akumulasi + sisa per kontrak yang tersentuh periode ini.
  const touched = [...new Set(lines.map((l) => l.contractId))];
  for (const cid of touched) {
    const posted = await q.select({ amountMinor: prepaidScheduleLines.amountMinor })
      .from(prepaidScheduleLines)
      .where(and(
        eq(prepaidScheduleLines.contractId, cid),
        eq(prepaidScheduleLines.status, "POSTED"),
      ));
    const acc = posted.reduce((a, r) => a + r.amountMinor, 0n);
    const [c] = await q.select({ totalMinor: prepaidContracts.totalMinor })
      .from(prepaidContracts).where(eq(prepaidContracts.id, cid)).limit(1);
    const remaining = c.totalMinor - acc;
    await q.update(prepaidContracts)
      .set({
        accumulatedMinor: acc,
        remainingMinor: remaining,
        status: remaining <= 0n ? "COMPLETED" : "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(prepaidContracts.id, cid));
  }

  return { postedCount: lines.length, journalEntryId };
}
