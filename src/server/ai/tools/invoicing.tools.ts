import { db } from "@/server/db";
import { Money, parseDecimalToMinor } from "@/core/money/money";
import type { ToolDefinition, ToolHandler } from "./types";

export const invoicingToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "create_invoice",
    description: "Buat faktur penjualan (INVOICE) atau tagihan pembelian (BILL) ke pelanggan/pemasok. Wajib konfirmasi user sebelum eksekusi. Setelah berhasil, sebutkan faktur sebagai tautan [NOMOR](faktur:NOMOR-dari-hasil-tool) agar pengguna bisa membuka rinciannya.",
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
              catalogItemId: { type: "string", description: "Id barang di katalog persediaan (WAJIB diisi bila barangnya terdaftar — cari dulu via list_inventory_items; menentukan akun + mutasi stok saat posting)" },
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
    name: "update_invoice",
    description:
      "Koreksi faktur/tagihan: jatuh tempo dan catatan kapan pun; rincian barang HANYA bila belum diposting ke jurnal (bila sudah diposting, tolak dan arahkan ke jurnal pembalik). Cari nomornya dulu via list_invoices bila belum pasti. Wajib konfirmasi user sebelum eksekusi. Setelah berhasil, sebutkan faktur sebagai tautan [NOMOR](faktur:NOMOR).",
    parameters: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Nomor faktur (contoh: INV-2026-0001)" },
        dueDate: { type: "string", description: "Jatuh tempo baru YYYY-MM-DD (opsional, hitung tanggal relatif via get_server_time)" },
        notes: { type: "string", description: "Catatan baru (opsional)" },
        items: {
          type: "array",
          description: "Ganti SELURUH rincian barang (hanya bila belum diposting)",
          items: {
            type: "object",
            properties: {
              description: { type: "string", description: "Nama barang/jasa" },
              quantity: { type: "number", description: "Jumlah unit" },
              unitPrice: { type: "number", description: "Harga per unit Rupiah" },
              discount: { type: "number", description: "Diskon Rupiah" },
              taxRate: { type: "number", description: "Tarif PPN (0, 11, 12)" },
            },
            required: ["description", "quantity", "unitPrice"],
          },
        },
      },
      required: ["invoiceNumber"],
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
    name: "list_invoices",
    description:
      "Ambil daftar faktur penjualan (INVOICE) atau tagihan pembelian (BILL) beserta status dan sisa. Gunakan untuk 'faktur yang belum lunas apa saja'.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["INVOICE", "BILL"], description: "INVOICE untuk penjualan, BILL untuk pembelian (opsional)" },
        status: {
          type: "string",
          description: "Filter status: DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, VOID (opsional)",
        },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "get_invoice_detail",
    description: "Rincian satu faktur/tagihan berdasarkan nomor: kontak, tanggal, total, sudah dibayar, sisa.",
    parameters: {
      type: "object",
      properties: {
        invoiceNumber: { type: "string", description: "Nomor faktur (contoh: INV-2026-0001)" },
      },
      required: ["invoiceNumber"],
    },
  },
];

/** Nilai opsional non-negatif untuk item faktur: kosong/nol eksplisit → 0n
 *  (item gratis/diskon-nol sah); selain itu wajib desimal valid via helper
 *  bersama, null = tolak. Kuantitas/tarif tetap Number (bukan uang). */
function parseItemMinor(raw: unknown): bigint | null {
  if (raw === undefined || raw === null || raw === "") return 0n;
  if (raw === 0 || raw === "0") return 0n;
  return parseDecimalToMinor(raw);
}

