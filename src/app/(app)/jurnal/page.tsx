import { Fragment, Suspense } from "react";
import { ChevronLeft, ChevronRight, BookOpen, FileSpreadsheet, Clock } from "lucide-react";
import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  countEntries,
  countSearchEntries,
  listEntriesWithLines,
  searchEntriesWithLines,
  type EntryView,
} from "@/server/db/repos/journals.repo";
import {
  listPaginatedDrafts,
  countFilteredDrafts,
  countDraftsByStatus,
} from "@/server/db/repos/drafts.repo";
import { DraftsTab, type SerializedDraft } from "@/components/journal/drafts-tab";
import { Money } from "@/core/money/money";
import { EntryActions, type EntryActionData } from "@/components/journal/entry-actions";
import { JournalToolbar } from "@/components/journal/journal-toolbar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { GlowCard } from "@/components/aceternity/glow-card";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";

const LIMIT_OPTIONS = [10, 25, 50];
const DEFAULT_LIMIT = 25;

function toActionData(e: { id: string; number: string; status: string; reversalOfId: string | null }): EntryActionData {
  return {
    id: e.id,
    number: e.number,
    canReverse: e.status === "POSTED" && !e.reversalOfId,
  };
}

function href(q: string, limit: number, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (limit !== DEFAULT_LIMIT) params.set("limit", String(limit));
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/jurnal?${s}` : "/jurnal";
}

export default async function JurnalPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    limit?: string;
    page?: string;
    tab?: string;
    draftStatus?: string;
    draftQ?: string;
    draftLimit?: string;
    draftPage?: string;
  }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const tab = sp.tab === "draf" ? "draf" : "posted";

  // Posted tab parameters
  const q = (sp.q ?? "").trim().slice(0, 100);
  const limit = LIMIT_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_LIMIT;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  // Drafts tab parameters
  const validStatuses = ["PENDING", "ACCEPTED", "REJECTED", "ALL"] as const;
  const rawStatus = (sp.draftStatus ?? "PENDING").toUpperCase();
  const draftStatus = (validStatuses as readonly string[]).includes(rawStatus)
    ? (rawStatus as "PENDING" | "ACCEPTED" | "REJECTED" | "ALL")
    : "PENDING";
  const draftQ = (sp.draftQ ?? "").trim().slice(0, 100);
  const draftLimit = LIMIT_OPTIONS.includes(Number(sp.draftLimit)) ? Number(sp.draftLimit) : DEFAULT_LIMIT;
  const draftPage = Math.max(1, Number(sp.draftPage) || 1);
  const draftOffset = (draftPage - 1) * draftLimit;

  // Lightweight status counts & total posted count
  const [draftCounts, totalEntriesCount] = await Promise.all([
    countDraftsByStatus(db, ctx.orgId),
    tab === "posted" && q ? countSearchEntries(db, ctx.orgId, q) : countEntries(db, ctx.orgId),
  ]);

  const pendingDraftsCount = draftCounts.pending;

  let entries: EntryView[] = [];
  let total = totalEntriesCount;
  let rawDrafts: Array<Awaited<ReturnType<typeof listPaginatedDrafts>>[number]> = [];
  let filteredDraftCount = 0;

  if (tab === "draf") {
    const [fetchedDrafts, count] = await Promise.all([
      listPaginatedDrafts(db, ctx.orgId, {
        status: draftStatus,
        query: draftQ,
        limit: draftLimit,
        offset: draftOffset,
      }),
      countFilteredDrafts(db, ctx.orgId, {
        status: draftStatus,
        query: draftQ,
      }),
    ]);
    rawDrafts = fetchedDrafts;
    filteredDraftCount = count;
  } else {
    entries = await db.transaction((tx) =>
      q
        ? searchEntriesWithLines(tx, ctx.orgId, q, limit, offset)
        : listEntriesWithLines(tx, ctx.orgId, limit, offset),
    );
  }

  const serializedDrafts: SerializedDraft[] = rawDrafts.map((d) => ({
    id: d.id,
    kind: d.kind,
    inputText: d.inputText,
    draft: d.draft,
    model: d.model,
    status: d.status,
    postedEntryId: d.postedEntryId,
    createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    entryNumber: d.entryNumber ?? null,
  }));

  const draftTotalPages = Math.max(1, Math.ceil(filteredDraftCount / draftLimit));
  const draftSafePage = Math.min(draftPage, draftTotalPages);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(total, safePage * limit);
  const pageNums = [1, totalPages, safePage - 1, safePage, safePage + 1]
    .filter((p, i, a) => p >= 1 && p <= totalPages && a.indexOf(p) === i)
    .sort((a, b) => a - b);
  const pageTrail: (number | "…")[] = [];
  pageNums.forEach((p, i) => {
    if (i > 0 && p - pageNums[i - 1]! > 1) pageTrail.push("…");
    pageTrail.push(p);
  });

  return (
    <div className="flex flex-col lg:flex-row h-full w-full min-h-[calc(100vh-3.5rem)] bg-canvas">
      {/* 1. MINI SIDEMENU JURNAL & REVIEW */}
      <aside className="w-full lg:w-64 xl:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-rule bg-paper flex flex-col">
        {/* Info Header */}
        <div className="p-4 border-b border-rule shrink-0 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-terra/10 border border-terra/25 text-terra shadow-2xs">
              <BookOpen className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-sm font-bold text-ink truncate">
                Jurnal Keuangan
              </h3>
              <p className="text-[11px] text-ink-soft">Pencatatan &amp; Review Draf</p>
            </div>
          </div>

          <Link href="/jurnal/baru" className="block">
            <Button className="w-full bg-terra text-white shadow-xs hover:bg-terra/90 transition-all text-xs h-8.5 font-medium cursor-pointer">
              + Tulis Jurnal
            </Button>
          </Link>
        </div>

        {/* Sidemenu Nav Items */}
        <nav className="p-2 space-y-1.5 flex-1">
          <div className="px-3 py-1.5 text-[10px] font-bold text-ink-soft uppercase tracking-wider">
            Menu Transaksi
          </div>

          {/* Item 1: Jurnal */}
          <Link
            href="/jurnal"
            className={cn(
              "flex w-full items-start justify-between gap-2.5 rounded-xl px-3 py-2.5 text-xs transition-colors text-left group cursor-pointer",
              tab === "posted"
                ? "bg-terra/10 text-terra font-semibold border border-terra/25 shadow-2xs"
                : "text-ink-soft hover:bg-canvas hover:text-ink border border-transparent",
            )}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <FileSpreadsheet
                className={cn(
                  "size-4 shrink-0 mt-0.5 transition-colors",
                  tab === "posted" ? "text-terra" : "text-ink-soft group-hover:text-ink",
                )}
              />
              <div className="min-w-0">
                <div className={cn("font-medium text-xs", tab === "posted" ? "text-terra font-semibold" : "text-ink")}>
                  Jurnal
                </div>
                <div className="text-[10px] text-ink-soft leading-tight mt-0.5">
                  Buku catatan transaksi
                </div>
              </div>
            </div>
            <span
              className={cn(
                "tnum text-[10px] rounded-full px-2 py-0.5 shrink-0 mt-0.5",
                tab === "posted"
                  ? "bg-terra/15 text-terra font-bold"
                  : "bg-canvas text-ink-soft border border-rule/50",
              )}
            >
              {totalEntriesCount}
            </span>
          </Link>

          {/* Item 2: Review */}
          <Link
            href="/jurnal?tab=draf"
            className={cn(
              "flex w-full items-start justify-between gap-2.5 rounded-xl px-3 py-2.5 text-xs transition-colors text-left group cursor-pointer",
              tab === "draf"
                ? "bg-terra/10 text-terra font-semibold border border-terra/25 shadow-2xs"
                : "text-ink-soft hover:bg-canvas hover:text-ink border border-transparent",
            )}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <Clock
                className={cn(
                  "size-4 shrink-0 mt-0.5 transition-colors",
                  tab === "draf" ? "text-terra" : "text-ink-soft group-hover:text-ink",
                )}
              />
              <div className="min-w-0">
                <div className={cn("font-medium text-xs", tab === "draf" ? "text-terra font-semibold" : "text-ink")}>
                  Review
                </div>
                <div className="text-[10px] text-ink-soft leading-tight mt-0.5">
                  Draf menunggu persetujuan
                </div>
              </div>
            </div>
            {pendingDraftsCount > 0 ? (
              <span className="tnum text-[10px] rounded-full bg-terra/15 text-terra font-bold px-2 py-0.5 shrink-0 mt-0.5">
                {pendingDraftsCount}
              </span>
            ) : (
              <span className="tnum text-[10px] rounded-full bg-canvas text-ink-soft px-2 py-0.5 shrink-0 mt-0.5 border border-rule/50">
                0
              </span>
            )}
          </Link>
        </nav>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto">
        {tab === "draf" ? (
          <>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight text-ink">
                Review Draf Transaksi
              </h1>
              <p className="mt-0.5 text-xs text-ink-soft">
                Tinjau usulan jurnal hasil pemeriksaan sistem, asisten pembukuan, maupun dokumen faktur sebelum diposting.
              </p>
            </div>

            <DraftsTab
              drafts={serializedDrafts}
              total={filteredDraftCount}
              page={draftSafePage}
              totalPages={draftTotalPages}
              limit={draftLimit}
              currentQuery={draftQ}
              currentStatus={draftStatus}
              counts={draftCounts}
            />
          </>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight text-ink">
                  Buku Jurnal Umum
                </h1>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Catatan kronologis seluruh transaksi keuangan yang telah diposting ke buku besar.
                </p>
              </div>
              <div className="shrink-0 hidden sm:block">
                <Link href="/jurnal/baru">
                  <Button size="sm" className="bg-terra text-white shadow-xs hover:bg-terra/90 text-xs h-8.5 cursor-pointer">
                    + Tulis Jurnal
                  </Button>
                </Link>
              </div>
            </div>

            <Suspense>
              <JournalToolbar defaultQuery={q} defaultLimit={limit} />
            </Suspense>

            <ManualTab items={entries} emptyQuery={q} />

            {totalPages > 1 && (
              <nav className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between" aria-label="Navigasi halaman jurnal">
                <p className="text-xs text-ink-soft">
                  Menampilkan {from}–{to} dari {total} entri{q ? ` untuk “${q}”` : ""}
                </p>
                <div className="flex items-center gap-1">
                  <PageLink href={href(q, limit, safePage - 1)} disabled={safePage <= 1} label={<ChevronLeft className="size-3.5" />} aria="Halaman sebelumnya" />
                  {pageTrail.map((p, i) =>
                    p === "…" ? (
                      <span key={`e${i}`} className="px-1 text-xs text-ink-soft">…</span>
                    ) : (
                      <PageLink key={p} href={href(q, limit, p)} active={p === safePage} label={String(p)} />
                    ),
                  )}
                  <PageLink href={href(q, limit, safePage + 1)} disabled={safePage >= totalPages} label={<ChevronRight className="size-3.5" />} aria="Halaman berikutnya" />
                </div>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function PageLink({
  href: h,
  label,
  active,
  disabled,
  aria,
}: {
  href: string;
  label: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  aria?: string;
}) {
  if (disabled) {
    return (
      <span aria-hidden className="rounded-lg border border-rule/60 px-2.5 py-1.5 text-xs text-ink-soft/40">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={h}
      aria-label={aria}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? "border-terra bg-terra font-semibold text-white"
          : "border-rule bg-paper text-ink hover:bg-canvas"
      }`}
    >
      {label}
    </Link>
  );
}

