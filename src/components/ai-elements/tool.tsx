"use client";

import * as React from "react";
import {
  ChevronDown,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied"
  | "running"
  | "completed"
  | "error"
  | "pending"
  | "awaiting-approval";

interface ToolContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  state?: ToolState;
}

const ToolContext = React.createContext<ToolContextValue>({
  isOpen: false,
  setIsOpen: () => {},
});

export interface ToolProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  state?: ToolState;
}

export function Tool({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  state = "completed",
  className,
  children,
  ...props
}: ToolProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const setIsOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  return (
    <ToolContext.Provider value={{ isOpen, setIsOpen, state }}>
      <div
        className={cn(
          "my-2 rounded-2xl border border-rule bg-canvas/60 text-ink overflow-hidden transition-colors shadow-2xs",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </ToolContext.Provider>
  );
}

export interface ToolHeaderProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  title?: string;
  type?: string;
  state?: ToolState;
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  post_journal: "Pencatatan Jurnal Resmi",
  create_journal_draft: "Draf Jurnal Transaksi",
  reverse_journal: "Pembalik Jurnal (Reversal)",
  search_journals: "Pencarian Jurnal",
  list_journals: "Daftar Jurnal",
  create_invoice: "Pembuatan Faktur / Tagihan",
  record_invoice_payment: "Pencatatan Pelunasan Faktur",
  post_invoice_to_journal: "Posting Faktur ke Jurnal",
  get_ar_ap_aging: "Analisis Umur Piutang dan Utang",
  get_bank_reconciliation_status: "Status Rekonsiliasi Bank",
  auto_match_bank_reconciliation: "Pencocokan Mutasi Bank",
  get_daily_briefing: "Ringkasan Briefing Harian",
  get_report: "Laporan Keuangan",
  list_accounts: "Daftar Akun (COA)",
  drilldown_account_details: "Rincian Buku Besar Akun",
  check_accounting_health: "Diagnosa Kesehatan Pembukuan",
};

export function ToolHeader({
  title,
  type,
  state: propState,
  className,
  children,
  ...props
}: ToolHeaderProps) {
  const { isOpen, setIsOpen, state: contextState } = React.useContext(ToolContext);
  const state = propState ?? contextState ?? "completed";

  const rawName = title || type?.replace(/^tool-/, "") || "tool";
  const displayName = TOOL_DISPLAY_NAMES[rawName] || rawName.replace(/_/g, " ");

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left text-xs transition-colors hover:bg-paper/80 select-none",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-paper border border-rule text-terra">
          <Wrench className="size-3.5" />
        </div>
        <div className="flex items-center gap-2 truncate font-medium text-ink">
          <span className="truncate">{displayName}</span>
          <span className="font-mono text-[10px] text-ink-soft hidden sm:inline opacity-70">
            ({rawName})
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {getStatusBadge(state)}
        <ChevronDown
          className={cn(
            "size-3.5 text-ink-soft transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </div>
    </button>
  );
}

export function ToolContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { isOpen } = React.useContext(ToolContext);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "border-t border-rule/70 bg-paper/60 px-3.5 py-3 text-xs space-y-2.5 animate-in fade-in-50 duration-150",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ToolInput({
  input,
  className,
  ...props
}: { input?: unknown } & React.HTMLAttributes<HTMLDivElement>) {
  if (!input || (typeof input === "object" && Object.keys(input as object).length === 0)) {
    return null;
  }

  return (
    <div className={cn("space-y-1", className)} {...props}>
      <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
        Parameter Input
      </span>
      <div className="rounded-xl border border-rule/70 bg-canvas/70 p-2.5 font-mono text-[11px] leading-relaxed text-ink overflow-x-auto">
        <pre className="whitespace-pre-wrap">{JSON.stringify(input, null, 2)}</pre>
      </div>
    </div>
  );
}

export interface ToolOutputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "output"> {
  output?: any;
  errorText?: string;
}

export function ToolOutput({
  output,
  errorText,
  className,
  ...props
}: ToolOutputProps) {
  if (!output && !errorText) return null;

  return (
    <div className={cn("space-y-1 pt-1", className)} {...props}>
      <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
        {errorText ? "Error Eksekusi" : "Hasil Output"}
      </span>
      {errorText ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300">
          {errorText}
        </div>
      ) : React.isValidElement(output) ? (
        (output as React.ReactNode)
      ) : (
        <div className="rounded-xl border border-rule/70 bg-canvas/70 p-2.5 font-mono text-[11px] leading-relaxed text-ink overflow-x-auto">
          <pre className="whitespace-pre-wrap">
            {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function getStatusBadge(state: ToolState) {
  switch (state) {
    case "input-streaming":
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          <Clock className="size-2.5" />
          <span>Menyiapkan</span>
        </span>
      );

    case "input-available":
    case "running":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-600/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
          <Loader2 className="size-2.5 animate-spin" />
          <span>Memproses</span>
        </span>
      );

    case "approval-requested":
    case "awaiting-approval":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
          <ShieldAlert className="size-2.5 text-terra" />
          <span>Perlu Izin</span>
        </span>
      );

    case "output-error":
    case "error":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-600/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
          <AlertCircle className="size-2.5" />
          <span>Gagal</span>
        </span>
      );

    case "output-denied":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-stone-600/30 bg-stone-500/10 px-2 py-0.5 text-[10px] font-medium text-stone-700 dark:text-stone-400">
          <span>Ditolak</span>
        </span>
      );

    case "output-available":
    case "completed":
    case "approval-responded":
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-2.5" />
          <span>Selesai</span>
        </span>
      );
  }
}
