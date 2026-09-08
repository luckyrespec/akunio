import { withOrg } from "@/server/db/repos/with-org";
import {
  getContactCard,
  getItemCard,
  listContactCards,
} from "@/server/db/repos/subsidiary.repo";
import { Money } from "@/core/money/money";
import type { ToolDefinition, ToolHandler } from "./types";

export const subsidiaryToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "list_contact_ledgers",
    description:
      "Ringkasan buku pembantu per kontak: jumlah faktur/tagihan, total, sudah dibayar, dan sisa (outstanding). Gunakan untuk pertanyaan seperti 'siapa yang masih berutang'.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "INVOICE untuk piutang pelanggan, BILL untuk utang pemasok",
        },
      },
      required: ["type"],
    },
  },
  {
    type: "function",
    name: "get_contact_ledger",
    description:
      "Rincian kartu buku pembantu satu kontak: daftar faktur/tagihan + pembayaran + sisa per nomor. Gunakan untuk 'tagihan Pak Budi kurang berapa'.",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string", description: "Id kontak (cari dulu via find_contact bila belum tahu)" },
        type: {
          type: "string",
          description: "INVOICE untuk piutang pelanggan, BILL untuk utang pemasok",
        },
      },
      required: ["contactId", "type"],
    },
  },
  {
    type: "function",
    name: "get_item_stock_card",
    description:
      "Kartu stok satu barang: mutasi masuk/keluar/penyesuaian + sisa dan nilai. Gunakan untuk 'stok_barang X tinggal berapa'.",
    parameters: {
      type: "object",
      properties: {
        itemId: { type: "string", description: "Id barang (cari dulu via list_inventory_items bila belum tahu)" },
      },
      required: ["itemId"],
    },
  },
];

function side(type: string): "INVOICE" | "BILL" | null {
  const t = type.toUpperCase();
  return t === "INVOICE" || t === "BILL" ? t : null;
}

export const subsidiaryHandlers: Record<string, ToolHandler> = {
  list_contact_ledgers: async (orgId, _actor, args) => {
    try {
      const t = side(String(args.type ?? ""));
      if (!t) return { success: false, error: "type harus INVOICE atau BILL." };
      const cards = await withOrg(orgId, async (tx) => listContactCards(tx, orgId, t));
      return {
        success: true,
        data: {
          totalCount: cards.length,
          ledgers: cards.slice(0, 50).map((c) => ({
            id: c.id,
            name: c.name,
            invoiceCount: c.invoiceCount,
            total: Money.fromMinor(c.totalMinor).formatIdr(),
            paid: Money.fromMinor(c.paidMinor).formatIdr(),
            outstanding: Money.fromMinor(c.outstandingMinor).formatIdr(),
          })),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengambil buku pembantu";
      return { success: false, error: message };
    }
  },

  get_contact_ledger: async (orgId, _actor, args) => {
    try {
      const contactId = String(args.contactId ?? "").trim();
      if (!contactId) return { success: false, error: "contactId wajib diisi." };
      const t = side(String(args.type ?? ""));
      if (!t) return { success: false, error: "type harus INVOICE atau BILL." };
      const card = await withOrg(orgId, async (tx) => getContactCard(tx, orgId, contactId, t));
      if (!card) return { success: false, error: "Kontak tidak ditemukan." };
      return {
        success: true,
        data: {
          contact: { id: card.contact.id, name: card.contact.name },
          totalMoves: card.entries.length,
          entries: card.entries.slice(-30).map((e) => ({
            date: e.date,
            desc: e.desc,
            ref: e.ref,
            debit: Money.fromMinor(e.debitMinor).formatIdr(),
            credit: Money.fromMinor(e.creditMinor).formatIdr(),
            balance: Money.fromMinor(e.balanceMinor).formatIdr(),
          })),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengambil kartu kontak";
      return { success: false, error: message };
    }
  },

  get_item_stock_card: async (orgId, _actor, args) => {
    try {
      const itemId = String(args.itemId ?? "").trim();
      if (!itemId) return { success: false, error: "itemId wajib diisi." };
      const card = await withOrg(orgId, async (tx) => getItemCard(tx, orgId, itemId));
      if (!card) return { success: false, error: "Barang tidak ditemukan." };
      return {
        success: true,
        data: {
          item: {
            id: card.item.id,
            code: card.item.code,
            name: card.item.name,
            currentQty: card.item.currentQty,
            averageCost: Money.fromMinor(card.item.averageCostMinor).formatIdr(),
          },
          totalMoves: card.rows.length,
          moves: card.rows.slice(-30).map((r) => ({
            date: r.date,
            desc: r.desc,
            ref: r.ref,
            inQty: r.inQty,
            outQty: r.outQty,
            resultingQty: r.resultingQty,
          })),
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mengambil kartu stok";
      return { success: false, error: message };
    }
  },
};
