"use server";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { searchAccounts, searchJournals } from "@/server/db/repos/search.repo";

export interface GlobalSearchResult {
  pages: Array<{ href: string; label: string }>;
  journals: Array<{ id: string; number: string; memo: string; entryDate: string }>;
  accounts: Array<{ id: string; code: string; name: string }>;
}

const PAGES = [
  { href: "/dasbor", label: "Dasbor" },
  { href: "/jurnal", label: "Jurnal Umum" },
  { href: "/jurnal/ai", label: "Asisten AI" },
  { href: "/buku-besar", label: "Buku Besar" },
  { href: "/laporan", label: "Laporan" },
  { href: "/laporan/laba-rugi", label: "Laporan Laba Rugi" },
  { href: "/laporan/neraca", label: "Neraca" },
  { href: "/laporan/arus-kas", label: "Arus Kas" },
  { href: "/pengaturan", label: "Pengaturan" },
];

export async function searchGlobalAction(term: string): Promise<GlobalSearchResult> {
  const ctx = await requireContext();
  const q = term.trim().toLowerCase();
  if (!q) return { pages: [], journals: [], accounts: [] };

  const pages = PAGES.filter((p) => p.label.toLowerCase().includes(q) || p.href.includes(q)).slice(0, 3);

  const [journals, accounts] = await db.transaction(async (tx) => {
    const j = term.length >= 2 ? await searchJournals(tx, ctx.orgId, term, 4) : [];
    const a = term.length >= 2 ? await searchAccounts(tx, ctx.orgId, term, 4) : [];
    return [j, a] as const;
  });

  return { pages, journals, accounts };
}
