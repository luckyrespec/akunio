import { defaultRehypePlugins } from "streamdown";
import { defaultSchema } from "hast-util-sanitize";

export type CitationRef =
  | { kind: "sak"; bab: string; paragraph: string }
  | { kind: "jurnal"; number: string }
  | { kind: "external"; href: string };

/**
 * Parse href marker sitasi inline yang ditulis model:
 * - "sak:11:11.1-11.3" → drawer aturan Bab 11 paragraf 11.1-11.3
 * - "jurnal:JE-2026-0004" → halaman daftar jurnal dengan pencarian nomor
 * - lainnya → link eksternal biasa (dirender aman sebagai anchor)
 */
export function parseCitationHref(href: string): CitationRef {
  const sak = /^sak:(\d+):?(.*)$/i.exec(href.trim());
  if (sak) {
    return { kind: "sak", bab: sak[1], paragraph: (sak[2] ?? "").trim() };
  }
  const jurnal = /^jurnal:(.+)$/i.exec(href.trim());
  if (jurnal && jurnal[1].trim().length > 0) {
    return { kind: "jurnal", number: jurnal[1].trim() };
  }
  return { kind: "external", href };
}

// Pipeline rehype Streamdown untuk jawaban asisten.
// Dibuat sekali di level modul (pola Streamdown: cache pipeline per konfigurasi).
// = sanitize bawaan + protokol sitasi inline Akunio (sak:, jurnal:).
const [sanitizeFn] = defaultRehypePlugins.sanitize as unknown as [unknown, unknown];
export const assistantRehypePlugins = [
  defaultRehypePlugins.raw,
  [
    sanitizeFn,
    {
      ...defaultSchema,
      protocols: {
        ...(defaultSchema.protocols ?? {}),
        href: [...((defaultSchema.protocols?.href as string[] | undefined) ?? []), "sak", "jurnal"],
      },
    },
  ],
  defaultRehypePlugins.harden,
];