export const invoicingHandlers: Record<string, ToolHandler> = {
  create_invoice: async (orgId, _actorEmail, args) => {
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
    const items: Array<{
      description: string;
      quantity: string;
      unitPriceMinor: bigint;
      discountMinor: bigint;
      taxRatePercent: string;
      catalogItemId: string | null;
    }> = [];
    for (const raw of itemsRaw) {
      const it = raw as Record<string, unknown>;
      const qty = Number(it.quantity || 1);
      const tax = Number(it.taxRate || 0);
      const priceMinor = parseItemMinor(it.unitPrice ?? 0);
      if (priceMinor === null) {
        return { success: false, error: "HARGA_ITEM_TIDAK_VALID: harga per unit wajib desimal Rupiah maksimal 2 digit sen (contoh: 100.5)." };
      }
      const discountMinor = parseItemMinor(it.discount ?? 0);
      if (discountMinor === null) {
        return { success: false, error: "DISKON_TIDAK_VALID: diskon wajib desimal Rupiah maksimal 2 digit sen." };
      }
      items.push({
        description: String(it.description || "Item"),
        quantity: String(qty),
        unitPriceMinor: priceMinor,
        discountMinor,
        taxRatePercent: String(tax),
        catalogItemId: typeof it.catalogItemId === "string" && it.catalogItemId ? it.catalogItemId : null,
      });
    }

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
  },

  record_invoice_payment: async (orgId, actorEmail, args) => {
    const { recordInvoicePaymentRepo } = await import("@/server/db/repos/invoices.repo");
    const { postInvoicePaymentToLedger } = await import("@/server/invoicing/posting");
    const { withOrg } = await import("@/server/db/repos/with-org");
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

    const amountMinor = parseDecimalToMinor(args.amount);
    if (amountMinor === null) {
      const rawAmount = args.amount;
      const zeroLike =
        rawAmount === 0 ||
        rawAmount === "0" ||
        (typeof rawAmount === "string" && /^0+(\.0{1,2})?$/.test(rawAmount.trim()));
      return {
        success: false,
        error: zeroLike
          ? "NOMINAL_HARUS_POSITIF: jumlah pelunasan harus lebih dari Rp 0."
          : "NOMINAL_DESIMAL_TIDAK_VALID: nominal pembayaran wajib desimal Rupiah maksimal 2 digit sen (contoh: 100.5).",
      };
    }
    // parseDecimalToMinor menjamin >0 bila non-null; pesan HARUS_POSITIF
    // dipertahankan untuk input nol via cabang zeroLike di atas.
    const paymentDate = String(args.paymentDate || new Date().toISOString().slice(0, 10));

    // Samakan default auto-post UI (recordInvoicePaymentAction): pelunasan
    // langsung diposting ke jurnal + log kas dalam withOrg yang sama
    // (guard B2 + dedup A6 + log kas otomatis ikut via kedua repo ini).
    // Gagal posting bukan kegagalan catat — kembalikan postWarning
    // (preseden createInvoiceWithPostingAction) agar user bisa posting manual.
    const { res, journalEntryId, postWarning } = await withOrg(orgId, async (tx) => {
      const res = await recordInvoicePaymentRepo(tx as never, orgId, {
        invoiceId: inv.id,
        amountMinor,
        paymentDate,
        paymentAccountId: acc.id,
        referenceNumber: args.referenceNumber ? String(args.referenceNumber) : null,
        notes: args.notes ? String(args.notes) : null,
      });
      let journalEntryId: string | null = null;
      let postWarning: string | null = null;
      try {
        journalEntryId = await postInvoicePaymentToLedger(tx as never, orgId, res.payment.id, actorEmail);
      } catch (e) {
        postWarning = e instanceof Error ? e.message : "Gagal memposting pelunasan ke jurnal.";
      }
      return { res, journalEntryId, postWarning };
    });

    const remainingMinor = res.updatedInvoice.totalMinor - res.updatedInvoice.amountPaidMinor;
    return {
      success: true,
      data: {
        paymentId: res.payment.id,
        journalEntryId,
        postWarning,
        invoiceNumber: inv.invoiceNumber,
        amountPaidFormatted: Money.fromMinor(res.updatedInvoice.amountPaidMinor).formatIdr(),
        remainingFormatted: Money.fromMinor(remainingMinor > 0n ? remainingMinor : 0n).formatIdr(),
        status: res.updatedInvoice.status,
        suggestions: journalEntryId ? [`Lihat Jurnal`, `Lihat Faktur`] : [`Posting Pelunasan ke Jurnal`, `Lihat Faktur`],
      },
    };
  },

  get_ar_ap_aging: async (orgId, _actorEmail, args) => {
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
  },

  post_invoice_to_journal: async (orgId, actorEmail, args) => {
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
  },

  list_invoices: async (orgId, _actorEmail, args) => {
    const { listInvoicesRepo } = await import("@/server/db/repos/invoices.repo");
    const type = args.type === "BILL" ? "BILL" : args.type === "INVOICE" ? "INVOICE" : undefined;
    const statuses = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const;
    const status = (statuses as readonly string[]).includes(String(args.status ?? ""))
      ? (String(args.status) as (typeof statuses)[number])
      : undefined;
    const rows = await listInvoicesRepo(db, orgId, { type, status });
    return {
      success: true,
      data: {
        totalCount: rows.length,
        invoices: rows.slice(0, 30).map((r) => ({
          invoiceNumber: r.invoiceNumber,
          type: r.type,
          contactName: r.contactName,
          issueDate: r.issueDate,
          dueDate: r.dueDate,
          total: Money.fromMinor(r.totalMinor).formatIdr(),
          paid: Money.fromMinor(r.amountPaidMinor).formatIdr(),
          status: r.status,
        })),
      },
    };
  },

  update_invoice: async (orgId, _actorEmail, args) => {
    try {
      const { updateInvoiceRepo } = await import("@/server/db/repos/invoices.repo");
      const { invoices } = await import("@/server/db/schema/invoicing");
      const { eq, and } = await import("drizzle-orm");
      const invNum = String(args.invoiceNumber || "").trim().toUpperCase();
      if (!invNum) return { success: false, error: "invoiceNumber wajib diisi." };
      const [head] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.invoiceNumber, invNum)));
      if (!head) return { success: false, error: `Faktur #${invNum} tidak ditemukan.` };

      const patch: {
        dueDate?: string;
        notes?: string;
        items?: Array<{
          description: string;
          quantity: number;
          unitPriceMinor: bigint;
          discountMinor: bigint;
          taxRatePercent: number;
        }>;
      } = {};
      if (typeof args.dueDate === "string" && args.dueDate.trim()) {
        patch.dueDate = args.dueDate.trim().slice(0, 10);
      }
      if (typeof args.notes === "string") patch.notes = args.notes;
      if (Array.isArray(args.items)) {
        const nextItems: NonNullable<typeof patch.items> = [];
        for (const raw of args.items as Array<Record<string, unknown>>) {
          const priceMinor = parseItemMinor(raw.unitPrice ?? 0);
          if (priceMinor === null) {
            return { success: false, error: "HARGA_ITEM_TIDAK_VALID: harga per unit wajib desimal Rupiah maksimal 2 digit sen (contoh: 100.5)." };
          }
          const discountMinor = parseItemMinor(raw.discount ?? 0);
          if (discountMinor === null) {
            return { success: false, error: "DISKON_TIDAK_VALID: diskon wajib desimal Rupiah maksimal 2 digit sen." };
          }
          nextItems.push({
            description: String(raw.description || "Item"),
            quantity: Number(raw.quantity || 1),
            unitPriceMinor: priceMinor,
            discountMinor,
            taxRatePercent: Number(raw.taxRate || 0),
          });
        }
        patch.items = nextItems;
      }
      if (patch.dueDate === undefined && patch.notes === undefined && patch.items === undefined) {
        return { success: false, error: "Tidak ada perubahan (isi dueDate, notes, atau items)." };
      }
      const updated = await updateInvoiceRepo(db, orgId, head.id, patch);
      return {
        success: true,
        data: {
          invoiceNumber: updated.invoiceNumber,
          dueDate: updated.dueDate,
          status: updated.status,
          totalFormatted: Money.fromMinor(updated.totalMinor).formatIdr(),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mengoreksi faktur";
      return { success: false, error: message };
    }
  },
  get_invoice_detail: async (orgId, _actorEmail, args) => {
    const { getInvoiceByIdRepo } = await import("@/server/db/repos/invoices.repo");
    const { invoices } = await import("@/server/db/schema/invoicing");
    const { eq, and } = await import("drizzle-orm");
    const invNum = String(args.invoiceNumber || "").trim();
    if (!invNum) return { success: false, error: "invoiceNumber wajib diisi." };
    const [head] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.invoiceNumber, invNum)));
    if (!head) return { success: false, error: `Faktur #${invNum} tidak ditemukan.` };
    const full = (await getInvoiceByIdRepo(db, orgId, head.id)) as unknown as {
      invoiceNumber: string;
      type: string;
      status: string;
      issueDate: string;
      dueDate: string;
      totalMinor: bigint;
      amountPaidMinor: bigint;
    } | null;
    if (!full) return { success: false, error: `Faktur #${invNum} tidak ditemukan.` };
    const remaining = full.totalMinor - full.amountPaidMinor;
    return {
      success: true,
      data: {
        invoiceNumber: full.invoiceNumber,
        type: full.type,
        status: full.status,
        issueDate: full.issueDate,
        dueDate: full.dueDate,
        total: Money.fromMinor(full.totalMinor).formatIdr(),
        paid: Money.fromMinor(full.amountPaidMinor).formatIdr(),
        remaining: Money.fromMinor(remaining > 0n ? remaining : 0n).formatIdr(),
      },
    };
  },
};
