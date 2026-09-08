import { withOrg } from "@/server/db/repos/with-org";
import {
  createCashEntryRepo,
  getCashSummaryRepo,
  listCashEntriesRepo,
} from "@/server/db/repos/cash-bank.repo";
import type { CashKind } from "@/server/db/schema/cash-bank";
import { Money } from "@/core/money/money";
import type { ToolDefinition, ToolHandler } from "./types";

export const cashBankToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "list_cash_entries",
    description:
      "Ambil mutasi kas & bank (pembayaran, penerimaan, transfer) terbaru beserta status DRAFT/POSTED. Gunakan untuk 'mutasi kas minggu ini apa saja'.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "Filter jenis: BAYAR, TERIMA, TRANSFER (opsional, default semua)",
        },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "get_cash_summary",
    description:
      "Ringkas posisi kas: total POSTED per jenis dalam rentang tanggal + jumlah draf tertunda. Gunakan untuk 'posisi kas bulan ini'.",
    parameters: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          description: "Jenis: BAYAR, TERIMA, TRANSFER",
        },
        fromISO: { type: "string", description: "Tanggal mulai YYYY-MM-DD (default awal bulan berjalan)" },
        toISO: { type: "string", description: "Tanggal akhir YYYY-MM-DD (default hari ini)" },
      },
      required: ["kind"],
    },
  },
  {
    type: "function",
    name: "record_cash_entry",
    description:
      "Catat pembayaran/penerimaan/transfer kas sebagai DRAF (jurnal ikut draf, belum diposting). Pengesahan/posting tetap dilakukan user di UI. Akun kas lawan akun kontrol Persediaan ditolak; lawan Piutang/Utang wajib sertakan contactId. Wajib konfirmasi user sebelum eksekusi.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", description: "Jenis: BAYAR, TERIMA, TRANSFER" },
        entryDate: { type: "string", description: "Tanggal YYYY-MM-DD" },
        cashAccountId: { type: "string", description: "Id akun kas/bank" },
        counterAccountId: { type: "string", description: "Id akun lawan" },
        contactId: {
          type: "string",
          description: "Id kontak — wajib bila lawan akun Piutang/Utang (cari via find_contact)",
        },
        amountText: { type: "string", description: "Nominal Rupiah (misal: '1500000')" },
        memo: { type: "string", description: "Keterangan" },
      },
      required: ["kind", "entryDate", "cashAccountId", "counterAccountId", "amountText", "memo"],
    },
  },
];

const CASH_KINDS: readonly CashKind[] = ["BAYAR", "TERIMA", "TRANSFER"];

function todayMonthRange(): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  return { from: `${to.slice(0, 7)}-01`, to };
}

export const cashBankHandlers: Record<string, ToolHandler> = {
  list_cash_entries: async (orgId, _actor, args) => {
    try {
      const rawKind = String(args.kind ?? "").toUpperCase();
      const kind = (CASH_KINDS as readonly string[]).includes(rawKind)
        ? (rawKind as CashKind)
        : undefined;
      const rows = await withOrg(orgId, async (tx) => listCashEntriesRepo(tx, orgId, kind, 30));
      return {
        success: true,
        data: {
          totalCount: rows.length,
          entries: rows.map((r) => ({
            id: r.id,
            kind: r.kind,
            number: r.number,
            entryDate: r.entryDate,
            memo: r.memo,
            amount: Money.fromMinor(r.amountMinor).formatIdr(),
            status: r.status,
            cash: `${r.cashCode} ${r.cashName}`,
            counter: `${r.counterCode} ${r.counterName}`,
          })),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengambil mutasi kas";
      return { success: false, error: message };
    }
  },

  get_cash_summary: async (orgId, _actor, args) => {
    try {
      const kind = String(args.kind ?? "").toUpperCase();
      if (!(CASH_KINDS as readonly string[]).includes(kind)) {
        return { success: false, error: "kind harus BAYAR, TERIMA, atau TRANSFER." };
      }
      const range = todayMonthRange();
      const from = args.fromISO ? String(args.fromISO) : range.from;
      const to = args.toISO ? String(args.toISO) : range.to;
      const summary = await withOrg(orgId, async (tx) =>
        getCashSummaryRepo(tx, orgId, kind as CashKind, from, to),
      );
      return {
        success: true,
        data: {
          kind,
          from,
          to,
          postedTotal: Money.fromMinor(summary.postedTotalMinor).formatIdr(),
          draftCount: summary.draftCount,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal meringkas kas";
      return { success: false, error: message };
    }
  },

  record_cash_entry: async (orgId, actorEmail, args) => {
    try {
      const kind = String(args.kind ?? "").toUpperCase();
      if (!(CASH_KINDS as readonly string[]).includes(kind)) {
        return { success: false, error: "kind harus BAYAR, TERIMA, atau TRANSFER." };
      }
      const entryDate = String(args.entryDate ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
        return { success: false, error: "entryDate harus format YYYY-MM-DD." };
      }
      let amountMinor: bigint;
      try {
        amountMinor = Money.parseIdr(String(args.amountText ?? "")).minor;
      } catch {
        return { success: false, error: "amountText nominal Rupiah tidak valid." };
      }
      if (amountMinor <= 0n) return { success: false, error: "Nominal harus lebih dari 0." };
      const memo = String(args.memo ?? "").trim();
      if (!memo) return { success: false, error: "memo wajib diisi." };
      // Berhenti di DRAF sesuai spec — posting/pengesahan tetap aksi user di UI.
      const created = await withOrg(orgId, async (tx) =>
        createCashEntryRepo(tx, orgId, actorEmail, {
          kind: kind as CashKind,
          entryDate,
          cashAccountId: String(args.cashAccountId),
          counterAccountId: String(args.counterAccountId),
          contactId: args.contactId ? String(args.contactId) : null,
          amountMinor,
          memo,
        }, { post: false }),
      );
      return {
        success: true,
        data: {
          id: created.id,
          number: created.number,
          status: "DRAFT",
          note: "Tersimpan sebagai draf. Minta user meninjau dan memposting di menu Kas & Bank.",
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mencatat mutasi kas";
      return { success: false, error: message };
    }
  },
};
