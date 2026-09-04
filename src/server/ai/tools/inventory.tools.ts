import { db } from "@/server/db";
import {
  createInventoryItem,
  listInventoryItems,
} from "@/server/db/repos/inventory.repo";
import { Money } from "@/core/money/money";
import type { ToolDefinition, ToolHandler } from "./types";

export const inventoryToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "list_inventory_items",
    description: "Ambil daftar master barang persediaan barang dagang saat ini (kode SKU, nama, kategori, satuan, stok saat ini, harga modal rata-rata, harga jual).",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter berdasarkan nama kategori tertentu (opsional)" },
        query: { type: "string", description: "Filter kata kunci nama atau kode barang (opsional)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "add_inventory_item",
    description: "Daftarkan satu barang persediaan baru ke dalam master katalog persediaan. Wajib konfirmasi user sebelum eksekusi.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Kode unik SKU barang (misal: BRG-001)" },
        name: { type: "string", description: "Nama lengkap barang dagang" },
        barcode: { type: "string", description: "Nomor barcode produk (opsional)" },
        category: { type: "string", description: "Kategori barang (misal: Alat Tulis, Makanan, Elektronik)" },
        unit: { type: "string", description: "Satuan unit barang (misal: Pcs, Rim, Box, Kg, Liter). Default: Pcs" },
        initialQty: { type: "number", description: "Kuantitas saldo fisik awal saat ini. Default: 0" },
        initialCostText: { type: "string", description: "Harga beli / modal per unit dalam Rupiah (misal: '50000'). Default: '0'" },
        standardSellingPriceText: { type: "string", description: "Harga jual standar per unit dalam Rupiah (misal: '65000'). Default: '0'" },
        minStockAlert: { type: "string", description: "Batas minimum stok untuk peringatan restock (misal: '5'). Default: '5'" },
      },
      required: ["code", "name"],
    },
  },
  {
    type: "function",
    name: "batch_add_inventory_items",
    description: "Daftarkan banyak barang persediaan sekaligus (batch SKU) ke master persediaan, misalnya hasil ekstraksi dari file Excel/CSV atau daftar banyak barang dari percakapan pengguna. Wajib konfirmasi user sebelum eksekusi.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Daftar objek barang yang akan didaftarkan",
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "Kode unik SKU barang" },
              name: { type: "string", description: "Nama barang" },
              barcode: { type: "string", description: "Barcode opsional" },
              category: { type: "string", description: "Kategori barang" },
              unit: { type: "string", description: "Satuan (misal: Pcs, Box, Kg)" },
              initialQty: { type: "number", description: "Stok awal" },
              initialCostText: { type: "string", description: "Harga modal per unit dlm Rupiah" },
              standardSellingPriceText: { type: "string", description: "Harga jual dlm Rupiah" },
              minStockAlert: { type: "string", description: "Batas minimum stok" },
            },
            required: ["code", "name"],
          },
        },
        sourceFileName: { type: "string", description: "Nama file spreadsheet/CSV asal jika berasal dari upload file pengguna" },
      },
      required: ["items"],
    },
  },
];

export const inventoryHandlers: Record<string, ToolHandler> = {
  list_inventory_items: async (orgId, _actor, args) => {
    try {
      const allItems = await listInventoryItems(db, orgId);
      const query = String(args.query ?? "").toLowerCase().trim();
      const category = String(args.category ?? "").toLowerCase().trim();

      const filtered = allItems.filter((it) => {
        const matchesQuery = !query || it.name.toLowerCase().includes(query) || it.code.toLowerCase().includes(query);
        const matchesCat = !category || (it.category && it.category.toLowerCase().includes(category));
        return matchesQuery && matchesCat;
      });

      return {
        success: true,
        data: {
          totalCount: filtered.length,
          items: filtered.slice(0, 20).map((it) => ({
            id: it.id,
            code: it.code,
            name: it.name,
            category: it.category || "-",
            unit: it.unit,
            currentQty: it.currentQty,
            averageCost: Money.fromMinor(it.averageCostMinor).formatIdr(),
            standardSellingPrice: Money.fromMinor(it.standardSellingPriceMinor).formatIdr(),
          })),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Gagal mengambil daftar persediaan" };
    }
  },

  add_inventory_item: async (orgId, _actor, args) => {
    try {
      const code = String(args.code ?? "").trim().toUpperCase();
      const name = String(args.name ?? "").trim();
      if (!code || !name) {
        return { success: false, error: "Kode SKU dan Nama Barang wajib diisi." };
      }

      const initialCostMinor = args.initialCostText
        ? Money.parseIdr(String(args.initialCostText)).minor
        : 0n;
      const standardSellingPriceMinor = args.standardSellingPriceText
        ? Money.parseIdr(String(args.standardSellingPriceText)).minor
        : 0n;

      const item = await createInventoryItem(db, orgId, {
        code,
        name,
        barcode: args.barcode ? String(args.barcode) : undefined,
        category: args.category ? String(args.category) : undefined,
        unit: args.unit ? String(args.unit) : "Pcs",
        minStockAlert: args.minStockAlert ? String(args.minStockAlert) : "5",
        initialQty: typeof args.initialQty === "number" ? args.initialQty : Number(args.initialQty) || 0,
        initialCostMinor,
        standardSellingPriceMinor,
      });

      return {
        success: true,
        data: {
          id: item.id,
          code: item.code,
          name: item.name,
          unit: item.unit,
          currentQty: item.currentQty,
          message: `Barang ${item.name} (${item.code}) berhasil didaftarkan ke master persediaan.`,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Gagal mendaftarkan barang persediaan" };
    }
  },

  batch_add_inventory_items: async (orgId, _actor, args) => {
    try {
      const items = Array.isArray(args.items) ? (args.items as Array<Record<string, unknown>>) : [];
      if (items.length === 0) {
        return { success: false, error: "Daftar barang dalam batch tidak boleh kosong." };
      }

      const results = await db.transaction(async (tx) => {
        const createdList = [];
        for (const raw of items) {
          const code = String(raw.code ?? "").trim().toUpperCase();
          const name = String(raw.name ?? "").trim();
          if (!code || !name) continue;

          const initialCostMinor = raw.initialCostText
            ? Money.parseIdr(String(raw.initialCostText)).minor
            : 0n;
          const standardSellingPriceMinor = raw.standardSellingPriceText
            ? Money.parseIdr(String(raw.standardSellingPriceText)).minor
            : 0n;

          const item = await createInventoryItem(tx, orgId, {
            code,
            name,
            barcode: raw.barcode ? String(raw.barcode) : undefined,
            category: raw.category ? String(raw.category) : undefined,
            unit: raw.unit ? String(raw.unit) : "Pcs",
            minStockAlert: raw.minStockAlert ? String(raw.minStockAlert) : "5",
            initialQty: typeof raw.initialQty === "number" ? raw.initialQty : Number(raw.initialQty) || 0,
            initialCostMinor,
            standardSellingPriceMinor,
          });
          createdList.push(item);
        }
        return createdList;
      });

      return {
        success: true,
        data: {
          insertedCount: results.length,
          sourceFileName: args.sourceFileName ? String(args.sourceFileName) : undefined,
          message: `Berhasil mendaftarkan ${results.length} barang ke katalog persediaan.`,
          sampleItems: results.slice(0, 5).map((it) => ({
            code: it.code,
            name: it.name,
            unit: it.unit,
            qty: it.currentQty,
          })),
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message || "Gagal mendaftarkan batch barang persediaan" };
    }
  },
};
