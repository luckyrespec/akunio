import { Fragment, Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { Money } from "@/core/money/money";
import { EntryActions, type EntryActionData } from "@/components/journal/entry-actions";
import { JournalToolbar } from "@/components/journal/journal-toolbar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { GlowCard } from "@/components/aceternity/glow-card";
import { Reveal } from "@/components/motion";

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
  searchParams: Promise<{ q?: string; limit?: string; page?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const limit = LIMIT_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_LIMIT;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const [entries, total] = q
    ? await Promise.all([
        db.transaction((tx) => searchEntriesWithLines(tx, ctx.orgId, q, limit, offset)),
        countSearchEntries(db, ctx.orgId, q),
      ])
    : await Promise.all([
        db.transaction((tx) => listEntriesWithLines(tx, ctx.orgId, limit, offset)),
        countEntries(db, ctx.orgId),
      ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const rows = safePage === page ? entries : [];
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
    <section className="space-y-6">
      <PageHeader
        title="Jurnal Umum"
        eyebrow="Catatan transaksi harian"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/jurnal/baru">
              <Button className="bg-terra text-white shadow-xs hover:bg-terra/90 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]">
                + Tulis Jurnal
              </Button>
            </Link>
          </div>
        }
      />

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
    </section>
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
    : "Mulai dengan menekan “+ Tulis Jurnal” atau gunakan Asisten AI.";

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
