import { and, eq } from "drizzle-orm";
import { Money } from "@/core/money/money";
import { validateJournalLines } from "../controls/validation";
import { withOrg } from "@/server/db/repos/with-org";
import { findPeriodByDate } from "@/server/db/repos/periods.repo";
import { invoices } from "@/server/db/schema/invoicing";
import type { ToolDefinition, ToolHandler } from "./types";

export const accountingValidateToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "calculate_tax",
    description: "Hitung PPN/pajak dari nominal dasar rupiah dan persen tarif. Murni kalkulasi, tanpa akses database.",
    parameters: {
      type: "object",
      properties: {
        baseText: { type: "string", description: "Nominal dasar (DPP) rupiah, mis. '10000000' atau 'Rp10.000.000'" },
        ratePercent: { type: "number", description: "Tarif pajak persen 0–100, mis. 11" },
      },
      required: ["baseText", "ratePercent"],
    },
  },
  {
    type: "function",
    name: "validate_journal_entry",
    description: "Validasi format dan keseimbangan (debit==kredit) draf jurnal. Tanpa cek akun/periode — itu milik control layer saat approval.",
    parameters: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              accountCode: { type: "string", description: "Kode akun" },
              debitText: { type: "string", description: "Nominal debit rupiah; string kosong bila nol" },
              creditText: { type: "string", description: "Nominal kredit rupiah; string kosong bila nol" },
            },
            required: ["accountCode", "debitText", "creditText"],
          },
        },
      },
      required: ["lines"],
    },
  },
  {
    type: "function",
    name: "check_period",
    description: "Cek periode fiskal yang menaungi sebuah tanggal transaksi beserta statusnya (OPEN/CLOSED/LOCKED).",
    parameters: {
      type: "object",
      properties: {
        dateISO: { type: "string", description: "Tanggal transaksi YYYY-MM-DD" },
      },
      required: ["dateISO"],
    },
  },
  {
    type: "function",
    name: "detect_duplicate_invoice",
    description: "Cek apakah nomor faktur sudah dipakai di organisasi ini (predikat read-only anti-duplikat).",
    parameters: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Nomor faktur yang dicek" },
      },
      required: ["invoiceNumber"],
    },
  },
  {
    type: "function",
    name: "calculate_variance",
    description: "Hitung selisih dan perubahan basis-poin antara nominal kini dan nominal pembanding. Murni kalkulasi, tanpa akses database.",
    parameters: {
      type: "object",
      properties: {
        currentText: { type: "string", description: "Nominal kini rupiah" },
        priorText: { type: "string", description: "Nominal pembanding rupiah" },
      },
      required: ["currentText", "priorText"],
    },
  },
];

export const accountingValidateHandlers: Record<string, ToolHandler> = {
  calculate_tax: async (_orgId, _actorEmail, args) => {
    const rate = Number(args.ratePercent);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return { success: false, error: "Tarif pajak harus angka 0–100." };
    }
    let baseMinor: bigint;
    try {
      baseMinor = Money.parseIdr(String(args.baseText ?? "")).minor;
    } catch {
      return { success: false, error: `Nominal dasar "${String(args.baseText ?? "")}" tidak valid.` };
    }
    const bps = BigInt(Math.round(rate * 100));
    const taxMinor = (baseMinor * bps) / 10000n;
    const totalMinor = baseMinor + taxMinor;
    return {
      success: true,
      data: {
        baseMinor: baseMinor.toString(),
        taxMinor: taxMinor.toString(),
        totalMinor: totalMinor.toString(),
      },
    };
  },

  validate_journal_entry: async (_orgId, _actorEmail, args) => {
    const raw = Array.isArray(args.lines) ? (args.lines as Array<Record<string, unknown>>) : [];
    const lines = raw.map((l) => ({
      accountCode: String(l.accountCode ?? ""),
      debitText: String(l.debitText ?? ""),
      creditText: String(l.creditText ?? ""),
    }));
    // Tanpa DB: akun dianggap ada & postable (cek akun+periode milik control
    // layer saat approval) — hanya format satu-sisi + keseimbangan yang dicek.
    const accounts = lines.map((l) => ({ code: l.accountCode, parentCode: null, archivedAt: null }));
    const { ok, errors } = validateJournalLines(lines, { accounts, periodStatus: null, periodName: null });
    if (!ok) {
      return { success: false, error: errors.join("; ") };
    }
    return { success: true, data: { ok: true } };
  },

  check_period: async (orgId, _actorEmail, args) => {
    const dateISO = String(args.dateISO ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
      return { success: false, error: `Tanggal "${String(args.dateISO ?? "")}" tidak valid (harap YYYY-MM-DD).` };
    }
    const period = await withOrg(orgId, (tx) => findPeriodByDate(tx, orgId, dateISO));
    if (!period) {
      return { success: false, error: `Tidak ada periode fiskal untuk tanggal ${dateISO}.` };
    }
    return { success: true, data: { name: period.name, status: period.status } };
  },

  detect_duplicate_invoice: async (orgId, _actorEmail, args) => {
    const invoiceNumber = String(args.invoiceNumber ?? "").trim();
    if (invoiceNumber === "") {
      return { success: false, error: "Nomor faktur wajib diisi." };
    }
    const rows = await withOrg(orgId, (tx) =>
      tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.invoiceNumber, invoiceNumber))),
    );
    return { success: true, data: { isDuplicate: rows.length > 0, count: rows.length } };
  },

  calculate_variance: async (_orgId, _actorEmail, args) => {
    let currentMinor: bigint;
    let priorMinor: bigint;
    try {
      currentMinor = Money.parseIdr(String(args.currentText ?? "")).minor;
      priorMinor = Money.parseIdr(String(args.priorText ?? "")).minor;
    } catch {
      return { success: false, error: "Nominal kini/pembanding tidak valid." };
    }
    const deltaMinor = currentMinor - priorMinor;
    const percentBps = priorMinor === 0n ? "n/a" : ((deltaMinor * 10000n) / priorMinor).toString();
    return {
      success: true,
      data: {
        currentMinor: currentMinor.toString(),
        priorMinor: priorMinor.toString(),
        deltaMinor: deltaMinor.toString(),
        percentBps,
      },
    };
  },
};
