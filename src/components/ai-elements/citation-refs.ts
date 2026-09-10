import { defaultRehypePlugins } from "streamdown";
import { defaultSchema } from "hast-util-sanitize";

export type CitationRef =
  | { kind: "sak"; bab: string; paragraph: string }
  | { kind: "jurnal"; number: string }
  | { kind: "item"; code: string }
  | { kind: "akun"; code: string }
  | { kind: "aset"; code: string }
  | { kind: "kontak"; id: string }
  | { kind: "faktur"; number: string }
  | { kind: "external"; href: string };

/**
 * Parse href marker sitasi inline yang ditulis model:
 * - "sak:11:11.1-11.3" → drawer aturan Bab 11 paragraf 11.1-11.3
 * - "jurnal:JE-2026-0004" → drawer rincian jurnal
 * - "item:BRG-001" → drawer rincian barang persediaan
 * - "akun:5900" → drawer rincian akun COA
 * - "aset:AST-001" → drawer rincian aset tetap
 * - "kontak:<id>" → drawer rincian kontak
 * - "faktur:INV-2026-0001" → drawer rincian faktur
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
  const item = /^item:(.+)$/i.exec(href.trim());
  if (item && item[1].trim().length > 0) {
    return { kind: "item", code: item[1].trim().toUpperCase() };
  }
  const akun = /^akun:(.+)$/i.exec(href.trim());
  if (akun && akun[1].trim().length > 0) {
    return { kind: "akun", code: akun[1].trim() };
  }
  const aset = /^aset:(.+)$/i.exec(href.trim());
  if (aset && aset[1].trim().length > 0) {
    return { kind: "aset", code: aset[1].trim().toUpperCase() };
  }
  const kontak = /^kontak:(.+)$/i.exec(href.trim());
  if (kontak && kontak[1].trim().length > 0) {
    return { kind: "kontak", id: kontak[1].trim() };
  }
  const faktur = /^faktur:(.+)$/i.exec(href.trim());
  if (faktur && faktur[1].trim().length > 0) {
    return { kind: "faktur", number: faktur[1].trim().toUpperCase() };
  }
  return { kind: "external", href };
}

// Pipeline rehype Streamdown untuk jawaban asisten.
// Dibuat sekali di level modul (pola Streamdown: cache pipeline per konfigurasi).
// = sanitize bawaan + protokol sitasi inline Akunio (sak:, jurnal:, item:, akun:, aset:, kontak:, faktur:).
const [sanitizeFn] = defaultRehypePlugins.sanitize as unknown as [unknown, unknown];
export const assistantRehypePlugins = [
  defaultRehypePlugins.raw,
  [
    sanitizeFn,
    {
      ...defaultSchema,
      protocols: {
        ...(defaultSchema.protocols ?? {}),
        href: [...((defaultSchema.protocols?.href as string[] | undefined) ?? []), "sak", "jurnal", "item", "akun", "aset", "kontak", "faktur"],
      },
    },
  ],
  defaultRehypePlugins.harden,
];
