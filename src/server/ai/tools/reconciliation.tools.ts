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
  {
    type: "function",
    name: "ingest_bank_statement",
    description:
      "Impor rekening koran bank dari dokumen yang sudah diunggah: ekstrak mutasi lalu buat sesi rekonsiliasi baru. Mutating: membuat sesi + baris statement.",
    parameters: {
      type: "object",
      properties: {
        storageKey: { type: "string", description: "Kunci dokumen di penyimpanan (dari lampiran)" },
        mime: { type: "string", description: "Tipe MIME dokumen (mis. application/pdf, image/png)" },
        bankAccountCode: { type: "string", description: "Kode akun bank di COA (misal: 1120)" },
        statementDate: {
          type: "string",
          description: "Tanggal cut-off YYYY-MM-DD (opsional, default akhir periode koran)",
        },
      },
      required: ["storageKey", "mime", "bankAccountCode"],
    },
  },
  {
    type: "function",
    name: "get_bank_transactions",
    description:
      "Ambil daftar mutasi rekening koran (statement lines) dari satu sesi rekonsiliasi. Read-only.",
    parameters: {
      type: "object",
      properties: {
        reconciliationId: { type: "string", description: "ID sesi rekonsiliasi" },
        onlyUnmatched: {
          type: "boolean",
          description: "Bila true, hanya baris yang belum cocok (default false)",
        },
      },
      required: ["reconciliationId"],
    },
  },
  {
    type: "function",
    name: "get_book_transactions",
    description:
      "Ambil daftar baris jurnal buku besar akun bank yang belum cocok (belum ter-match). Read-only.",
    parameters: {
      type: "object",
      properties: {
        bankAccountCode: { type: "string", description: "Kode akun bank di COA (misal: 1120)" },
        fromISO: { type: "string", description: "Batas bawah tanggal YYYY-MM-DD (opsional)" },
        toISO: { type: "string", description: "Batas atas tanggal YYYY-MM-DD (opsional)" },
      },
      required: ["bankAccountCode"],
    },
  },
  {
    type: "function",
    name: "find_unmatched",
    description:
      "Ringkasan sisi yang belum cocok dari satu sesi rekonsiliasi: mutasi koran vs baris buku. Read-only, bahan pertanyaan agen ke pengguna.",
    parameters: {
      type: "object",
      properties: {
        reconciliationId: { type: "string", description: "ID sesi rekonsiliasi" },
      },
      required: ["reconciliationId"],
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

  ingest_bank_statement: async (orgId, _actorEmail, args) => {
    const storageKey = typeof args.storageKey === "string" ? args.storageKey : "";
    const mime = typeof args.mime === "string" ? args.mime : "";
    const bankAccountCode = typeof args.bankAccountCode === "string" ? args.bankAccountCode : "";
    const statementDateArg = typeof args.statementDate === "string" ? args.statementDate : "";
    if (!storageKey || !mime || !bankAccountCode) {
      return { success: false, error: "storageKey, mime, dan bankAccountCode wajib diisi." };
    }
    try {
      const { getDocument } = await import("@/server/storage/storage");
      const { extractBankStatement } = await import("@/server/ai/bank-statement-extractor");
      const buffer = await getDocument(storageKey);
      const extracted = await extractBankStatement(buffer, mime);
      if (extracted.transactions.length === 0) {
        return { success: false, error: "Tidak ada mutasi yang dapat dibaca dari rekening koran." };
      }
      const { withOrg } = await import("@/server/db/repos/with-org");
      const created = await withOrg(orgId, async (tx) => {
        const { accounts } = await import("@/server/db/schema/org");
        const { eq, and } = await import("drizzle-orm");
        const { createReconciliationRepo, saveStatementLinesRepo } = await import(
          "@/server/db/repos/reconciliation.repo"
        );
        const [acct] = await tx
          .select()
          .from(accounts)
          .where(and(eq(accounts.orgId, orgId), eq(accounts.code, bankAccountCode)))
          .limit(1);
        if (!acct) {
          throw new Error(`Akun bank dengan kode ${bankAccountCode} tidak ditemukan.`);
        }
        const statementDate = statementDateArg || extracted.statementPeriod.to;
        // Extractor sudah mengembalikan minor (BigInt) — JANGAN Math.round(*100) ulang.
        const rec = await createReconciliationRepo(tx, orgId, {
          bankAccountId: acct.id,
          statementDate,
          statementBalanceMinor: extracted.closingBalanceMinor,
          fileUrl: storageKey,
        });
        await saveStatementLinesRepo(
          tx,
          rec.id,
          extracted.transactions.map((t) => ({
            transactionDate: t.date,
            description: t.description,
            type: t.type,
            amountMinor: t.amountMinor,
            referenceNumber: t.referenceNumber ?? null,
          })),
        );
        return { rec, accountName: acct.name, count: extracted.transactions.length };
      });
      return {
        success: true,
        data: {
          reconciliationId: created.rec.id,
          bankAccount: `${bankAccountCode} - ${created.accountName}`,
          linesCount: created.count,
          statementBalanceMinor: created.rec.statementBalanceMinor.toString(),
          suggestions: ["Jalankan Auto-Match Rekonsiliasi", "Lihat Mutasi Belum Cocok"],
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Gagal mengimpor rekening koran.",
      };
    }
  },

  get_bank_transactions: async (orgId, _actorEmail, args) => {
    const reconciliationId = typeof args.reconciliationId === "string" ? args.reconciliationId : "";
    if (!reconciliationId) {
      return { success: false, error: "reconciliationId wajib diisi." };
    }
    const onlyUnmatched = args.onlyUnmatched === true;
    try {
      const { withOrg } = await import("@/server/db/repos/with-org");
      const { getReconciliationByIdRepo } = await import("@/server/db/repos/reconciliation.repo");
      const rec = await withOrg(orgId, (tx) => getReconciliationByIdRepo(tx, orgId, reconciliationId));
      if (!rec) {
        return { success: false, error: "Sesi rekonsiliasi tidak ditemukan." };
      }
      const lines = onlyUnmatched
        ? rec.lines.filter((l) => l.matchStatus === "UNMATCHED")
        : rec.lines;
      return {
        success: true,
        data: {
          reconciliationId,
          lines: lines.map((l) => ({
            id: l.id,
            date: l.transactionDate,
            description: l.description,
            amountMinor: l.amountMinor.toString(),
            status: l.matchStatus,
          })),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Gagal membaca mutasi koran bank.",
      };
    }
  },

  get_book_transactions: async (orgId, _actorEmail, args) => {
    const bankAccountCode = typeof args.bankAccountCode === "string" ? args.bankAccountCode : "";
    if (!bankAccountCode) {
      return { success: false, error: "bankAccountCode wajib diisi." };
    }
    const fromISO = typeof args.fromISO === "string" ? args.fromISO : undefined;
    const toISO = typeof args.toISO === "string" ? args.toISO : undefined;
    try {
      const { withOrg } = await import("@/server/db/repos/with-org");
      const rows = await withOrg(orgId, async (tx) => {
        const { accounts } = await import("@/server/db/schema/org");
        const { eq, and } = await import("drizzle-orm");
        const { getUnmatchedLedgerLinesRepo } = await import(
          "@/server/db/repos/reconciliation.repo"
        );
        const [acct] = await tx
          .select()
          .from(accounts)
          .where(and(eq(accounts.orgId, orgId), eq(accounts.code, bankAccountCode)))
          .limit(1);
        if (!acct) {
          throw new Error(`Akun bank dengan kode ${bankAccountCode} tidak ditemukan.`);
        }
        return getUnmatchedLedgerLinesRepo(tx, orgId, acct.id, toISO);
      });
      const filtered = fromISO ? rows.filter((r) => r.date >= fromISO) : rows;
      return {
        success: true,
        data: {
          bankAccountCode,
          lines: filtered.map((r) => ({
            id: r.id,
            date: r.date,
            description: r.memo,
            amountMinor: (r.debitMinor - r.creditMinor).toString(),
            debitMinor: r.debitMinor.toString(),
            creditMinor: r.creditMinor.toString(),
          })),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Gagal membaca mutasi buku besar bank.",
      };
    }
  },

  find_unmatched: async (orgId, _actorEmail, args) => {
    const reconciliationId = typeof args.reconciliationId === "string" ? args.reconciliationId : "";
    if (!reconciliationId) {
      return { success: false, error: "reconciliationId wajib diisi." };
    }
    try {
      const { withOrg } = await import("@/server/db/repos/with-org");
      const summary = await withOrg(orgId, async (tx) => {
        const { getReconciliationByIdRepo, getUnmatchedLedgerLinesRepo } = await import(
          "@/server/db/repos/reconciliation.repo"
        );
        const rec = await getReconciliationByIdRepo(tx, orgId, reconciliationId);
        if (!rec) {
          throw new Error("Sesi rekonsiliasi tidak ditemukan.");
        }
        const unmatchedStatement = rec.lines.filter((l) => l.matchStatus === "UNMATCHED");
        const unmatchedLedger = await getUnmatchedLedgerLinesRepo(
          tx,
          orgId,
          rec.bankAccountId,
          rec.statementDate,
        );
        return { rec, unmatchedStatement, unmatchedLedger };
      });
      return {
        success: true,
        data: {
          reconciliationId,
          unmatchedStatement: summary.unmatchedStatement.map((l) => ({
            id: l.id,
            date: l.transactionDate,
            description: l.description,
            amountMinor: l.amountMinor.toString(),
            status: l.matchStatus,
          })),
          unmatchedLedger: summary.unmatchedLedger.map((r) => ({
            id: r.id,
            date: r.date,
            description: r.memo,
            amountMinor: (r.debitMinor - r.creditMinor).toString(),
          })),
          counts: {
            unmatchedStatement: summary.unmatchedStatement.length,
            unmatchedLedger: summary.unmatchedLedger.length,
          },
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : "Gagal merangkum sisi yang belum cocok.",
      };
    }
  },
};
