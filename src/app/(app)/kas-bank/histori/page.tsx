import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getCashHistoryRepo } from "@/server/db/repos/cash-bank.repo";
import { accounts } from "@/server/db/schema/org";
import { PageHeader } from "@/components/page-header";
import { HistoryTable } from "@/components/kas-bank/history-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eq, and, or } from "drizzle-orm";
import {
  ArrowDownUp,
  CalendarArrowDown,
  CalendarArrowUp,
  ChevronLeft,
  ChevronRight,
  Rows3,
  Scale,
  Search,
  Wallet,
} from "lucide-react";
import { currentMonthRange } from "../_data";

const LIMIT_OPTIONS = [10, 25, 50];
const DEFAULT_LIMIT = 25;
const ARAH_OPTIONS = ["semua", "masuk", "keluar"] as const;
type Arah = (typeof ARAH_OPTIONS)[number];

const FIELD_LABEL =
  "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-ink-soft";
const FIELD_SELECT =
  "h-9 rounded-xl border border-rule bg-canvas px-2.5 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/50";

function formatIdDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

export default async function HistoriPage({
  searchParams,
}: {
  searchParams: Promise<{
    akun?: string;
    dari?: string;
    sampai?: string;
    q?: string;
    arah?: string;
    limit?: string;
    page?: string;
  }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const cashAccounts = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, ctx.orgId),
        or(eq(accounts.isBank, true), eq(accounts.isCash, true))
      )
    );
  const def = currentMonthRange();
  const akun = sp.akun ?? cashAccounts[0]?.id ?? "";
  const dari = sp.dari ?? def.dari;
  const sampai = sp.sampai ?? def.sampai;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const arah: Arah = (ARAH_OPTIONS as readonly string[]).includes(sp.arah ?? "")
    ? (sp.arah as Arah)
    : "semua";
  const limit = LIMIT_OPTIONS.includes(Number(sp.limit))
    ? Number(sp.limit)
    : DEFAULT_LIMIT;
  const page = Math.max(1, Number(sp.page) || 1);

  const history = akun
    ? await getCashHistoryRepo(db, ctx.orgId, akun, dari, sampai)
    : null;
  const periodLabel = `${formatIdDate(dari)} – ${formatIdDate(sampai)}`;

  const allRows = history?.rows ?? [];
  let totalMasuk = 0n;
  let totalKeluar = 0n;
  for (const r of allRows) {
    totalMasuk += r.debitMinor;
    totalKeluar += r.creditMinor;
  }
  const closingMinor =
    allRows.length > 0
      ? allRows[allRows.length - 1].balanceMinor
      : (history?.openingMinor ?? 0n);

  const needle = q.toLowerCase();
  const filtered = allRows.filter((r) => {
    if (arah === "masuk" && r.debitMinor <= 0n) return false;
    if (arah === "keluar" && r.creditMinor <= 0n) return false;
    if (
      needle &&
      !`${r.memo} ${r.number}`.toLowerCase().includes(needle)
    )
      return false;
    return true;
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(total, safePage * limit);
  const pageRows = filtered.slice((safePage - 1) * limit, safePage * limit);

  const pageNums = [1, totalPages, safePage - 1, safePage, safePage + 1]
    .filter((p, i, a) => p >= 1 && p <= totalPages && a.indexOf(p) === i)
    .sort((a, b) => a - b);
  const pageTrail: (number | "…")[] = [];
  pageNums.forEach((p, i) => {
    if (i > 0 && p - pageNums[i - 1]! > 1) pageTrail.push("…");
    pageTrail.push(p);
  });

  function histHref(overrides: { page?: number; resetFilter?: boolean }): string {
    const params = new URLSearchParams();
    if (akun) params.set("akun", akun);
    params.set("dari", dari);
    params.set("sampai", sampai);
    const nq = overrides.resetFilter ? "" : q;
    const na = overrides.resetFilter ? "semua" : arah;
    if (nq) params.set("q", nq);
    if (na !== "semua") params.set("arah", na);
    if (limit !== DEFAULT_LIMIT) params.set("limit", String(limit));
    const p = overrides.page ?? 1;
    if (p > 1) params.set("page", String(p));
    return `/kas-bank/histori?${params.toString()}`;
  }

  const hasActiveFilter = q !== "" || arah !== "semua";
  const filterNotes: string[] = [];
  if (q) filterNotes.push(`cari “${q}”`);
  if (arah === "masuk") filterNotes.push("masuk saja");
  if (arah === "keluar") filterNotes.push("keluar saja");
  const filterTitle = q
    ? `Tidak ada hasil untuk “${q}”`
    : arah === "masuk"
      ? "Tidak ada dana masuk pada filter ini"
      : "Tidak ada dana keluar pada filter ini";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histori Bank"
        eyebrow="Mutasi kas dan bank versi pembukuan. Bandingkan dengan rekening koran saat rekonsiliasi."
        actions={
          <Link href="/kas-bank/rekonsiliasi">
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-xs"
            >
              <Scale className="size-4 text-terra" />
              Rekonsiliasi
            </Button>
          </Link>
        }
      />

      <form
        method="get"
        className="flex flex-wrap items-end gap-x-3 gap-y-4 rounded-xl border border-rule bg-paper p-4 shadow-2xs"
      >
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label htmlFor="hist-akun" className={FIELD_LABEL}>
            <Wallet className="size-3" aria-hidden />
            Rekening
          </Label>
          <select
            id="hist-akun"
            name="akun"
            defaultValue={akun}
            className={`${FIELD_SELECT} w-full`}
          >
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hist-dari" className={FIELD_LABEL}>
            <CalendarArrowUp className="size-3" aria-hidden />
            Dari tanggal
          </Label>
          <Input
            id="hist-dari"
            name="dari"
            type="date"
            defaultValue={dari}
            className="h-9 bg-canvas text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hist-sampai" className={FIELD_LABEL}>
            <CalendarArrowDown className="size-3" aria-hidden />
            Sampai tanggal
          </Label>
          <Input
            id="hist-sampai"
            name="sampai"
            type="date"
            defaultValue={sampai}
            className="h-9 bg-canvas text-sm"
          />
        </div>
        <div className="min-w-44 flex-1 space-y-1.5">
          <Label htmlFor="hist-q" className={FIELD_LABEL}>
            <Search className="size-3" aria-hidden />
            Cari
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <Input
              id="hist-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Nomor atau keterangan…"
              aria-label="Cari nomor atau keterangan mutasi"
              className="h-9 bg-canvas pl-9 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hist-arah" className={FIELD_LABEL}>
            <ArrowDownUp className="size-3" aria-hidden />
            Arah
          </Label>
          <select
            id="hist-arah"
            name="arah"
            defaultValue={arah}
            className={FIELD_SELECT}
          >
            <option value="semua">Semua mutasi</option>
            <option value="masuk">Masuk saja</option>
            <option value="keluar">Keluar saja</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hist-limit" className={FIELD_LABEL}>
            <Rows3 className="size-3" aria-hidden />
            Baris
          </Label>
          <select
            id="hist-limit"
            name="limit"
            defaultValue={String(limit)}
            className={FIELD_SELECT}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          className="h-9 rounded-xl bg-terra px-3.5 text-xs font-medium text-white shadow-none transition-all hover:bg-terra/90 active:scale-[0.98]"
        >
          <Search className="size-4" />
          Tampilkan
        </Button>
      </form>

      {history && (
        <>
          <HistoryTable
            accountCode={history.account.code}
            accountName={history.account.name}
            periodLabel={periodLabel}
            summary={{
              openingMinor: history.openingMinor,
              totalMasuk,
              totalKeluar,
              closingMinor,
            }}
            rows={pageRows}
            hasActiveFilter={hasActiveFilter}
            filterTitle={filterTitle}
            resetHref={histHref({ resetFilter: true })}
          />

          <nav
            className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between"
            aria-label="Navigasi halaman histori"
          >
            <p className="text-xs text-ink-soft tnum">
              Menampilkan {from}–{to} dari {total} mutasi
              {filterNotes.length > 0 && ` · ${filterNotes.join(" · ")}`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <PageLink
                  href={histHref({ page: safePage - 1 })}
                  disabled={safePage <= 1}
                  label={<ChevronLeft className="size-3.5" />}
                  aria="Halaman sebelumnya"
                />
                {pageTrail.map((p, i) =>
                  p === "…" ? (
                    <span
                      key={`e${i}`}
                      className="px-1 text-xs text-ink-soft"
                    >
                      …
                    </span>
                  ) : (
                    <PageLink
                      key={p}
                      href={histHref({ page: p })}
                      active={p === safePage}
                      label={String(p)}
                    />
                  ),
                )}
                <PageLink
                  href={histHref({ page: safePage + 1 })}
                  disabled={safePage >= totalPages}
                  label={<ChevronRight className="size-3.5" />}
                  aria="Halaman berikutnya"
                />
              </div>
            )}
          </nav>
        </>
      )}
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
      <span
        aria-hidden
        className="rounded-lg border border-rule/60 px-2.5 py-1.5 text-xs text-ink-soft/40"
      >
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
