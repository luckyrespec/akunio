"use client";

import { useState, useEffect, useRef, useTransition, Fragment } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Clock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconReview } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Money } from "@/core/money/money";
import { Reveal } from "@/components/motion";
import { GlowCard } from "@/components/aceternity/glow-card";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { DEFAULT_DEBOUNCE_MS } from "@/lib/constants";
import { rejectDraftAction, bulkRejectDraftsAction } from "@/server/actions/ai.actions";

export interface SerializedDraft {
  id: string;
  kind: "TEXT" | "DOCUMENT";
  inputText: string;
  draft: unknown;
  model: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  postedEntryId: string | null;
  createdAt: string;
  entryNumber: string | null;
}

interface DraftsTabProps {
  drafts: SerializedDraft[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
  currentQuery: string;
  currentStatus: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL";
  counts: {
    pending: number;
    accepted: number;
    rejected: number;
    total: number;
  };
}

interface ParsedLine {
  accountCode: string;
  accountName?: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo?: string;
}

interface DraftSummary {
  memo: string;
  dateISO: string;
  totalDebit: bigint;
  totalCredit: bigint;
  lineCount: number;
  isDoctor: boolean;
  lines: ParsedLine[];
}

function parseDraftSummary(draftObj: unknown): DraftSummary {
  if (!draftObj || typeof draftObj !== "object") {
    return { memo: "", dateISO: "", totalDebit: 0n, totalCredit: 0n, lineCount: 0, isDoctor: false, lines: [] };
  }
  const d = draftObj as {
    memo?: string;
    dateISO?: string;
    findingId?: string;
    lines?: Array<{
      accountCode?: string;
      accountName?: string;
      debitMinor?: string | number | bigint;
      creditMinor?: string | number | bigint;
      debitText?: string;
      creditText?: string;
      reason?: string;
    }>;
  };

  let deb = 0n;
  let cred = 0n;
  const rawLines = Array.isArray(d.lines) ? d.lines : [];
  const parsedLines: ParsedLine[] = [];

  for (const l of rawLines) {
    let lineDeb = 0n;
    let lineCred = 0n;

    if (l.debitMinor !== undefined) {
      lineDeb = BigInt(String(l.debitMinor));
    } else if (typeof l.debitText === "string" && l.debitText.trim()) {
      lineDeb = Money.parseIdr(l.debitText).minor;
    }

    if (l.creditMinor !== undefined) {
      lineCred = BigInt(String(l.creditMinor));
    } else if (typeof l.creditText === "string" && l.creditText.trim()) {
      lineCred = Money.parseIdr(l.creditText).minor;
    }

    deb += lineDeb;
    cred += lineCred;

    parsedLines.push({
      accountCode: l.accountCode || "—",
      accountName: l.accountName,
      debitMinor: lineDeb,
      creditMinor: lineCred,
      memo: l.reason,
    });
  }

  return {
    memo: d.memo || "",
    dateISO: d.dateISO || "",
    totalDebit: deb,
    totalCredit: cred,
    lineCount: parsedLines.length,
    isDoctor: Boolean(d.findingId),
    lines: parsedLines,
  };
}

const LIMITS = [10, 25, 50];

export function DraftsTab({
  drafts,
  total,
  page,
  totalPages,
  limit,
  currentQuery,
  currentStatus,
  counts,
}: DraftsTabProps) {
  const router = useRouter();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(currentQuery);
  const debouncedDraftQ = useDebounce(searchQuery, DEFAULT_DEBOUNCE_MS);
  const isFirstMount = useRef(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSearchQuery(currentQuery);
  }, [currentQuery]);

