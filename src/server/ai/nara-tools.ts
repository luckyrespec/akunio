import { db } from "@/server/db";
import { eq, and, sql } from "drizzle-orm";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import {
  balanceSheet,
  incomeStatement,
  cashFlowIndirect,
  changesInEquity,
} from "@/core/reports/statements";
import {
  reportMetaMap,
  createAccount,
  updateAccount,
  setAccountArchived,
  listAccounts as listAccountsRepo,
} from "@/server/db/repos/accounts.repo";
import {
  listEntriesWithLines,
  postJournalEntry,
  toMinor,
  dec,
} from "@/server/db/repos/journals.repo";
import { searchJournals } from "@/server/db/repos/search.repo";
import { createDraft } from "@/server/db/repos/drafts.repo";
import { appendAudit } from "@/server/db/repos/audit.repo";
import { listPeriods as listPeriodsRepo, setPeriodStatus } from "@/server/db/repos/periods.repo";
import { listFindings } from "@/server/db/repos/findings.repo";
import { Money } from "@/core/money/money";
import { DraftEntrySchema, type DraftEntry } from "./schema";
import { resolveDraftAccounts } from "@/core/ai/map-accounts";

export const SAFE_TOOLS = new Set<string>([
  "list_accounts",
  "search_journals",
  "list_journals",
  "get_report",
  "get_financial_kpis",
  "get_daily_briefing",
  "drilldown_account_details",
  "batch_analyze_documents",
  "get_ar_ap_aging",
  "get_bank_reconciliation_status",
  "list_periods",
  "check_accounting_health",
]);

export const MUTATING_TOOLS = new Set<string>([
  "create_journal_draft",
  "post_journal",
  "reverse_journal",
  "create_account",
  "update_account",
  "archive_account",
  "open_period",
  "close_period",
  "create_invoice",
  "record_invoice_payment",
  "post_invoice_to_journal",
  "auto_match_bank_reconciliation",
]);

