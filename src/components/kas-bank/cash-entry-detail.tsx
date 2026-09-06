"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { postCashDraftAction } from "@/server/actions/cash-bank.actions";
import type {
  CashEntryDetail,
} from "@/server/db/repos/cash-bank.repo";
import type { EntryView } from "@/server/db/repos/journals.repo";
import type { CashKind } from "@/server/db/schema/cash-bank";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
} from "lucide-react";

const KIND_META: Record<
  CashKind,
  {
    title: string;
    listHref: string;
    listLabel: string;
    icon: typeof ArrowUpRight;
    flow: (d: CashEntryDetail) => string;
  }
> = {
  BAYAR: {
    title: "Pembayaran",
    listHref: "/kas-bank/pembayaran",
    listLabel: "Pembayaran",
    icon: ArrowUpRight,
    flow: (d) =>
      `Keluar dari ${d.cashCode} ${d.cashName} untuk ${d.counterCode} ${d.counterName}`,
  },
  TERIMA: {
    title: "Penerimaan",
    listHref: "/kas-bank/penerimaan",
    listLabel: "Penerimaan",
    icon: ArrowDownLeft,
    flow: (d) =>
      `Masuk ke ${d.cashCode} ${d.cashName} dari ${d.counterCode} ${d.counterName}`,
  },
  TRANSFER: {
    title: "Transfer",
    listHref: "/kas-bank/transfer",
    listLabel: "Transfer Bank",
    icon: ArrowLeftRight,
    flow: (d) =>
      `Pindah dari ${d.cashCode} ${d.cashName} ke ${d.counterCode} ${d.counterName}`,
  },
};

export function CashEntryDetail({
  detail,
  journal,
  docs,
}: {
  detail: CashEntryDetail;
  journal: EntryView | null;
  docs: Array<{ id: string; fileName: string | null; sizeBytes: number }>;
}) {
  const router = useRouter();
  const [posting, setPosting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const meta = KIND_META[detail.kind];
  const KindIcon = meta.icon;

  async function handlePost() {
    setPosting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", detail.id);
      const res = await postCashDraftAction(fd);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memposting draft.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href={meta.listHref}
        className="inline-flex items-center gap-1.5 text-xs text-ink-soft hover:text-terra transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        Kembali ke {meta.listLabel}
      </Link>

      <PageHeader
        title={detail.number}
        eyebrow={`${meta.title} · ${detail.entryDate}${detail.memo ? ` · ${detail.memo}` : ""}`}
        actions={
          <>
            {detail.status === "DRAFT" && (
              <Button
                type="button"
                size="sm"
                disabled={posting}
                onClick={handlePost}
                className="h-9 rounded-xl bg-terra px-3.5 text-xs font-medium text-white shadow-none transition-all hover:bg-terra/90 active:scale-[0.98]"
              >
                {posting ? (
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                ) : (
                  <BookOpen className="size-4 mr-1.5" />
                )}
                Posting Sekarang
              </Button>
            )}
            {detail.journalEntryId && (
              <Link href={`/jurnal/${detail.journalEntryId}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl border-rule bg-paper hover:bg-canvas text-ink text-xs font-medium"
                >
                  Lihat Jurnal
                </Button>
              </Link>
            )}
          </>
        }
      />

      {error && (
        <div
          role="alert"
          className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-xl bg-terra/10 text-terra"
            >
              <KindIcon className="size-5" />
            </span>
            {detail.status === "POSTED" ? (
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
                Draft — belum masuk buku besar
              </Badge>
            )}
            <p className="font-display text-2xl font-semibold text-ink tnum">
              {Money.formatIdr(detail.amountMinor)}
            </p>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex justify-between gap-4 border-b border-rule/60 py-1.5">
              <dt className="text-ink-soft">Arus dana</dt>
              <dd className="text-ink font-medium text-right">
                {meta.flow(detail)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-rule/60 py-1.5">
              <dt className="text-ink-soft">Tanggal</dt>
              <dd className="text-ink font-medium">{detail.entryDate}</dd>
            </div>
            {detail.contactName && (
              <div className="flex justify-between gap-4 border-b border-rule/60 py-1.5">
                <dt className="text-ink-soft">Kontak</dt>
                <dd className="text-ink font-medium">{detail.contactName}</dd>
              </div>
            )}
            {detail.memo && (
              <div className="flex justify-between gap-4 border-b border-rule/60 py-1.5">
                <dt className="text-ink-soft">Keterangan</dt>
                <dd className="text-ink font-medium text-right">
                  {detail.memo}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h2 className="font-display text-base font-semibold text-ink">
              Lampiran
            </h2>
            <p className="text-xs text-ink-soft">
              Bukti yang diunggah saat pencatatan.
            </p>
          </div>
          <ul className="divide-y divide-rule px-5 pb-4">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-2.5 py-2 text-xs"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-terra/10 text-terra">
                  <FileText className="size-3.5" />
                </div>
                <span className="truncate font-medium text-ink">
                  {d.fileName ?? "Lampiran"}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-soft tnum">
                  {(d.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {journal && (
        <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
          <div className="px-5 pt-4 pb-1">
            <h2 className="font-display text-base font-semibold text-ink">
              Jurnal {journal.number}
            </h2>
            <p className="text-xs text-ink-soft">
              Seimbang otomatis — total debit sama dengan total kredit.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tnum">
              <thead className="border-b border-rule bg-canvas/50 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-4 py-3">Akun</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {journal.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 text-ink font-medium">
                      {l.accountCode} {l.accountName}
                    </td>
                    <td className="px-4 py-3 text-right text-debit font-medium whitespace-nowrap">
                      {l.debitMinor > 0n ? Money.formatIdr(l.debitMinor) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-ink whitespace-nowrap">
                      {l.creditMinor > 0n
                        ? Money.formatIdr(l.creditMinor)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