  // Auto-search when debounced search query changes
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (debouncedDraftQ.trim() !== currentQuery.trim()) {
      router.push(makeUrl({ q: debouncedDraftQ, page: 1 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDraftQ]);

  // Clear selection when filters or page change
  useEffect(() => {
    setSelectedIds([]);
  }, [currentStatus, currentQuery, page]);

  function makeUrl(overrides: { status?: string; q?: string; limit?: number; page?: number }) {
    const params = new URLSearchParams();
    params.set("tab", "draf");

    const st = overrides.status !== undefined ? overrides.status : currentStatus;
    if (st && st !== "PENDING") {
      params.set("draftStatus", st);
    }

    const q = overrides.q !== undefined ? overrides.q : currentQuery;
    if (q && q.trim()) {
      params.set("draftQ", q.trim());
    }

    const lim = overrides.limit !== undefined ? overrides.limit : limit;
    if (lim && lim !== 25) {
      params.set("draftLimit", String(lim));
    }

    const p = overrides.page !== undefined ? overrides.page : 1;
    if (p > 1) {
      params.set("draftPage", String(p));
    }

    return `/jurnal?${params.toString()}`;
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(makeUrl({ q: searchQuery, page: 1 }));
  }

  function handleStatusChange(statusKey: "PENDING" | "ACCEPTED" | "REJECTED" | "ALL") {
    setSelectedIds([]);
    router.push(makeUrl({ status: statusKey, page: 1 }));
  }

  function handleLimitChange(newLimit: number) {
    setSelectedIds([]);
    router.push(makeUrl({ limit: newLimit, page: 1 }));
  }

  // Identifikasi pending drafts di halaman saat ini
  const pendingDrafts = drafts.filter((d) => d.status === "PENDING");
  const isAllPendingSelected =
    pendingDrafts.length > 0 && pendingDrafts.every((d) => selectedIds.includes(d.id));

  function handleToggleSelectAll() {
    if (isAllPendingSelected) {
      // Unselect all pending drafts on this page
      const pendingSet = new Set(pendingDrafts.map((d) => d.id));
      setSelectedIds((prev) => prev.filter((id) => !pendingSet.has(id)));
    } else {
      // Select all pending drafts on this page
      const newSet = new Set([...selectedIds, ...pendingDrafts.map((d) => d.id)]);
      setSelectedIds(Array.from(newSet));
    }
  }

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  async function handleReject(id: string) {
    if (!confirm("Apakah Anda yakin ingin membatalkan dan menghapus draf ini?")) return;
    setRejectingId(id);
    startTransition(async () => {
      try {
        const res = await rejectDraftAction(id);
        if (res.ok) {
          setSelectedIds((prev) => prev.filter((item) => item !== id));
          router.refresh();
        } else {
          alert(res.error || "Gagal membatalkan draf.");
        }
      } catch {
        alert("Terjadi kesalahan jaringan.");
      } finally {
        setRejectingId(null);
      }
    });
  }

  async function handleBulkReject() {
    if (!selectedIds.length) return;
    if (
      !confirm(
        `Apakah Anda yakin ingin membatalkan & menghapus ${selectedIds.length} draf yang dipilih?`,
      )
    ) {
      return;
    }

    setIsBulkRejecting(true);
    startTransition(async () => {
      try {
        const res = await bulkRejectDraftsAction(selectedIds);
        if (res.ok) {
          setSelectedIds([]);
          router.refresh();
        } else {
          alert(res.error || "Gagal membatalkan beberapa draf.");
        }
      } catch {
        alert("Terjadi kesalahan jaringan saat memproses pembatalan draf.");
      } finally {
        setIsBulkRejecting(false);
      }
    });
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const pageNums = [1, totalPages, page - 1, page, page + 1]
    .filter((p, i, a) => p >= 1 && p <= totalPages && a.indexOf(p) === i)
    .sort((a, b) => a - b);
  const pageTrail: (number | "…")[] = [];
  pageNums.forEach((p, i) => {
    if (i > 0 && p - pageNums[i - 1]! > 1) pageTrail.push("…");
    pageTrail.push(p);
  });

  return (
    <div className="space-y-4">
      {/* Status Filter Tabs & Search / Limit Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-rule bg-paper p-1 text-xs shadow-2xs w-fit">
          {(
            [
              { key: "PENDING", label: "Menunggu Review", count: counts.pending },
              { key: "ACCEPTED", label: "Telah Diposting", count: counts.accepted },
              { key: "REJECTED", label: "Dibatalkan", count: counts.rejected },
              { key: "ALL", label: "Semua Draf", count: counts.total },
            ] as const
          ).map((t) => {
            const isActive = currentStatus === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleStatusChange(t.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium transition-colors focus-ring flex items-center gap-1.5 cursor-pointer",
                  isActive
                    ? "bg-canvas text-terra font-semibold shadow-2xs border border-rule/70"
                    : "text-ink-soft hover:text-ink hover:bg-canvas/50",
                )}
              >
                <span>{t.label}</span>
                <span
                  className={cn(
                    "tnum text-[10px] rounded-full px-1.5 py-0.2",
                    isActive ? "bg-terra/15 text-terra font-bold" : "bg-canvas text-ink-soft",
                  )}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search form & Limit selector */}
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari memo, nomor, teks..."
              className="h-9 border-rule bg-paper pl-8.5 pr-8 text-xs placeholder:text-ink-soft/70"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  router.push(makeUrl({ q: "", page: 1 }));
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink cursor-pointer p-0.5"
                title="Reset pencarian"
              >
                <X className="size-3.5" />
              </button>
            )}
          </form>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSearchSubmit}
            className="h-9 text-xs border-rule hover:border-terra/40 cursor-pointer"
          >
            Cari
          </Button>

          {currentQuery && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                router.push(makeUrl({ q: "", page: 1 }));
              }}
              className="h-9 text-xs text-ink-soft hover:text-ink cursor-pointer"
            >
              Reset
            </Button>
          )}

          <div className="flex items-center gap-1.5 text-xs text-ink-soft pl-1">
            <span>Baris:</span>
            <select
              value={limit}
              onChange={(e) => handleLimitChange(Number(e.target.value))}
              className="h-9 rounded-lg border border-rule bg-paper px-2 text-xs text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra cursor-pointer"
            >
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bulk Action Bar (Visible when items are selected) */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-terra/30 bg-terra/5 px-4 py-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-terra text-white text-xs font-bold">
              {selectedIds.length}
            </span>
            <span className="text-xs font-medium text-ink">
              <span className="font-semibold">{selectedIds.length}</span> draf dipilih
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
              className="h-8 text-xs text-ink-soft hover:text-ink cursor-pointer"
            >
              Batalkan Pilihan
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isPending || isBulkRejecting}
              onClick={handleBulkReject}
              className="h-8 text-xs bg-terra text-white hover:bg-terra/90 cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              {isBulkRejecting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Hapus / Batalkan Terpilih ({selectedIds.length})
            </Button>
          </div>
        </div>
      )}

      {/* Drafts Content */}
      {drafts.length === 0 ? (
        <Reveal>
          <div className="matte-card flex flex-col items-center justify-center rounded-2xl border border-rule bg-paper px-6 py-16 text-center shadow-xs">
            <div className="flex size-12 items-center justify-center rounded-full bg-debit/10 text-debit mb-3">
              <CheckCircle2 className="size-6" />
            </div>
            <h3 className="font-display text-base font-semibold text-ink">
              {currentQuery
                ? `Tidak ada draf yang cocok dengan "${currentQuery}"`
                : currentStatus === "PENDING"
                ? "Tidak Ada Draf yang Menunggu Review"
                : `Tidak ada draf dengan status ${
                    currentStatus === "ACCEPTED"
                      ? "Telah Diposting"
                      : currentStatus === "REJECTED"
                      ? "Dibatalkan"
                      : "Semua Draf"
                  }.`}
            </h3>
            <p className="mt-1.5 max-w-md text-xs text-ink-soft leading-relaxed">
              {currentQuery ? (
                "Coba periksa kata kunci Anda atau bersihkan pencarian untuk melihat semua draf."
              ) : currentStatus === "PENDING" ? (
                "Semua draf transaksi jurnal telah diposting atau ditolak. Pembukuan Anda siap untuk proses tutup buku."
              ) : (
                "Draf transaksi akan muncul di sini saat dibuat dari usulan koreksi atau asisten pembukuan."
              )}
            </p>
            {currentQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  router.push(makeUrl({ q: "", page: 1 }));
                }}
                className="mt-4 h-8 text-xs border-rule cursor-pointer"
              >
                Reset Pencarian
              </Button>
            )}
          </div>
        </Reveal>
      ) : (
        <Reveal>
          <div className="space-y-4">
            {/* Mobile Cards (< sm) */}
            <div className="space-y-3 sm:hidden">
              {drafts.map((d) => {
                const summary = parseDraftSummary(d.draft);
                const dateStr = new Date(d.createdAt).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                const isDoctor = summary.isDoctor || d.model === "doctor-sak";
                const memoDisplay = summary.memo || d.inputText || "Draf Transaksi Jurnal";
                const isExpanded = expandedId === d.id;
                const isSelected = selectedIds.includes(d.id);

                return (
                  <div
                    key={d.id}
                    className={cn(
                      "rounded-xl border bg-paper p-4 shadow-xs space-y-3 transition-colors",
                      isSelected ? "border-terra/40 bg-terra/5" : "border-rule",
                    )}
                  >
                    <div className="flex items-center justify-between border-b border-rule/50 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        {d.status === "PENDING" && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSelect(d.id)}
                            aria-label={`Pilih draf ${d.id}`}
                            className="cursor-pointer"
                          />
                        )}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            isDoctor
                              ? "bg-terra/10 text-terra border-terra/20"
                              : d.kind === "DOCUMENT"
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                              : "bg-canvas text-ink-soft border-rule",
                          )}
                        >
                          {isDoctor ? (
                            <Sparkles className="size-2.5" />
                          ) : (
                            <FileText className="size-2.5" />
                          )}
                          {isDoctor ? "Pemeriksa Jurnal" : d.kind === "DOCUMENT" ? "Faktur" : "Asisten"}
                        </span>
                        <span className="text-xs text-ink-soft">{dateStr}</span>
                      </div>
                      {d.status === "ACCEPTED" ? (
                        <span className="inline-flex items-center rounded-full border border-debit/30 bg-debit/10 px-2 py-0.5 text-[10px] font-semibold text-debit">
                          Diposting
                        </span>
                      ) : d.status === "REJECTED" ? (
                        <span className="inline-flex items-center rounded-full border border-rule bg-canvas px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                          Dibatalkan
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-terra/30 bg-terra/10 px-2 py-0.5 text-[10px] font-semibold text-terra">
                          <Clock className="size-2.5" />
                          Menunggu
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-ink leading-snug">{memoDisplay}</p>
                      <p className="mt-1 text-xs text-ink-soft">{summary.lineCount} baris akun</p>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-canvas/60 px-3 py-2 text-xs">
                      <div>
                        <span className="text-ink-soft text-[11px]">Total Debit</span>
                        <p className="font-mono font-semibold text-ink">
                          {Money.fromMinor(summary.totalDebit).formatIdr()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-ink-soft text-[11px]">Total Kredit</span>
                        <p className="font-mono font-semibold text-ink">
                          {Money.fromMinor(summary.totalCredit).formatIdr()}
                        </p>
                      </div>
                    </div>

                    {summary.lines.length > 0 && (
                      <div>
                        <button
                          type="button"
                          onClick={() => toggleExpand(d.id)}
                          className="flex items-center gap-1 text-[11px] font-medium text-terra hover:underline cursor-pointer"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="size-3" /> Sembunyikan Rincian Akun
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3" /> Lihat Rincian Akun ({summary.lines.length})
                            </>
                          )}
                        </button>
                        {isExpanded && (
                          <div className="mt-2 space-y-1.5 rounded-lg border border-rule/60 bg-canvas/30 p-2.5 text-xs">
                            {summary.lines.map((l, idx) => (
                              <div key={idx} className="flex items-center justify-between border-b border-rule/30 pb-1 last:border-0 last:pb-0">
                                <span className="font-mono text-ink">{l.accountCode}</span>
                                <div className="tnum font-medium text-right">
                                  {l.debitMinor > 0n ? (
                                    <span className="text-debit">D: {Money.fromMinor(l.debitMinor).formatIdr()}</span>
                                  ) : (
                                    <span className="text-credit">K: {Money.fromMinor(l.creditMinor).formatIdr()}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-rule/40">
                      {d.status === "PENDING" ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={(isPending && rejectingId === d.id) || isBulkRejecting}
                            onClick={() => handleReject(d.id)}
                            className="h-8 text-xs text-ink-soft hover:text-terra hover:bg-terra/5 cursor-pointer"
                          >
                            <Trash2 className="size-3.5 mr-1" />
                            Batalkan
                          </Button>
                          <Link href={`/jurnal/ai/${d.id}`}>
                            <Button
                              size="sm"
                              className="h-8 bg-terra text-white hover:bg-terra/90 text-xs px-3 shadow-2xs cursor-pointer gap-1.5"
                            >
                              <IconReview className="size-3.5" />
                              <span>Tinjau & Posting</span>
                              <ArrowRight className="size-3.5 ml-0.5" />
                            </Button>
                          </Link>
                        </>
                      ) : d.status === "ACCEPTED" && d.postedEntryId ? (
                        <Link href={`/jurnal/${d.postedEntryId}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs px-3 border-rule hover:border-terra/40 cursor-pointer"
                          >
                            Lihat Jurnal {d.entryNumber ? `(${d.entryNumber})` : ""}
                            <ArrowRight className="size-3.5 ml-1" />
                          </Button>
                        </Link>
                      ) : (
                        <span className="text-xs text-ink-soft">Draf dibatalkan</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop & Tablet Table (>= sm) */}
            <div className="hidden sm:block">
              <GlowCard>
                <div className="overflow-x-auto rounded-xl border border-rule bg-paper shadow-xs">
                  <table className="w-full tnum text-sm">
                    <thead>
                      <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        <th className="w-10 px-3 py-3 text-center">
                          {pendingDrafts.length > 0 && (
                            <Checkbox
                              checked={isAllPendingSelected}
                              onCheckedChange={handleToggleSelectAll}
                              aria-label="Pilih semua draf yang menunggu review"
                              className="cursor-pointer"
                            />
                          )}
                        </th>
                        <th className="px-4 py-3">Tanggal &amp; Sumber</th>
                        <th className="px-4 py-3">Keterangan / Memo</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Debit</th>
                        <th className="px-4 py-3 text-right">Kredit</th>
                        <th className="px-4 py-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule/60">
                      {drafts.map((d) => {
                        const summary = parseDraftSummary(d.draft);
                        const dateStr = new Date(d.createdAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        });
                        const isDoctor = summary.isDoctor || d.model === "doctor-sak";
                        const memoDisplay = summary.memo || d.inputText || "Draf Transaksi Jurnal";
                        const isExpanded = expandedId === d.id;
                        const isSelected = selectedIds.includes(d.id);

                        return (
                          <Fragment key={d.id}>
                            <tr
                              className={cn(
                                "transition-colors group",
                                isSelected ? "bg-terra/5" : "hover:bg-canvas/30",
                              )}
                            >
                              {/* Selection Checkbox */}
                              <td className="px-3 py-3 align-top text-center">
                                {d.status === "PENDING" ? (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggleSelect(d.id)}
                                    aria-label={`Pilih draf ${d.id}`}
                                    className="cursor-pointer mt-0.5"
                                  />
                                ) : (
                                  <span className="inline-block size-4" />
                                )}
                              </td>

                              {/* Tanggal & Sumber */}
                              <td className="px-4 py-3 align-top whitespace-nowrap">
                                <div className="space-y-1">
                                  <div className="text-xs font-medium text-ink">{dateStr}</div>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                      isDoctor
                                        ? "bg-terra/10 text-terra border-terra/20"
                                        : d.kind === "DOCUMENT"
                                        ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"
                                        : "bg-canvas text-ink-soft border-rule",
                                    )}
                                  >
                                    {isDoctor ? (
                                      <Sparkles className="size-2.5" />
                                    ) : (
                                      <FileText className="size-2.5" />
                                    )}
                                    {isDoctor ? "Pemeriksa Jurnal" : d.kind === "DOCUMENT" ? "Faktur" : "Asisten"}
                                  </span>
                                </div>
                              </td>

                              {/* Keterangan / Memo */}
                              <td className="px-4 py-3 align-top max-w-xs md:max-w-sm">
                                <div className="space-y-1">
                                  <p className="font-medium text-ink line-clamp-2" title={memoDisplay}>
                                    {memoDisplay}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-ink-soft">
                                    <span>{summary.lineCount} baris akun</span>
                                    {summary.lines.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpand(d.id)}
                                        className="inline-flex items-center gap-0.5 text-terra hover:underline cursor-pointer font-medium text-[11px]"
                                      >
                                        {isExpanded ? (
                                          <>
                                            <ChevronUp className="size-3" /> Tutup Rincian
                                          </>
                                        ) : (
                                          <>
                                            <ChevronDown className="size-3" /> Rincian Akun
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3 align-top text-center whitespace-nowrap">
                                {d.status === "ACCEPTED" ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-debit/30 bg-debit/10 px-2.5 py-0.5 text-[11px] font-semibold text-debit">
                                    <CheckCircle2 className="size-3" />
                                    Diposting
                                  </span>
                                ) : d.status === "REJECTED" ? (
                                  <span className="inline-flex items-center rounded-full border border-rule bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
                                    Dibatalkan
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-terra/30 bg-terra/10 px-2.5 py-0.5 text-[11px] font-semibold text-terra">
                                    <Clock className="size-3" />
                                    Menunggu Review
                                  </span>
                                )}
                              </td>

                              {/* Debit */}
                              <td className="px-4 py-3 align-top text-right font-mono font-medium text-ink whitespace-nowrap">
                                {summary.totalDebit > 0n ? (
                                  Money.fromMinor(summary.totalDebit).formatIdr()
                                ) : (
                                  <span className="text-ink-soft/40">—</span>
                                )}
                              </td>

                              {/* Kredit */}
                              <td className="px-4 py-3 align-top text-right font-mono font-medium text-ink whitespace-nowrap">
                                {summary.totalCredit > 0n ? (
                                  Money.fromMinor(summary.totalCredit).formatIdr()
                                ) : (
                                  <span className="text-ink-soft/40">—</span>
                                )}
                              </td>

                              {/* Aksi */}
                              <td className="px-4 py-3 align-top text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5">
                                  {d.status === "PENDING" ? (
                                    <>
                                      <Link href={`/jurnal/ai/${d.id}`}>
                                        <Button
                                          size="sm"
                                          className="h-7 bg-terra text-white hover:bg-terra/90 text-xs px-2.5 shadow-2xs cursor-pointer gap-1"
                                        >
                                          <IconReview className="size-3" />
                                          <span>Tinjau</span>
                                          <ArrowRight className="size-3 ml-0.5" />
                                        </Button>
                                      </Link>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={(isPending && rejectingId === d.id) || isBulkRejecting}
                                        onClick={() => handleReject(d.id)}
                                        className="h-7 w-7 p-0 text-ink-soft hover:text-terra hover:bg-terra/5 cursor-pointer"
                                        title="Batalkan draf"
                                      >
                                        <Trash2 className="size-3.5" />
                                      </Button>
                                    </>
                                  ) : d.status === "ACCEPTED" && d.postedEntryId ? (
                                    <Link href={`/jurnal/${d.postedEntryId}`}>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs px-2.5 border-rule hover:border-terra/40 cursor-pointer"
                                      >
                                        Lihat {d.entryNumber ? `${d.entryNumber}` : "Jurnal"}
                                        <ArrowRight className="size-3 ml-1" />
                                      </Button>
                                    </Link>
                                  ) : (
                                    <span className="text-xs text-ink-soft/60">—</span>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Sub-rows for expanded account breakdown */}
                            {isExpanded && summary.lines.length > 0 && (
                              <tr className="bg-canvas/40 border-b border-rule/40">
                                <td colSpan={7} className="px-6 py-3">
                                  <div className="space-y-1.5 rounded-lg border border-rule/60 bg-paper/80 p-3 shadow-2xs">
                                    <div className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider mb-1">
                                      Rincian Akun yang Diusulkan:
                                    </div>
                                    <div className="divide-y divide-rule/40 text-xs">
                                      {summary.lines.map((line, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 py-1.5 items-center">
                                          <div className="col-span-3 font-mono font-medium text-ink">
                                            {line.accountCode}
                                          </div>
                                          <div className="col-span-4 text-ink-soft truncate">
                                            {line.accountName || line.memo || "—"}
                                          </div>
                                          <div className="col-span-2 text-right font-mono">
                                            {line.debitMinor > 0n ? (
                                              <span className="text-debit font-medium">
                                                {Money.fromMinor(line.debitMinor).formatIdr()}
                                              </span>
                                            ) : (
                                              <span className="text-ink-soft/30">—</span>
                                            )}
                                          </div>
                                          <div className="col-span-2 text-right font-mono">
                                            {line.creditMinor > 0n ? (
                                              <span className="text-credit font-medium">
                                                {Money.fromMinor(line.creditMinor).formatIdr()}
                                              </span>
                                            ) : (
                                              <span className="text-ink-soft/30">—</span>
                                            )}
                                          </div>
                                          <div className="col-span-1"></div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlowCard>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-ink-soft">
              <div>
                Menampilkan <span className="font-mono font-semibold text-ink">{from}</span>–
                <span className="font-mono font-semibold text-ink">{to}</span> dari{" "}
                <span className="font-mono font-semibold text-ink">{total}</span> draf
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => router.push(makeUrl({ page: page - 1 }))}
                    className="h-8 px-2.5 border-rule text-xs cursor-pointer disabled:pointer-events-none"
                  >
                    <ChevronLeft className="size-3.5 mr-1" />
                    Sebelumnya
                  </Button>

                  <div className="flex items-center gap-1 mx-1">
                    {pageTrail.map((p, idx) =>
                      p === "…" ? (
                        <span key={`ellipsis-${idx}`} className="px-1 text-ink-soft select-none">
                          …
                        </span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => router.push(makeUrl({ page: p }))}
                          className={cn(
                            "size-8 p-0 text-xs font-mono cursor-pointer",
                            p === page
                              ? "bg-terra text-white hover:bg-terra/90 border-transparent font-bold"
                              : "border-rule text-ink hover:border-terra/40",
                          )}
                        >
                          {p}
                        </Button>
                      ),
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => router.push(makeUrl({ page: page + 1 }))}
                    className="h-8 px-2.5 border-rule text-xs cursor-pointer disabled:pointer-events-none"
                  >
                    Berikutnya
                    <ChevronRight className="size-3.5 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      )}
    </div>
  );
}