export const ALL_NARA_TOOLS = [
  {
    type: "function",
    name: "list_accounts",
    description: "Tampilkan bagan akun (Chart of Accounts/COA) aktif organisasi.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "search_journals",
    description: "Cari entri jurnal yang sudah diposting berdasarkan kata kunci memo atau nomor JE.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci memo atau nomor jurnal" },
        limit: { type: "number", description: "Jumlah hasil maksimal (default: 5)" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "list_journals",
    description: "Ambil daftar jurnal transaksi terbaru lengkap dengan baris debit dan kredit.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Jumlah transaksi (default: 10)" },
      },
      required: [],
    },
  },
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
    name: "create_invoice",
    description: "Buat faktur penjualan (INVOICE) atau tagihan pembelian (BILL) ke pelanggan/pemasok.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["INVOICE", "BILL"], description: "Tipe dokumen: INVOICE (piutang) atau BILL (utang)" },
        customerName: { type: "string", description: "Nama pelanggan atau pemasok" },
        customerPhone: { type: "string", description: "Nomor HP / WhatsApp" },
        dueDate: { type: "string", description: "Tanggal jatuh tempo (YYYY-MM-DD)" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "Nama atau rincian barang/jasa" },
              quantity: { type: "number", description: "Jumlah unit" },
              unitPrice: { type: "number", description: "Harga per unit dalam Rupiah" },
              discount: { type: "number", description: "Potongan harga jika ada" },
              taxRate: { type: "number", description: "Tarif PPN (0, 11, atau 12)" },
            },
            required: ["description", "quantity", "unitPrice"],
          },
          description: "Daftar baris item faktur",
        },
        notes: { type: "string", description: "Catatan atau instruksi pembayaran" },
      },
      required: ["customerName", "dueDate", "items"],
    },
  },
  {
    type: "function",
    name: "record_invoice_payment",
    description: "Catat penerimaan pembayaran dari pelanggan atau pelunasan tagihan ke vendor.",
    parameters: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Nomor faktur (contoh: INV-2026-0001)" },
        paymentDate: { type: "string", description: "Tanggal pembayaran (YYYY-MM-DD)" },
        amount: { type: "number", description: "Nominal pembayaran dalam Rupiah" },
        accountCode: { type: "string", description: "Kode akun kas/bank (contoh: 1110 untuk Kas, 1120 untuk Bank)" },
        referenceNumber: { type: "string", description: "Nomor referensi atau bukti transfer" },
        notes: { type: "string", description: "Keterangan pembayaran" },
      },
      required: ["invoiceNumber", "amount"],
    },
  },
  {
    type: "function",
    name: "get_ar_ap_aging",
    description: "Lihat analisis umur piutang (AR) atau umur utang (AP) beserta invoice yang mendekati atau telah melewati jatuh tempo.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["INVOICE", "BILL"], description: "INVOICE untuk piutang, BILL untuk utang" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "post_invoice_to_journal",
    description: "Posting faktur penjualan atau pembelian yang telah disetujui ke buku besar (General Ledger).",
    parameters: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Nomor faktur yang akan diposting" },
      },
      required: ["invoiceNumber"],
    },
  },
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
    name: "list_periods",
    description: "Lihat status semua periode akuntansi (OPEN/CLOSED/LOCKED).",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "check_accounting_health",
    description: "Jalankan diagnosa kesehatan pembukuan dan temuan anomali akuntansi.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "create_journal_draft",
    description: "Buat draft jurnal double-entry baru untuk ditinjau oleh pengguna sebelum diposting.",
    parameters: {
      type: "object",
      properties: {
        memo: { type: "string", description: "Keterangan transaksi" },
        dateISO: { type: "string", description: "Tanggal transaksi YYYY-MM-DD" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              accountCode: { type: "string", description: "Kode akun (misal 1-1001)" },
              debitText: { type: "string", description: "Nominal debit rupiah" },
              creditText: { type: "string", description: "Nominal kredit rupiah" },
              confidence: { type: "number" },
              reason: { type: "string" },
            },
            required: ["accountCode", "debitText", "creditText", "confidence", "reason"],
          },
        },
        explanation: { type: "string", description: "Penjelasan logis transaksi" },
      },
      required: ["memo", "lines", "explanation"],
    },
  },
  {
    type: "function",
    name: "post_journal",
    description: "Posting transaksi resmi langsung ke buku besar sebagai jurnal JE-YYYY-NNNN.",
    parameters: {
      type: "object",
      properties: {
        memo: { type: "string", description: "Keterangan jurnal" },
        dateISO: { type: "string", description: "Tanggal transaksi YYYY-MM-DD" },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              accountCode: { type: "string", description: "Kode akun" },
              debit: { type: "string", description: "Nominal debit" },
              credit: { type: "string", description: "Nominal kredit" },
              memo: { type: "string", description: "Keterangan baris (opsional)" },
            },
            required: ["accountCode", "debit", "credit"],
          },
        },
      },
      required: ["memo", "dateISO", "lines"],
    },
  },
  {
    type: "function",
    name: "reverse_journal",
    description: "Buat jurnal pembalik (reversal) untuk membatalkan entri jurnal yang salah.",
    parameters: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "ID atau Nomor jurnal yang ingin dibalikkan" },
        reason: { type: "string", description: "Alasan pembatalan/pembalikan" },
        dateISO: { type: "string", description: "Tanggal pembalik YYYY-MM-DD" },
      },
      required: ["entryId", "reason"],
    },
  },
  {
    type: "function",
    name: "create_account",
    description: "Tambahkan akun baru ke bagan akun (COA).",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode akun unik, misal: 6-1050" },
        name: { type: "string", description: "Nama akun" },
        type: {
          type: "string",
          enum: ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"],
        },
        normal: { type: "string", enum: ["D", "K"] },
        parentCode: { type: "string", description: "Kode akun induk (opsional)" },
      },
      required: ["code", "name", "type", "normal"],
    },
  },
  {
    type: "function",
    name: "update_account",
    description: "Ubah nama akun atau kode induk akun COA.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode akun yang ingin diubah" },
        name: { type: "string", description: "Nama baru akun" },
        parentCode: { type: "string", description: "Kode akun induk baru" },
      },
      required: ["code"],
    },
  },
  {
    type: "function",
    name: "archive_account",
    description: "Arsipkan atau aktifkan kembali akun dari COA.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode akun" },
        archive: { type: "boolean", description: "true untuk arsipkan, false untuk pulihkan" },
      },
      required: ["code", "archive"],
    },
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
] as never[];

