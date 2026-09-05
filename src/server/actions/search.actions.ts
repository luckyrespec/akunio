"use server";
import { db } from "@/server/db";
import { requireContext } from "@/server/auth/guard";
import { searchAccounts } from "@/server/db/repos/search.repo";
import { searchEntriesByAmount, searchEntriesWithLines } from "@/server/db/repos/journals.repo";
import { searchAssets } from "@/server/db/repos/assets.repo";
import { listInvoicesRepo } from "@/server/db/repos/invoices.repo";
import { invoiceMatchesQuery, parseNominalMinor } from "@/server/search/match";
import { Money } from "@/core/money/money";

import { searchSakDocs, type SakSearchResult } from "@/server/db/repos/sak-docs.repo";

export interface GlobalSearchResult {
  pages: Array<{ href: string; label: string }>;
  journals: Array<{ id: string; number: string; memo: string; entryDate: string; totalText: string }>;
  accounts: Array<{ id: string; code: string; name: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; contactName: string; status: string; totalText: string }>;
  assets: Array<{ id: string; code: string; name: string; status: string; costText: string }>;
  rules: SakSearchResult[];
}

const PAGES = [
  { href: "/dasbor", label: "Dasbor" },
  { href: "/jurnal", label: "Jurnal Umum" },
  { href: "/asisten", label: "Asisten Akunio" },
  { href: "/aturan", label: "Aturan SAK EMKM (Buku Pedoman)" },
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
  const empty: GlobalSearchResult = { pages: [], journals: [], accounts: [], invoices: [], assets: [], rules: [] };
  if (!q || term.trim().length < 2) return empty;

  const pages = PAGES.filter((p) => p.label.toLowerCase().includes(q) || p.href.includes(q)).slice(0, 3);
  const amountMinor = parseNominalMinor(term.trim());

  const [journalHits, accounts, assets] = await db.transaction(async (tx) => {
    // Teks: nomor + keterangan + nama/kode akun; nominal: total entri.
    const byText = await searchEntriesWithLines(tx, ctx.orgId, term.trim(), 4, 0);
    const byAmount = amountMinor !== null
      ? await searchEntriesByAmount(tx, ctx.orgId, amountMinor, 4)
      : [];
    const seen = new Set(byText.map((e) => e.id));
    const journals = [...byText, ...byAmount.filter((e) => !seen.has(e.id))].slice(0, 4);
    const a = await searchAccounts(tx, ctx.orgId, term, 4);
    const ast = await searchAssets(tx, ctx.orgId, term.trim(), amountMinor, 4);
    return [journals, a, ast] as const;
  });

  const journals = journalHits.map((j) => ({
    id: j.id,
    number: j.number,
    memo: j.memo,
    entryDate: j.entryDate,
    totalText: Money.fromMinor(j.lines.reduce((s, l) => s + l.debitMinor, 0n)).formatIdr(),
  }));

  const invoices = (await listInvoicesRepo(db, ctx.orgId))
    .filter((inv) => invoiceMatchesQuery(inv, q, amountMinor))
    .slice(0, 4)
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      contactName: inv.contactName,
      status: inv.status,
      totalText: Money.fromMinor(inv.totalMinor).formatIdr(),
    }));

  const rules = await searchSakDocs(term.trim(), 4);

  return {
    pages,
    journals,
    accounts,
    invoices,
    assets: assets.map((a) => ({
      ...a,
      costText: Money.fromMinor(a.acquisitionCostMinor).formatIdr(),
    })),
    rules,
  };
}
