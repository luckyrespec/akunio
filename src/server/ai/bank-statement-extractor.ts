import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export const BankStatementRawItemSchema = z.object({
  date: z.string().describe("Tanggal mutasi dalam format YYYY-MM-DD"),
  description: z.string().describe("Keterangan atau berita transfer dari bank"),
  type: z.enum(["CR", "DB"]).describe("CR = Kredit / Uang Masuk, DB = Debet / Uang Keluar"),
  amount: z.number().describe("Nominal mutasi dalam Rupiah"),
  referenceNumber: z.string().optional().describe("Nomor referensi atau trace"),
});

export const BankStatementExtractSchema = z.object({
  bankName: z.string().describe("Nama bank (contoh: Bank Central Asia (BCA), Bank Mandiri)"),
  accountNumber: z.string().optional().describe("Nomor rekening bank jika tertera"),
  statementPeriod: z.object({
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
  }),
  openingBalance: z.number().describe("Saldo awal dalam Rupiah"),
  closingBalance: z.number().describe("Saldo akhir dalam Rupiah"),
  transactions: z.array(BankStatementRawItemSchema),
});

export type RawBankStatementData = z.infer<typeof BankStatementExtractSchema>;

export interface ExtractedStatementTransaction {
  date: string;
  description: string;
  type: "CR" | "DB";
  amountMinor: bigint;
  referenceNumber?: string;
}

export interface BankStatementExtractedData {
  bankName: string;
  accountNumber?: string;
  statementPeriod: {
    from: string;
    to: string;
  };
  openingBalanceMinor: bigint;
  closingBalanceMinor: bigint;
  transactions: ExtractedStatementTransaction[];
}

export function parseExtractedStatementData(raw: unknown): BankStatementExtractedData {
  const parsed = BankStatementExtractSchema.parse(raw);
  return {
    bankName: parsed.bankName,
    accountNumber: parsed.accountNumber,
    statementPeriod: parsed.statementPeriod,
    openingBalanceMinor: BigInt(Math.round(parsed.openingBalance * 100)),
    closingBalanceMinor: BigInt(Math.round(parsed.closingBalance * 100)),
    transactions: parsed.transactions.map((tx) => ({
      date: tx.date,
      description: tx.description,
      type: tx.type,
      amountMinor: BigInt(Math.round(tx.amount * 100)),
      referenceNumber: tx.referenceNumber,
    })),
  };
}

export const bankStatementJsonSchema = {
  type: "object",
  properties: {
    bankName: { type: "string" },
    accountNumber: { type: "string" },
    statementPeriod: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["from", "to"],
    },
    openingBalance: { type: "number" },
    closingBalance: { type: "number" },
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          description: { type: "string" },
          type: { type: "string", enum: ["CR", "DB"] },
          amount: { type: "number" },
          referenceNumber: { type: "string" },
        },
        required: ["date", "description", "type", "amount"],
      },
    },
  },
  required: ["bankName", "statementPeriod", "openingBalance", "closingBalance", "transactions"],
};

export async function extractBankStatement(
  fileBuffer: Buffer,
  mimeType: string,
  filename?: string
): Promise<BankStatementExtractedData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.AI_MOCK === "1") {
    // Return mock statement data for local dev / tests without active API key
    const today = new Date().toISOString().slice(0, 10);
    return {
      bankName: "Bank Central Asia (BCA)",
      accountNumber: "1234567890",
      statementPeriod: { from: today, to: today },
      openingBalanceMinor: 1000000000n, // Rp 10.000.000
      closingBalanceMinor: 1498500000n, // Rp 14.985.000
      transactions: [
        {
          date: today,
          description: "TRSF E-BANKING CR DARI PELANGGAN",
          type: "CR",
          amountMinor: 500000000n, // Rp 5.000.000
          referenceNumber: "TRF-001",
        },
        {
          date: today,
          description: "BIAYA ADM BULANAN",
          type: "DB",
          amountMinor: 1500000n, // Rp 15.000
        },
      ],
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const base64Data = fileBuffer.toString("base64");

  const prompt = `Anda adalah asisten akuntansi ahli spesialis pembacaan dan ekstraksi rekening koran bank (bank statement).
Tugas Anda:
1. Baca seluruh transaksi mutasi rekening koran terlampir (baik PDF, gambar, maupun teks tabular).
2. Identifikasi nama bank, nomor rekening (bila ada), periode rekening koran (from dan to YYYY-MM-DD), saldo awal, saldo akhir.
3. Ekstrak setiap baris mutasi menjadi list transaksi dengan field:
   - date: Tanggal mutasi (format YYYY-MM-DD).
   - description: Keterangan / berita transfer lengkap.
   - type: "CR" jika uang masuk (kredit bank), "DB" jika uang keluar (debet bank).
   - amount: Jumlah nominal mutasi dalam Rupiah (angka positif tanpa simbol).
   - referenceNumber: Nomor referensi atau kode transaksi jika tertera.
Pastikan tidak ada baris mutasi yang terlewat.`;

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
      schema: bankStatementJsonSchema,
    },
  });

  const outputText = interaction.output_text ?? "{}";
  const json = JSON.parse(outputText);
  return parseExtractedStatementData(json);
}