export async function executeNaraTool(
  orgId: string,
  actorEmail: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (toolName) {
      case "list_accounts": {
        const accs = await listAccountsRepo(db, orgId);
        return {
          success: true,
          data: accs.map((a) => ({
            code: a.code,
            name: a.name,
            type: a.type,
            normal: a.normal,
            archived: Boolean(a.archivedAt),
          })),
        };
      }

      case "search_journals": {
        const query = String(args.query ?? "").trim();
        const limit = Number(args.limit ?? 5);
        const rows = await db.transaction((tx) => searchJournals(tx, orgId, query, limit));
        return { success: true, data: rows };
      }

      case "list_journals": {
        const limit = Number(args.limit ?? 10);
        const rows = await db.transaction((tx) => listEntriesWithLines(tx, orgId, limit));
        return {
          success: true,
          data: rows.map((r) => ({
            id: r.id,
            number: r.number,
            date: r.entryDate,
            memo: r.memo,
            lines: r.lines.map((l) => ({
              code: l.accountCode,
              name: l.accountName,
              debit: dec(l.debitMinor),
              credit: dec(l.creditMinor),
            })),
          })),
        };
      }

      case "get_report": {
        const reportType = String(args.type);
        const periodStr = args.period ? String(args.period) : undefined;
        const period = await db.transaction((tx) => loadPeriodOrDefault(tx, orgId, periodStr));
        const lines = await postedLinesThrough(db, orgId, period.endsOn);
        const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
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
      }

      case "get_financial_kpis": {
        const year = new Date().getFullYear();
        const yearEndISO = `${year}-12-31`;
        const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
        const metas = reportMetaMap(accRows);
        const cashLines = await postedLinesThrough(db, orgId, yearEndISO);
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
      }

      case "get_daily_briefing": {
        const { getDailyBriefingData } = await import("@/server/reports/briefing");
        const briefing = await getDailyBriefingData(orgId);
        return { success: true, data: briefing };
      }

      case "drilldown_account_details": {
        const { drilldownAccountDetails } = await import("@/server/reports/drilldown");
        const accountCode = String(args.accountCode);
        const period = String(args.period);
        const comparePeriod = args.comparePeriod ? String(args.comparePeriod) : undefined;
        const res = await drilldownAccountDetails(orgId, accountCode, period, comparePeriod);
        return { success: true, data: res };
      }

      case "batch_analyze_documents": {
        const { batchAnalyzeDocuments } = await import("@/server/ai/batch-documents");
        const docIds = Array.isArray(args.documentIds) ? (args.documentIds as string[]) : [];
        const res = await batchAnalyzeDocuments(orgId, docIds);
        return { success: true, data: res };
      }

      case "create_invoice": {
        const { createInvoiceRepo } = await import("@/server/db/repos/invoices.repo");
        const { findContactByNameRepo, createContactRepo } = await import("@/server/db/repos/contacts.repo");
        const customerName = String(args.customerName || "Pelanggan Umum");
        let contact = await findContactByNameRepo(db, orgId, customerName);
        if (!contact) {
          contact = await createContactRepo(db, orgId, {
            type: args.type === "BILL" ? "VENDOR" : "CUSTOMER",
            name: customerName,
            phone: args.customerPhone ? String(args.customerPhone) : null,
          });
        }

        const itemsRaw = Array.isArray(args.items) ? args.items : [];
        const items = itemsRaw.map((it: Record<string, unknown>) => {
          const qty = Number(it.quantity || 1);
          const price = Number(it.unitPrice || 0);
          const disc = Number(it.discount || 0);
          const tax = Number(it.taxRate || 0);
          return {
            description: String(it.description || "Item"),
            quantity: String(qty),
            unitPriceMinor: BigInt(Math.round(price * 100)),
            discountMinor: BigInt(Math.round(disc * 100)),
            taxRatePercent: String(tax),
          };
        });

        const todayISO = new Date().toISOString().slice(0, 10);
        const dueDate = String(args.dueDate || todayISO);

        const inv = await createInvoiceRepo(
          db,
          orgId,
          {
            type: args.type === "BILL" ? "BILL" : "INVOICE",
            contactId: contact.id,
            issueDate: todayISO,
            dueDate,
            notes: args.notes ? String(args.notes) : null,
          },
          items
        );

        const totalFormatted = Money.fromMinor(inv.totalMinor).formatIdr();
        return {
          success: true,
          data: {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            customerName: contact.name,
            totalFormatted,
            status: inv.status,
            dueDate: inv.dueDate,
            suggestions: [
              `Posting ${inv.invoiceNumber} ke Jurnal`,
              `Kirim Reminder WhatsApp`,
              `Lihat Daftar Faktur`,
            ],
          },
        };
      }

      case "record_invoice_payment": {
        const { recordInvoicePaymentRepo } = await import("@/server/db/repos/invoices.repo");
        const { invoices } = await import("@/server/db/schema/invoicing");
        const { accounts } = await import("@/server/db/schema/org");
        const { eq, and } = await import("drizzle-orm");

        const invNum = String(args.invoiceNumber || "");
        const [inv] = await db
          .select()
          .from(invoices)
          .where(and(eq(invoices.orgId, orgId), eq(invoices.invoiceNumber, invNum)));

        if (!inv) {
          return { success: false, error: `Faktur #${invNum} tidak ditemukan.` };
        }

        const accCode = String(args.accountCode || "1120"); // Default Bank
        let [acc] = await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.orgId, orgId), eq(accounts.code, accCode)));

        if (!acc) {
          const [firstCash] = await db
            .select()
            .from(accounts)
            .where(and(eq(accounts.orgId, orgId), eq(accounts.isCash, true)));
          acc = firstCash;
        }

        if (!acc) {
          return { success: false, error: `Akun kas/bank tidak ditemukan.` };
        }

        const amtNumber = Number(args.amount || 0);
        const amountMinor = BigInt(Math.round(amtNumber * 100));
        const paymentDate = String(args.paymentDate || new Date().toISOString().slice(0, 10));

        const res = await recordInvoicePaymentRepo(db, orgId, {
          invoiceId: inv.id,
          amountMinor,
          paymentDate,
          paymentAccountId: acc.id,
          referenceNumber: args.referenceNumber ? String(args.referenceNumber) : null,
          notes: args.notes ? String(args.notes) : null,
        });

        const remainingMinor = res.updatedInvoice.totalMinor - res.updatedInvoice.amountPaidMinor;
        return {
          success: true,
          data: {
            invoiceNumber: inv.invoiceNumber,
            amountPaidFormatted: Money.fromMinor(res.updatedInvoice.amountPaidMinor).formatIdr(),
            remainingFormatted: Money.fromMinor(remainingMinor > 0n ? remainingMinor : 0n).formatIdr(),
            status: res.updatedInvoice.status,
            suggestions: [`Posting Pelunasan ke Jurnal`, `Lihat Faktur`],
          },
        };
      }

      case "get_ar_ap_aging": {
        const { getAgingReportRepo } = await import("@/server/db/repos/invoices.repo");
        const type = args.type === "BILL" ? "BILL" : "INVOICE";
        const aging = await getAgingReportRepo(db, orgId, type);

        return {
          success: true,
          data: {
            type,
            totalOutstandingFormatted: Money.fromMinor(aging.totalOutstandingMinor).formatIdr(),
            currentFormatted: Money.fromMinor(aging.buckets.currentMinor).formatIdr(),
            days1To30Formatted: Money.fromMinor(aging.buckets.days1To30Minor).formatIdr(),
            days31To60Formatted: Money.fromMinor(aging.buckets.days31To60Minor).formatIdr(),
            daysOver60Formatted: Money.fromMinor(aging.buckets.daysOver60Minor).formatIdr(),
            itemizedCount: aging.itemized.length,
            suggestions: [
              "Buat Faktur Baru",
              "Lihat Faktur Jatuh Tempo",
              "Kirim Pengingat WhatsApp",
            ],
          },
        };
      }

      case "post_invoice_to_journal": {
        const { postInvoiceToLedger } = await import("@/server/invoicing/posting");
        const { invoices } = await import("@/server/db/schema/invoicing");
        const { eq, and } = await import("drizzle-orm");

        const invNum = String(args.invoiceNumber || "");
        const [inv] = await db
          .select()
          .from(invoices)
          .where(and(eq(invoices.orgId, orgId), eq(invoices.invoiceNumber, invNum)));

        if (!inv) {
          return { success: false, error: `Faktur #${invNum} tidak ditemukan.` };
        }

        const journalId = await postInvoiceToLedger(db, orgId, inv.id, actorEmail);
        return {
          success: true,
          data: {
            invoiceNumber: inv.invoiceNumber,
            journalEntryId: journalId,
            suggestions: ["Lihat Jurnal", "Cek Buku Besar"],
          },
        };
      }

      case "get_bank_reconciliation_status": {
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
      }

      case "auto_match_bank_reconciliation": {
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
      }

      case "list_periods": {
        const periods = await listPeriodsRepo(db, orgId);
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
      }

      case "check_accounting_health": {
        const findings = await listFindings(db, orgId, "open");
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
      }

      case "create_journal_draft": {
        const parsed = DraftEntrySchema.parse({
          dateISO: new Date().toISOString().slice(0, 10),
          overallConfidence: 0.9,
          ...args,
        });
        const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
        const mapping = resolveDraftAccounts(parsed, accRows);
        const row = await db.transaction(async (tx) => {
          const d = await createDraft(tx, {
            orgId,
            kind: "TEXT",
            inputText: parsed.memo,
            draft: { ...parsed, mapping },
            model: "nara-agent",
          });
          await appendAudit(tx, {
            orgId,
            actor: "nara",
            action: "NARA_DRAFT_CREATE",
            subjectType: "ai_draft",
            subjectId: d.id,
            data: { memo: parsed.memo, linesCount: parsed.lines.length },
          });
          return d;
        });
        return { success: true, data: { draftId: row.id, memo: parsed.memo } };
      }

      case "post_journal": {
        const memo = String(args.memo ?? "").trim();
        const dateISO = String(args.dateISO ?? "").slice(0, 10);
        const rawLines = (args.lines as Array<{ accountCode: string; debit: string; credit: string; memo?: string }>) ?? [];

        const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
        const codeMap = new Map(accRows.map((a) => [a.code, a]));

        let totalDebit = 0n;
        let totalCredit = 0n;
        const lines: Array<{ accountId: string; debitMinor: bigint; creditMinor: bigint; memo?: string }> = [];

        for (const l of rawLines) {
          const acc = codeMap.get(l.accountCode);
          if (!acc) {
            return { success: false, error: `Akun dengan kode ${l.accountCode} tidak ditemukan di COA.` };
          }
          const debitMinor = toMinor(String(l.debit || "0"));
          const creditMinor = toMinor(String(l.credit || "0"));
          totalDebit += debitMinor;
          totalCredit += creditMinor;
          lines.push({
            accountId: acc.id,
            debitMinor,
            creditMinor,
            memo: l.memo,
          });
        }

        if (totalDebit !== totalCredit || totalDebit <= 0n) {
          return {
            success: false,
            error: `Jurnal tidak seimbang! Total Debit (${dec(totalDebit)}) harus sama dengan Total Kredit (${dec(totalCredit)}) dan lebih besar dari 0.`,
          };
        }

        const res = await db.transaction(async (tx) => {
          const posted = await postJournalEntry(tx, orgId, actorEmail, {
            memo,
            dateISO,
            lines,
            source: "AI",
          });
          await appendAudit(tx, {
            orgId,
            actor: "nara",
            action: "NARA_POST_JOURNAL",
            subjectType: "journal_entry",
            subjectId: posted.id,
            data: { number: posted.number, memo },
          });
          return posted;
        });

        return { success: true, data: { journalId: res.id, number: res.number, memo } };
      }

      case "reverse_journal": {
        const entryIdOrNum = String(args.entryId ?? "").trim();
        const reason = String(args.reason ?? "Pembalikan jurnal via Nara AI");
        const dateISO = args.dateISO ? String(args.dateISO).slice(0, 10) : new Date().toISOString().slice(0, 10);

        const rows = await listEntriesWithLines(db, orgId, 100);
        const target = rows.find((r) => r.id === entryIdOrNum || r.number === entryIdOrNum);
        if (!target) {
          return { success: false, error: `Jurnal ${entryIdOrNum} tidak ditemukan.` };
        }

        // Swap debit and credit lines
        const reversedLines = target.lines.map((l) => ({
          accountId: l.accountId,
          debitMinor: l.creditMinor,
          creditMinor: l.debitMinor,
          memo: `Reversal: ${l.memo ?? target.memo}`,
        }));

        const res = await db.transaction(async (tx) => {
          const posted = await postJournalEntry(
            tx,
            orgId,
            actorEmail,
            {
              memo: `Reversal dari ${target.number}: ${reason}`,
              dateISO,
              lines: reversedLines,
              source: "AI",
            },
            { reversalOfId: target.id },
          );
          await appendAudit(tx, {
            orgId,
            actor: "nara",
            action: "NARA_REVERSE_JOURNAL",
            subjectType: "journal_entry",
            subjectId: posted.id,
            data: { originalJournal: target.number, reversalNumber: posted.number },
          });
          return posted;
        });

        return { success: true, data: { reversalNumber: res.number, targetNumber: target.number } };
      }

      case "create_account": {
        const code = String(args.code ?? "").trim();
        const name = String(args.name ?? "").trim();
        const type = String(args.type) as "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
        const normal = String(args.normal) === "K" ? "K" : "D";
        const parentCode = args.parentCode ? String(args.parentCode) : undefined;

        const res = await db.transaction(async (tx) => {
          const acc = await createAccount(tx, {
            orgId,
            code,
            name,
            type,
            normal,
            parentCode,
          });
          await appendAudit(tx, {
            orgId,
            actor: "nara",
            action: "NARA_CREATE_ACCOUNT",
            subjectType: "account",
            subjectId: acc.id,
            data: { code, name, type },
          });
          return acc;
        });

        return { success: true, data: { id: res.id, code: res.code, name: res.name } };
      }

      case "update_account": {
        const code = String(args.code ?? "").trim();
        const accRows = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));
        const target = accRows[0];
        if (!target) return { success: false, error: `Akun dengan kode ${code} tidak ditemukan.` };

        const name = args.name ? String(args.name) : undefined;
        const parentCode = args.parentCode !== undefined ? (args.parentCode ? String(args.parentCode) : null) : undefined;

        const res = await db.transaction(async (tx) => {
          const upd = await updateAccount(tx, orgId, target.id, { name, parentCode });
          await appendAudit(tx, {
            orgId,
            actor: "nara",
            action: "NARA_UPDATE_ACCOUNT",
            subjectType: "account",
            subjectId: upd.id,
            data: { code: upd.code, name: upd.name },
          });
          return upd;
        });

        return { success: true, data: { code: res.code, name: res.name } };
      }

      case "archive_account": {
        const code = String(args.code ?? "").trim();
        const archive = Boolean(args.archive);
        const accRows = await db.select().from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.code, code)));
        const target = accRows[0];
        if (!target) return { success: false, error: `Akun dengan kode ${code} tidak ditemukan.` };

        const res = await db.transaction(async (tx) => {
          const upd = await setAccountArchived(tx, orgId, target.id, archive ? new Date() : null);
          await appendAudit(tx, {
            orgId,
            actor: "nara",
            action: archive ? "NARA_ARCHIVE_ACCOUNT" : "NARA_RESTORE_ACCOUNT",
            subjectType: "account",
            subjectId: upd.id,
            data: { code: upd.code },
          });
          return upd;
        });

        return { success: true, data: { code: res.code, archived: Boolean(res.archivedAt) } };
      }

      case "open_period": {
        const name = String(args.name ?? "").trim();
        const periods = await listPeriodsRepo(db, orgId);
        const existing = periods.find((p) => p.name === name);

        if (existing) {
          await db.transaction(async (tx) => {
            await setPeriodStatus(tx, orgId, existing.id, "OPEN");
            await appendAudit(tx, {
              orgId,
              actor: "nara",
              action: "NARA_OPEN_PERIOD",
              subjectType: "fiscal_period",
              subjectId: existing.id,
              data: { name },
            });
          });
          return { success: true, data: { name, status: "OPEN" } };
        } else {
          const startsOn = args.startsOn ? String(args.startsOn) : `${name}-01`;
          const endsOn = args.endsOn ? String(args.endsOn) : `${name}-28`;
          const [created] = await db.transaction(async (tx) => {
            const [p] = await tx.insert(fiscalPeriods).values({
              orgId,
              name,
              startsOn,
              endsOn,
              status: "OPEN",
            }).returning();
            await appendAudit(tx, {
              orgId,
              actor: "nara",
              action: "NARA_CREATE_PERIOD",
              subjectType: "fiscal_period",
              subjectId: p.id,
              data: { name, startsOn, endsOn },
            });
            return [p];
          });
          return { success: true, data: { name: created.name, status: "OPEN" } };
        }
      }

      case "close_period": {
        const name = String(args.name ?? "").trim();
        const periods = await listPeriodsRepo(db, orgId);
        const existing = periods.find((p) => p.name === name);
        if (!existing) return { success: false, error: `Periode ${name} tidak ditemukan.` };

        await db.transaction(async (tx) => {
          await setPeriodStatus(tx, orgId, existing.id, "CLOSED");
          await appendAudit(tx, {
            orgId,
            actor: "nara",
            action: "NARA_CLOSE_PERIOD",
            subjectType: "fiscal_period",
            subjectId: existing.id,
            data: { name },
          });
        });

        return { success: true, data: { name, status: "CLOSED" } };
      }

      default:
        return { success: false, error: `Tool ${toolName} tidak dikenali.` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Terjadi kesalahan saat mengeksekusi aksi.";
    return { success: false, error: msg };
  }
}
