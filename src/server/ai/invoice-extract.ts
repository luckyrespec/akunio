import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import { parseDecimalToMinor } from "@/core/money/money";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export const InvoiceExtractLineSchema = z.object({
  description: z.string().describe("Nama atau rincian barang/jasa per baris"),
  quantity: z.number().describe("Jumlah unit per baris"),
  unitPrice: z.number().describe("Harga per unit dalam Rupiah"),
});

export const InvoiceExtractSchema = z.object({
  vendor: z.string().describe("Nama pemasok / vendor penerbit faktur pembelian"),
  invoiceNumber: z.string().describe("Nomor faktur pembelian"),
  dateISO: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "dateISO wajib YYYY-MM-DD")
    .describe("Tanggal faktur dalam format YYYY-MM-DD"),
  lines: z.array(InvoiceExtractLineSchema).describe("Rincian baris barang/jasa"),
  subtotal: z.number().describe("Subtotal sebelum pajak dalam Rupiah"),
  tax: z.number().describe("Nominal pajak (PPN) dalam Rupiah"),
  total: z.number().describe("Total tagihan (subtotal + pajak) dalam Rupiah"),
});

export type RawInvoiceData = z.infer<typeof InvoiceExtractSchema>;

export interface ExtractedInvoiceLine {
  description: string;
  quantity: number;
  unitPriceMinor: bigint;
}

export interface ExtractedInvoiceData {
  vendor: string;
  invoiceNumber: string;
  dateISO: string;
  lines: ExtractedInvoiceLine[];
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
}

function toMinorOrThrow(value: number, field: string): bigint {
  const minor = parseDecimalToMinor(String(value));
  if (minor === null) {
    throw new Error(
      `NILAI_DESIMAL_TIDAK_VALID: kolom "${field}" bernilai "${String(value)}" tidak valid — wajib angka Rupiah positif dengan maksimal 2 digit desimal.`,
    );
  }
  return minor;
}

/** Pajak nol eksplisit (0/0.00) sah untuk faktur non-PPN — jangan lewatkan
 *  angka nol lewat parseDecimalToMinor (helper itu menolak nol).
 *  Preseden: parseTaxMinor di tools/invoice-intake.tools.ts. */
function toTaxMinorOrThrow(value: number): bigint {
  if (value === 0) return 0n;
  return toMinorOrThrow(value, "tax");
}

export function parseExtractedInvoice(raw: unknown): ExtractedInvoiceData {
  const parsed = InvoiceExtractSchema.parse(raw);
  return {
    vendor: parsed.vendor,
    invoiceNumber: parsed.invoiceNumber,
    dateISO: parsed.dateISO,
    lines: parsed.lines.map((l, i) => {
      if (!Number.isFinite(l.quantity) || l.quantity < 0) {
        throw new Error(
          `QUANTITY_TIDAK_VALID: kolom "quantity" pada baris ke-${i + 1} bernilai "${String(l.quantity)}" tidak valid — wajib angka terhingga dan tidak negatif.`,
        );
      }
      return {
        description: l.description,
        quantity: l.quantity,
        unitPriceMinor: toMinorOrThrow(l.unitPrice, `lines[${i}].unitPrice`),
      };
    }),
    subtotalMinor: toMinorOrThrow(parsed.subtotal, "subtotal"),
    taxMinor: toTaxMinorOrThrow(parsed.tax),
    totalMinor: toMinorOrThrow(parsed.total, "total"),
  };
}

export const invoiceJsonSchema = {
  type: "object",
  properties: {
    vendor: { type: "string" },
    invoiceNumber: { type: "string" },
    dateISO: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice"],
      },
    },
    subtotal: { type: "number" },
    tax: { type: "number" },
    total: { type: "number" },
  },
  required: ["vendor", "invoiceNumber", "dateISO", "lines", "subtotal", "tax", "total"],
};

export async function extractInvoice(
  fileBuffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<ExtractedInvoiceData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.AI_MOCK === "1") {
    // Mock deterministik untuk dev lokal / test tanpa API key aktif.
    const today = new Date().toISOString().slice(0, 10);
    return {
      vendor: "PT ABC",
      invoiceNumber: "INV-ABC-001",
      dateISO: today,
      lines: [
        {
          description: "Kopi susu 1kg",
          quantity: 2,
          unitPriceMinor: 5000000000n, // Rp 50.000.000
        },
      ],
      subtotalMinor: 10000000000n, // Rp 100.000.000
      taxMinor: 1100000000n, // Rp 11.000.000
      totalMinor: 11100000000n, // Rp 111.000.000
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64Data = fileBuffer.toString("base64");

  const prompt = `Anda adalah asisten akuntansi ahli spesialis pembacaan faktur pembelian (tagihan vendor).
Tugas Anda:
1. Baca dokumen faktur pembelian terlampir${filename ? ` (nama file: ${filename})` : ""} (baik PDF, gambar, maupun teks).
2. Identifikasi nama vendor/pemasok, nomor faktur, dan tanggal faktur (format YYYY-MM-DD).
3. Ekstrak setiap baris barang/jasa menjadi list dengan field:
   - description: Nama atau rincian barang/jasa.
   - quantity: Jumlah unit (angka).
   - unitPrice: Harga per unit dalam Rupiah (angka positif tanpa simbol).
4. Baca subtotal (sebelum pajak), nominal pajak (PPN), dan total tagihan — semuanya angka Rupiah positif tanpa simbol.
Pastikan tidak ada baris yang terlewat dan angka sesuai persis dengan yang tertulis di dokumen.`;

  const contentType = mimeType === "application/pdf" ? "document" : "image";
  const inputSteps = [
    {
      type: "user_input",
      content: [
        { type: "text", text: prompt },
        {
          type: contentType,
          data: base64Data,
          mime_type: mimeType,
        },
      ],
    },
  ] as never;

  const interaction = await ai.interactions.create({
    model: MODEL,
    input: inputSteps,
    store: false,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: invoiceJsonSchema,
    },
  });

  const outputText = interaction.output_text ?? "{}";
  const json = JSON.parse(outputText);
  return parseExtractedInvoice(json);
}