function ManualTab({ items, emptyQuery }: { items: EntryView[]; emptyQuery: string }) {
  const emptyTitle = emptyQuery ? `Tidak ada hasil untuk “${emptyQuery}”` : "Belum ada jurnal";
  const emptyHint = emptyQuery
    ? "Coba kata kunci lain atau reset pencarian."
    : "Mulai dengan menekan “+ Tulis Jurnal” atau minta bantuan Asisten.";

  return (
    <Reveal delay={0.08}>
    <div className="space-y-4">
      {/* Mobile Card View (< sm) */}
      <div className="space-y-3 sm:hidden">
        {items.length === 0 && (
          <div className="rounded-xl border border-rule bg-paper p-8 text-center shadow-xs">
            <p className="font-display text-base font-medium text-ink">{emptyTitle}</p>
            <p className="mt-1 text-xs text-ink-soft">{emptyHint}</p>
          </div>
        )}
        {items.map((e) => (
          <div key={e.id} className="rounded-xl border border-rule bg-paper p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-rule/50 pb-2.5">
              <div>
                <span className="font-semibold text-sm text-ink">{e.number}</span>
                <span className="ml-2 text-xs text-ink-soft">{e.entryDate}</span>
              </div>
              <EntryActions entry={toActionData(e)} />
            </div>
            {e.memo && (
              <p className="text-xs text-ink-soft italic">“{e.memo}”</p>
            )}
            <div className="space-y-2 pt-1">
              {e.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="font-mono font-medium text-ink">{l.accountCode}</span>
                    <span className="mx-1 text-ink-soft">·</span>
                    <span className="text-ink truncate">{l.accountName}</span>
                  </div>
                  <div className="shrink-0 tnum font-medium">
                    {l.debitMinor > 0n ? (
                      <span className="rounded bg-debit/10 px-2 py-0.5 text-debit font-semibold">
                        D: {Money.fromMinor(l.debitMinor).formatIdr()}
                      </span>
                    ) : (
                      <span className="rounded bg-credit/10 px-2 py-0.5 text-credit font-semibold">
                        K: {Money.fromMinor(l.creditMinor).formatIdr()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop & Tablet Table View (>= sm) */}
      <div className="hidden sm:block">
        <GlowCard>
          <div className="overflow-x-auto rounded-xl border border-rule bg-paper shadow-xs">
            <table className="w-full tnum text-sm">
              <thead>
                <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3">Nomor</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Akun &amp; Keterangan</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Kredit</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <p className="font-display text-base font-medium text-ink">{emptyTitle}</p>
                      <p className="mt-1 text-xs text-ink-soft">{emptyHint}</p>
                    </td>
                  </tr>
                )}
                {items.map((e) => (
                  <Fragment key={e.id}>
                    {e.lines.map((l, i) => (
                      <tr key={l.id} className="transition-colors hover:bg-canvas/30">
                        <td className="px-4 py-3 align-top">
                          {i === 0 ? <span className="font-semibold text-ink">{e.number}</span> : ""}
                        </td>
                        <td className="px-4 py-3 align-top text-ink-soft">{i === 0 ? e.entryDate : ""}</td>
                        <td className="px-4 py-3 pl-8">
                          <span className="font-mono text-xs font-medium text-ink">{l.accountCode}</span> <span className="text-ink-soft">·</span> {l.accountName}
                          <span className="ml-2 text-xs text-ink-soft">({l.memo ?? e.memo})</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.debitMinor > 0n ? Money.fromMinor(l.debitMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.creditMinor > 0n ? Money.fromMinor(l.creditMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {i === 0 && <EntryActions entry={toActionData(e)} />}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </GlowCard>
      </div>

      {items.some((e) => e.reversalOfId) && (
        <p className="text-xs text-ink-soft">
          Entri dengan balikan terhubung otomatis; koreksi tidak pernah menghapus riwayat audit.
        </p>
      )}
    </div>
    </Reveal>
  );
}
