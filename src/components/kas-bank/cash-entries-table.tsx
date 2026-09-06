"use client";

import * as React from "react";
import Link from "next/link";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { postCashDraftAction } from "@/server/actions/cash-bank.actions";
import type { CashEntryRow } from "@/server/db/repos/cash-bank.repo";
import type { CashKind } from "@/server/db/schema/cash-bank";
import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";

const KIND_COPY: Record<
  CashKind,
  { emptyTitle: string; emptyHint: string; icon: typeof ArrowUpRight }
> = {
  BAYAR: {
    emptyTitle: "Belum ada pengeluaran bulan ini",
    emptyHint:
      "Klik Tambah Pembayaran di atas. Contoh: bayar listrik Rp500.000 dari Kas.",
    icon: ArrowUpRight,
  },
  TERIMA: {
    emptyTitle: "Belum ada pemasukan bulan ini",
    emptyHint:
      "Klik Tambah Penerimaan di atas. Contoh: terima jasa Rp2.000.000 ke Bank.",
    icon: ArrowDownLeft,
  },
  TRANSFER: {
    emptyTitle: "Belum ada perpindahan dana",
    emptyHint:
      "Klik Tambah Transfer di atas. Contoh: setorkan Rp1.000.000 dari Kas ke Bank.",
    icon: ArrowLeftRight,
  },
};

export function CashEntriesTable({
  kind,
  entries,
  detailBasePath,
}: {
  kind: CashKind;
  entries: CashEntryRow[];
  detailBasePath: string;
}) {
  const [postingId, setPostingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const copy = KIND_COPY[kind];
  const EmptyIcon = copy.icon;

  async function handlePost(id: string) {
    setPostingId(id);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", id);
      const res = await postCashDraftAction(fd);
      if (!res.ok) throw new Error(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memposting draft.");
    } finally {
      setPostingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-12 text-center">
            <EmptyIcon className="size-8 mx-auto mb-3 text-ink-soft/40" />
            <p className="text-sm font-medium text-ink">{copy.emptyTitle}</p>
            <p className="mt-1 text-xs text-ink-soft max-w-md mx-auto">
              {copy.emptyHint}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tnum">
              <thead className="border-b border-rule bg-canvas/50 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Nomor Bukti</th>
                  <th className="px-4 py-3">Kas/Bank</th>
                  <th className="px-4 py-3">Lawan</th>
                  <th className="px-4 py-3 text-right">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    data-testid="kas-bank-row"
                    className="hover:bg-canvas/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-ink-soft whitespace-nowrap">
                      {e.entryDate}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <Link
                        href={`${detailBasePath}/${e.id}`}
                        className="text-terra hover:underline underline-offset-2"
                      >
                        {e.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink font-medium">
                      {e.cashCode} {e.cashName}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {e.counterCode} {e.counterName}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-ink whitespace-nowrap">
                      {Money.formatIdr(e.amountMinor)}
                    </td>
                    <td className="px-4 py-3">
                      {e.status === "POSTED" ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/30 text-emerald-700 bg-emerald-50/50 text-[11px]"
                        >
                          <CheckCircle2 className="size-3 mr-1" />
                          Tercatat
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 text-amber-700 bg-amber-50/50 text-[11px]"
                        >
                          <Clock className="size-3 mr-1" />
                          Draft
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {e.status === "DRAFT" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={postingId === e.id}
                            onClick={() => handlePost(e.id)}
                            className="h-7 text-[11px] border-rule text-ink-soft hover:text-ink"
                            title="Kunci dan catat ke buku besar"
                          >
                            {postingId === e.id ? (
                              <Loader2 className="size-3 animate-spin mr-1" />
                            ) : (
                              <BookOpen className="size-3 mr-1 text-terra" />
                            )}
                            Posting
                          </Button>
                        )}
                        {e.journalEntryId && (
                          <Link
                            href={`/jurnal/${e.journalEntryId}`}
                            className="text-[11px] text-terra hover:underline underline-offset-2 px-2 py-1"
                          >
                            Jurnal
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
