import { Money, parseDecimalToMinor } from "@/core/money/money";
import type { ToolDefinition, ToolHandler } from "./types";

export const invoiceIntakeToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "extract_invoice",
    description:
      "Ekstrak data faktur pembelian (vendor, nomor, tanggal, rincian baris, subtotal, pajak, total) dari dokumen yang sudah diunggah. Read-only: hanya membaca dokumen, tidak mengubah pembukuan.",
    parameters: {
      type: "object",
      properties: {
        storageKey: { type: "string", description: "Kunci dokumen di penyimpanan (dari lampiran)" },
        mime: { type: "string", description: "Tipe MIME dokumen (mis. application/pdf, image/png)" },
      },
      required: ["storageKey", "mime"],
    },
  },
  {
    type: "function",
    name: "validate_invoice",
    description:
      "Validasi aritmetika faktur pembelian: jumlah tiap baris (qty × harga) harus sama dengan subtotal, dan subtotal + pajak harus sama dengan total. Murni kalkulasi tanpa akses database; toleransi nol.",
    parameters: {
      type: "object",
      properties: {
        lines: {
          type: "array",
          description: "Rincian baris faktur",
          items: {
            type: "object",
            properties: {
              quantity: { type: "number", description: "Jumlah unit" },
              unitPrice: { type: "number", description: "Harga per unit dalam Rupiah" },
            },
            required: ["quantity", "unitPrice"],
          },
        },
        subtotalText: { type: "string", description: "Subtotal rupiah, mis. '100000000'" },
        taxText: { type: "string", description: "Nominal pajak rupiah, mis. '11000000'" },
        totalText: { type: "string", description: "Total tagihan rupiah, mis. '111000000'" },
      },
      required: ["lines", "subtotalText", "taxText", "totalText"],
    },
  },
];

function minorFmt(minor: bigint): string {
  return `${Money.fromMinor(minor).formatIdr()} (${minor.toString()})`;
}

/** Pajak nol eksplisit ("0"/"0.00") sah untuk faktur non-PPN — jangan
 *  lewatkan angka nol lewat parseDecimalToMinor (helper itu menolak nol).
 *  Preseden: parseItemMinor di invoicing.tools.ts. */
function parseTaxMinor(raw: unknown): bigint | null {
  if (raw === 0 || raw === "0") return 0n;
  if (typeof raw === "string" && /^0+(\.0{1,2})?$/.test(raw.trim())) return 0n;
  return parseDecimalToMinor(raw);
}

export const invoiceIntakeHandlers: Record<string, ToolHandler> = {
  extract_invoice: async (_orgId, _actorEmail, args) => {
    try {
      const storageKey = String(args.storageKey ?? "").trim();
      if (!storageKey) {
        return { success: false, error: "storageKey wajib diisi." };
      }
      const mime = String(args.mime ?? "application/pdf");
      const { getDocument } = await import("@/server/storage/storage");
      const { extractInvoice } = await import("@/server/ai/invoice-extract");
      const buf = await getDocument(storageKey);
      const data = await extractInvoice(buf, mime, storageKey.split("/").pop());
      return {
        success: true,
        data: {
          vendor: data.vendor,
          invoiceNumber: data.invoiceNumber,
          dateISO: data.dateISO,
          lines: data.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor.toString(),
          })),
          subtotalMinor: data.subtotalMinor.toString(),
          taxMinor: data.taxMinor.toString(),
          totalMinor: data.totalMinor.toString(),
        },
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? `Gagal mengekstrak faktur: ${e.message}` : "Gagal mengekstrak faktur.",
      };
    }
  },

  validate_invoice: async (_orgId, _actorEmail, args) => {
    const rawLines = Array.isArray(args.lines) ? (args.lines as Array<Record<string, unknown>>) : [];
    if (rawLines.length === 0) {
      return { success: false, error: "Rincian baris (lines) tidak boleh kosong." };
    }
    let sumMinor = 0n;
    for (const raw of rawLines) {
      const qty = Number(raw.quantity);
      const priceMinor = parseDecimalToMinor(raw.unitPrice);
      if (!Number.isFinite(qty) || qty <= 0 || priceMinor === null) {
        return {
          success: false,
          error: `Baris tidak valid (quantity "${String(raw.quantity ?? "")}", unitPrice "${String(raw.unitPrice ?? "")}"): quantity wajib angka positif dan unitPrice wajib desimal Rupiah maksimal 2 digit sen.`,
        };
      }
      sumMinor += BigInt(Math.round(Number(priceMinor) * qty));
    }

    const subtotalMinor = parseDecimalToMinor(args.subtotalText);
    const taxMinor = parseTaxMinor(args.taxText);
    const totalMinor = parseDecimalToMinor(args.totalText);
    if (subtotalMinor === null || taxMinor === null || totalMinor === null) {
      return {
        success: false,
        error: `Nominal tidak valid (subtotal "${String(args.subtotalText ?? "")}", pajak "${String(args.taxText ?? "")}", total "${String(args.totalText ?? "")}"): wajib desimal Rupiah maksimal 2 digit sen dan lebih dari Rp 0.`,
      };
    }

    if (sumMinor !== subtotalMinor) {
      return {
        success: false,
        error: `SUBTOTAL_MISMATCH: jumlah baris ${minorFmt(sumMinor)} tidak sama dengan subtotal ${minorFmt(subtotalMinor)}. Periksa quantity × harga tiap baris.`,
      };
    }
    const computedTotal = subtotalMinor + taxMinor;
    if (computedTotal !== totalMinor) {
      return {
        success: false,
        error: `TOTAL_MISMATCH: subtotal ${minorFmt(subtotalMinor)} + pajak ${minorFmt(taxMinor)} = ${minorFmt(computedTotal)} tidak sama dengan total ${minorFmt(totalMinor)}. Periksa nominal pajak dan total.`,
      };
    }
    return {
      success: true,
      data: {
        ok: true,
        lineCount: rawLines.length,
        subtotalMinor: subtotalMinor.toString(),
        taxMinor: taxMinor.toString(),
        totalMinor: totalMinor.toString(),
      },
    };
  },
};
