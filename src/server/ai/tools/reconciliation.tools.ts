import { db } from "@/server/db";
import { Money } from "@/core/money/money";
import type { ToolDefinition, ToolHandler } from "./types";

export const reconciliationToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "get_bank_reconciliation_status",
    description: "Cek status sesi rekonsiliasi rekening koran bank terbaru, saldo bank, saldo buku, dan selisih.",
    parameters: {
      type: "object",
      properties: {
        bankCode: { type: "string", description: "Kode akun bank di COA (misal: 1120)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "auto_match_bank_reconciliation",
    description: "Jalankan auto-match cerdas 3-tingkat untuk mencocokkan mutasi bank dengan buku besar kas/bank.",
    parameters: {
      type: "object",
      properties: {
        reconciliationId: { type: "string", description: "ID sesi rekonsiliasi (opsional jika ingin mencocokkan sesi terbaru)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "batch_analyze_documents",
    description: "Analisis banyak dokumen struk sekaligus dan kelompokkan menjadi transaksi siap posting vs perlu review.",
    parameters: {
      type: "object",
      properties: {
        documentIds: {
          type: "array",
          items: { type: "string" },
          description: "Daftar ID dokumen di sistem",
        },
      },
      required: ["documentIds"],
    },
  },
];

export const reconciliationHandlers: Record<string, ToolHandler> = {
  get_bank_reconciliation_status: async (orgId, _actorEmail, args) => {
    const { listReconciliationsRepo } = await import("@/server/db/repos/reconciliation.repo");

    const list = await listReconciliationsRepo(db, orgId);
    if (list.length === 0) {
      return {
        success: true,
        data: {
          status: "NO_SESSIONS",
          message: "Belum ada sesi rekonsiliasi bank yang tercatat.",
          suggestions: ["Mulai Rekonsiliasi Baru", "Unggah Rekening Koran"],
        },
      };
    }

    let target = list[0];
    if (args.bankCode) {
      const found = list.find((r) => r.bankAccountCode === String(args.bankCode));
      if (found) target = found;
    }

    const stmtBal = Money.fromMinor(target.statementBalanceMinor).formatIdr();
    const ledgerBal = Money.fromMinor(target.ledgerBalanceMinor).formatIdr();
    const diff = Money.fromMinor(target.differenceMinor).formatIdr();

    return {
      success: true,
      data: {
        reconciliationId: target.id,
        bankAccount: `${target.bankAccountCode} - ${target.bankAccountName}`,
        statementDate: target.statementDate,
        statementBalanceFormatted: stmtBal,
        ledgerBalanceFormatted: ledgerBal,
        differenceFormatted: diff,
        status: target.status,
        suggestions: [
          "Jalankan Auto-Match Rekonsiliasi",
          "Buka Worksheet Rekonsiliasi",
          "Lihat Sesi Rekonsiliasi Lainnya",
        ],
      },
    };
  },

  auto_match_bank_reconciliation: async (orgId, _actorEmail, args) => {
    const { runAutoMatchAction } = await import("@/server/actions/reconciliation.actions");
    const { listReconciliationsRepo } = await import("@/server/db/repos/reconciliation.repo");

    let recId = args.reconciliationId ? String(args.reconciliationId) : undefined;
    if (!recId) {
      const list = await listReconciliationsRepo(db, orgId);
      const active = list.find((r) => r.status === "IN_PROGRESS") || list[0];
      if (!active) {
        return { success: false, error: "Tidak ada sesi rekonsiliasi aktif yang dapat dicocokkan." };
      }
      recId = active.id;
    }

    const res = await runAutoMatchAction(recId);
    if (!res.ok) {
      return { success: false, error: res.error };
    }

    return {
      success: true,
      data: {
        exactMatchesCount: res.data.exactMatches.length,
        aiSuggestionsCount: res.data.aiSuggestions.length,
        unmatchedCount: res.data.unmatchedStatementLineIds.length,
        suggestions: ["Buka Worksheet Rekonsiliasi", "Selesaikan Rekonsiliasi"],
      },
    };
  },

  batch_analyze_documents: async (orgId, _actorEmail, args) => {
    const { batchAnalyzeDocuments } = await import("@/server/ai/batch-documents");
    const docIds = Array.isArray(args.documentIds) ? (args.documentIds as string[]) : [];
    const res = await batchAnalyzeDocuments(orgId, docIds);
    return { success: true, data: res };
  },
};
