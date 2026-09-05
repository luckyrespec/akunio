import { z } from "zod";

// Skema narasi koreksi berlandaskan SAK EMKM: penjelasan untuk pengguna
// plus sitasi yang wajib bisa diverifikasi ke chunk yang di-retrieve.
export const CorrectionNarrationSchema = z.object({
  explanation: z.string().min(20).max(600),
  citations: z
    .array(
      z.object({
        docId: z.string(),
        bab: z.string().min(1),
        paragraph: z.string().min(1),
      }),
    )
    .min(1)
    .max(3),
});

export type CorrectionNarration = z.infer<typeof CorrectionNarrationSchema>;

export interface RetrievedChunk {
  id: string;
  section: string;
}

type ValidationResult = { ok: true } | { ok: false; reason: string };

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

// Setiap sitasi wajib menunjuk dokumen aktif dan bab-nya wajib muncul di
// minimal satu section chunk yang di-retrieve ("Bab<bab>", case-insensitive,
// abaikan spasi).
export function validateCitations(
  narration: unknown,
  retrieved: RetrievedChunk[],
  docId: string,
): ValidationResult {
  const parsed = CorrectionNarrationSchema.safeParse(narration);
  if (!parsed.success) {
    return { ok: false, reason: "Narasi koreksi tidak valid." };
  }
  const normalizedSections = retrieved.map((chunk) => normalize(chunk.section));
  for (const citation of parsed.data.citations) {
    if (citation.docId !== docId) {
      return { ok: false, reason: "Sitasi menunjuk dokumen yang tidak aktif." };
    }
    const needle = normalize(`Bab${citation.bab}`);
    const matched = normalizedSections.some((section) => section.includes(needle));
    if (!matched) {
      return { ok: false, reason: "Sitasi bab tidak ditemukan pada dokumen yang diambil." };
    }
  }
  return { ok: true };
}
