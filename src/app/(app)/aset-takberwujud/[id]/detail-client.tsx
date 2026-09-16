"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table/data-table-features";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/core/money/money";
import {
  disposeIntangibleAction,
  postIntangibleAmortizationAction,
} from "@/server/actions/intangible.actions";

export interface ScheduleRow {
  id: string;
  periodName: string;
  amortizationDate: string;
  amortizationAmountMinor: bigint;
  accumulatedMinor: bigint;
  bookValueMinor: bigint;
  status: string;
  journalEntryId: string | null;
}

export interface AccountOption {
  id: string;
  code: string;
  name: string;
}

const columns: ColumnDef<DataTableFeatures, ScheduleRow>[] = [
  {
    id: "periode",
    header: "Periode",
    cell: ({ row }) => (
      <span className="font-mono font-semibold">{row.original.periodName}</span>
    ),
  },
  {
    id: "tanggal",
    header: "Tanggal",
    cell: ({ row }) => (
      <span className="font-mono text-ink-soft">{row.original.amortizationDate}</span>
    ),
  },
  {
    id: "jumlah",
    header: "Jumlah",
    meta: { numeric: true },
    cell: ({ row }) => (
      <span className="font-mono tnum">{Money.formatIdr(row.original.amortizationAmountMinor)}</span>
    ),
  },
  {
    id: "akumulasi",
    header: "Akumulasi",
    meta: { numeric: true },
    cell: ({ row }) => (
      <span className="font-mono tnum">{Money.formatIdr(row.original.accumulatedMinor)}</span>
    ),
  },
  {
    id: "sisa",
    header: "Sisa",
    meta: { numeric: true },
    cell: ({ row }) => (
      <span className="font-mono tnum">{Money.formatIdr(row.original.bookValueMinor)}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.status === "POSTED" ? (
        <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-500/10">
          Terposting
        </Badge>
      ) : (
        <Badge variant="outline" className="border-rule text-ink-soft">
          Terjadwal
        </Badge>
      ),
  },
  {
    id: "jurnal",
    header: "Jurnal",
    cell: ({ row }) => {
      const jid = row.original.journalEntryId;
      return jid ? (
        <Link
          href={`/jurnal/${jid}`}
          className="focus-ring rounded-md font-medium text-terra hover:underline"
        >
          Lihat jurnal
        </Link>
      ) : (
        <span className="text-ink-soft">—</span>
      );
    },
  },
];

export function IntangibleDetailClient({
  assetId,
  lines,
  totals,
  depositAccounts,
  gainLossAccounts,
}: {
  assetId: string;
  lines: ScheduleRow[];
  totals: { totalMinor: bigint; accumulatedMinor: bigint; remainingMinor: bigint };
  depositAccounts: AccountOption[];
  gainLossAccounts: AccountOption[];
}) {
  const router = useRouter();
  const [posting, setPosting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const nextLine = lines.find((l) => l.status === "SCHEDULED");

  async function handlePost() {
    if (!nextLine) return;
    setPosting(true);
    setError(null);
    try {
      const res = await postIntangibleAmortizationAction({ periodName: nextLine.periodName });
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memposting amortisasi.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {nextLine && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handlePost}
            disabled={posting}
            className="h-9 rounded-xl bg-terra px-4 text-xs font-semibold text-white hover:bg-terra/90"
          >
            {posting ? (
              <Loader2 className="size-4 animate-spin mr-1.5" />
            ) : (
              <Play className="size-4 mr-1.5" />
            )}
            Posting {nextLine.periodName}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            className="h-9 rounded-xl border-rule text-xs"
          >
            Lepaskan Aset
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={lines}
        sorting={false}
        pagination={false}
        getRowId={(row) => row.id}
        getRowProps={(_, i) => ({
          className: "row-enter",
          style: { "--row-i": i } as CSSProperties,
        })}
        emptyText="Belum ada jadwal amortisasi."
        footer={
          <tr className="border-t border-rule rule-double bg-canvas/70 font-semibold">
            <td colSpan={2} className="px-4 py-3.5 text-right text-[11px] uppercase tracking-wider text-ink-soft">
              Total
            </td>
            <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totals.totalMinor)}</td>
            <td className="px-4 py-3.5 text-right font-mono tnum">{Money.formatIdr(totals.accumulatedMinor)}</td>
            <td className="px-4 py-3.5 text-right font-mono text-base font-bold text-ink tnum">
              {Money.formatIdr(totals.remainingMinor)}
            </td>
            <td colSpan={2} />
          </tr>
        }
      />

      <DisposalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assetId={assetId}
        depositAccounts={depositAccounts}
        gainLossAccounts={gainLossAccounts}
        onDone={() => {
          setDialogOpen(false);
          router.refresh();
        }}
        onError={setError}
      />
    </div>
  );
}

function DisposalDialog({
  open,
  onOpenChange,
  assetId,
  depositAccounts,
  gainLossAccounts,
  onDone,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  depositAccounts: AccountOption[];
  gainLossAccounts: AccountOption[];
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const [disposalDate, setDisposalDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [disposalType, setDisposalType] = React.useState<"SALE" | "SCRAP" | "WRITE_OFF">("SALE");
  const [proceedsText, setProceedsText] = React.useState("0");
  const [depositAccountId, setDepositAccountId] = React.useState(depositAccounts[0]?.id ?? "");
  const [gainLossAccountId, setGainLossAccountId] = React.useState(gainLossAccounts[0]?.id ?? "");
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      const res = await disposeIntangibleAction({
        assetId,
        disposalDate,
        disposalType,
        proceedsMinorText: proceedsText.replace(/[^\d]/g, "") || "0",
        depositAccountId: depositAccountId || undefined,
        gainLossAccountId,
        notes,
      });
      if (!res.ok) throw new Error(res.error);
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal melepas aset.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-rule bg-paper p-6">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Lepaskan Aset Takberwujud</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itb-dis-date">Tanggal Pelepasan</Label>
              <Input
                id="itb-dis-date"
                type="date"
                value={disposalDate}
                onChange={(e) => setDisposalDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itb-dis-type">Jenis</Label>
              <select
                id="itb-dis-type"
                value={disposalType}
                onChange={(e) => setDisposalType(e.target.value as typeof disposalType)}
                className="h-9 rounded-lg border border-rule bg-canvas px-3 text-xs text-ink"
              >
                <option value="SALE">Dijual</option>
                <option value="SCRAP">Dihapuskan</option>
                <option value="WRITE_OFF">Write-off</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itb-dis-proceeds">Hasil (Rp)</Label>
              <Input
                id="itb-dis-proceeds"
                value={proceedsText}
                onChange={(e) => setProceedsText(e.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itb-dis-deposit">Kas Penerima</Label>
              <select
                id="itb-dis-deposit"
                value={depositAccountId}
                onChange={(e) => setDepositAccountId(e.target.value)}
                className="h-9 rounded-lg border border-rule bg-canvas px-3 text-xs text-ink"
              >
                <option value="">—</option>
                {depositAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itb-dis-gl">Akun Laba/Rugi Pelepasan</Label>
            <select
              id="itb-dis-gl"
              value={gainLossAccountId}
              onChange={(e) => setGainLossAccountId(e.target.value)}
              className="h-9 rounded-lg border border-rule bg-canvas px-3 text-xs text-ink"
              required
            >
              {gainLossAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itb-dis-notes">Catatan (Opsional)</Label>
            <Textarea
              id="itb-dis-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-xl text-xs"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-9 rounded-xl bg-terra px-5 text-xs font-semibold text-white hover:bg-terra/90"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Lepaskan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
