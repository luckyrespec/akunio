import { eq } from "drizzle-orm";
import { withOrg } from "@/server/db/repos/with-org";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import {
  balanceSheet,
  incomeStatement,
  cashFlowIndirect,
  changesInEquity,
} from "@/core/reports/statements";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { listPeriods as listPeriodsRepo, setPeriodStatus } from "@/server/db/repos/periods.repo";
import { listFindings } from "@/server/db/repos/findings.repo";
import { Money } from "@/core/money/money";
import type { ToolDefinition, ToolHandler } from "./types";

export const reportsToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "get_report",
    description: "Ambil laporan keuangan resmi: neraca, laba_rugi, arus_kas, atau perubahan_ekuitas.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["neraca", "laba_rugi", "arus_kas", "perubahan_ekuitas"],
        },
        period: { type: "string", description: "Format YYYY-MM, kosongkan untuk periode berjalan" },
      },
      required: ["type"],
    },
  },
  {
    type: "function",
    name: "get_financial_kpis",
    description: "Ambil metrik finansial real-time: Total Kas & Bank, dan Laba Bersih Tahun Berjalan.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "get_daily_briefing",
    description: "Ambil ringkasan briefing keuangan harian: saldo kas/bank live, pending draft review, piutang tempo, dan dokumen belum dicatat.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "drilldown_account_details",
    description: "Analisis rincian mutasi transaksi suatu akun untuk mengidentifikasi penyebab kenaikan beban atau anomali.",
    parameters: {
      type: "object",
      properties: {
        accountCode: { type: "string", description: "Kode akun COA (contoh: '5-2020')" },
        period: { type: "string", description: "Periode target YYYY-MM (contoh: '2026-08')" },
        comparePeriod: { type: "string", description: "Periode komparasi YYYY-MM (contoh: '2026-07')" },
      },
      required: ["accountCode", "period"],
    },
  },
  {
    type: "function",
    name: "list_periods",
    description: "Lihat status semua periode akuntansi (OPEN/CLOSED/LOCKED).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "open_period",
    description: "Buka periode akuntansi baru atau ubah status periode menjadi OPEN.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama periode, format YYYY-MM, misal: 2026-10" },
        startsOn: { type: "string", description: "Tanggal mulai YYYY-MM-DD" },
        endsOn: { type: "string", description: "Tanggal selesai YYYY-MM-DD" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "close_period",
    description: "Tutup/kunci periode akuntansi berjalan agar tidak ada mutasi baru.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama periode YYYY-MM yang ingin ditutup" },
      },
      required: ["name"],
    },
  },
  {
    type: "function",
    name: "check_accounting_health",
    description: "Jalankan diagnosa kesehatan pembukuan dan temuan anomali akuntansi.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

export const reportsHandlers: Record<string, ToolHandler> = {
  get_report: async (orgId, _actorEmail, args) => {
    const reportType = String(args.type);
    const periodStr = args.period ? String(args.period) : undefined;
    const { period, lines, accRows } = await withOrg(orgId, async (tx) => {
      const period = await loadPeriodOrDefault(tx, orgId, periodStr);
      const lines = await postedLinesThrough(tx, orgId, period.endsOn);
      const accRows = await tx.select().from(accounts).where(eq(accounts.orgId, orgId));
      return { period, lines, accRows };
    });
    const metas = reportMetaMap(accRows);
    const aggs = aggregateFromLines(lines, metas);
    const ytd = incomeStatement(aggs);

    let res: unknown = null;
    if (reportType === "neraca") {
      res = balanceSheet(aggs, ytd.netIncomeMinor);
    } else if (reportType === "laba_rugi") {
      res = ytd;
    } else if (reportType === "arus_kas") {
      res = cashFlowIndirect({
        netIncomeMinor: ytd.netIncomeMinor,
        deltaPiutangMinor: 0n,
        deltaPersediaanMinor: 0n,
        deltaUtangUsahaMinor: 0n,
        depreciationMinor: 0n,
        investingMinor: 0n,
        financingMinor: 0n,
      });
    } else if (reportType === "perubahan_ekuitas") {
      res = changesInEquity({
        openingRetainedEarningsMinor: 0n,
        contributionsMinor: 0n,
        drawingsMinor: 0n,
        netIncomeMinor: ytd.netIncomeMinor,
      });
    }
    return { success: true, data: res };
  },

  get_financial_kpis: async (orgId) => {
    const year = new Date().getFullYear();
    const yearEndISO = `${year}-12-31`;
    const { accRows, cashLines } = await withOrg(orgId, async (tx) => ({
      accRows: await tx.select().from(accounts).where(eq(accounts.orgId, orgId)),
      cashLines: await postedLinesThrough(tx, orgId, yearEndISO),
    }));
    const metas = reportMetaMap(accRows);
    const aggs = aggregateFromLines(cashLines, metas);
    const cashMinor = aggs
      .filter((a) => a.meta.isCash || a.meta.isBank)
      .reduce((s, a) => s + signed(a.meta, a), 0n);
    const ytd = incomeStatement(aggs);

    return {
      success: true,
      data: {
        cashAndBank: Money.fromMinor(cashMinor).formatIdr(),
        ytdNetIncome: Money.fromMinor(ytd.netIncomeMinor).formatIdr(),
      },
    };
  },

  get_daily_briefing: async (orgId) => {
    const { getDailyBriefingData } = await import("@/server/reports/briefing");
    const briefing = await getDailyBriefingData(orgId);
    return { success: true, data: briefing };
  },

  drilldown_account_details: async (orgId, _actorEmail, args) => {
    const { drilldownAccountDetails } = await import("@/server/reports/drilldown");
    const accountCode = String(args.accountCode);
    const period = String(args.period);
    const comparePeriod = args.comparePeriod ? String(args.comparePeriod) : undefined;
    const res = await drilldownAccountDetails(orgId, accountCode, period, comparePeriod);
    return { success: true, data: res };
  },

  list_periods: async (orgId) => {
    const periods = await withOrg(orgId, (tx) => listPeriodsRepo(tx, orgId));
    return {
      success: true,
      data: periods.map((p) => ({
        id: p.id,
        name: p.name,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
        status: p.status,
      })),
    };
  },

  open_period: async (orgId, _actorEmail, args) => {
    const name = String(args.name ?? "").trim();
    const periods = await withOrg(orgId, (tx) => listPeriodsRepo(tx, orgId));
    const existing = periods.find((p) => p.name === name);

    if (existing) {
      await withOrg(orgId, async (tx) => {
        await setPeriodStatus(tx, orgId, existing.id, "OPEN");
        await appendAudit(tx, {
          orgId,
          actor: "akunio",
          action: "AKUNIO_OPEN_PERIOD",
          subjectType: "fiscal_period",
          subjectId: existing.id,
          data: { name },
        });
      });
      return { success: true, data: { name, status: "OPEN" } };
    } else {
      const startsOn = args.startsOn ? String(args.startsOn) : `${name}-01`;
      const endsOn = args.endsOn ? String(args.endsOn) : `${name}-28`;
      const [created] = await withOrg(orgId, async (tx) => {
        const [p] = await tx.insert(fiscalPeriods).values({
          orgId,
          name,
          startsOn,
          endsOn,
          status: "OPEN",
        }).returning();
        await appendAudit(tx, {
          orgId,
          actor: "akunio",
          action: "AKUNIO_CREATE_PERIOD",
          subjectType: "fiscal_period",
          subjectId: p.id,
          data: { name, startsOn, endsOn },
        });
        return [p];
      });
      return { success: true, data: { name: created.name, status: "OPEN" } };
    }
  },

  close_period: async (orgId, _actorEmail, args) => {
    const name = String(args.name ?? "").trim();
    const periods = await withOrg(orgId, (tx) => listPeriodsRepo(tx, orgId));
    const existing = periods.find((p) => p.name === name);
    if (!existing) return { success: false, error: `Periode ${name} tidak ditemukan.` };

    await withOrg(orgId, async (tx) => {
      await setPeriodStatus(tx, orgId, existing.id, "CLOSED");
      await appendAudit(tx, {
        orgId,
        actor: "akunio",
        action: "AKUNIO_CLOSE_PERIOD",
        subjectType: "fiscal_period",
        subjectId: existing.id,
        data: { name },
      });
    });

    return { success: true, data: { name, status: "CLOSED" } };
  },

  check_accounting_health: async (orgId) => {
    const findings = await withOrg(orgId, (tx) => listFindings(tx, orgId, "open"));
    return {
      success: true,
      data: {
        openFindingsCount: findings.length,
        findings: findings.map((f) => ({
          id: f.id,
          type: f.type,
          severity: f.severity,
          evidence: f.evidence,
        })),
      },
    };
  },
};
