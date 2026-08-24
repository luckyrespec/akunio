import { z } from "zod";

export const DraftLineSchema = z.object({
  accountCode: z.string().min(1),
  debitText: z.string(),
  creditText: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

export const DraftEntrySchema = z
  .object({
    dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    memo: z.string().min(1),
    lines: z.array(DraftLineSchema).min(2),
    overallConfidence: z.number().min(0).max(1),
    explanation: z.string().min(1),
  })
  .superRefine((d, ctx) => {
    const bad = d.lines.find(
      (l) =>
        (l.debitText === "" && l.creditText === "") ||
        (l.debitText !== "" && l.creditText !== ""),
    );
    if (bad) ctx.addIssue({ code: "custom", message: "SETIAP_BARIS_SATU_SISI" });
  });

export type DraftLine = z.infer<typeof DraftLineSchema>;
export type DraftEntry = z.infer<typeof DraftEntrySchema>;

// JSON Schema for Interactions response_format (hand-written mirror of above).
export const draftJsonSchema = {
  type: "object",
  properties: {
    dateISO: { type: "string", description: "Tanggal transaksi YYYY-MM-DD" },
    memo: { type: "string", description: "Keterangan jurnal singkat" },
    lines: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        properties: {
          accountCode: {
            type: "string",
            description: "Kode akun dari daftar akun yang diberikan",
          },
          debitText: {
            type: "string",
            description: "Nominal debit format Indonesia, mis. 5.000.000; kosongkan bila nol",
          },
          creditText: {
            type: "string",
            description: "Nominal kredit format Indonesia; kosongkan bila nol",
          },
          confidence: { type: "number", description: "0 sampai 1" },
          reason: { type: "string", description: "Alasan singkat dalam Bahasa Indonesia" },
        },
        required: ["accountCode", "debitText", "creditText", "confidence", "reason"],
      },
    },
    overallConfidence: { type: "number" },
    explanation: {
      type: "string",
      description: "Penjelasan draft untuk pengguna, Bahasa Indonesia",
    },
  },
  required: ["dateISO", "memo", "lines", "overallConfidence", "explanation"],
} as const;
