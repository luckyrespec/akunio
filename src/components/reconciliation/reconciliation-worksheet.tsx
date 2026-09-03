"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, CheckCircle2, AlertCircle, Link as LinkIcon, Unlink, Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import {
  runAutoMatchAction,
  confirmMatchAction,
  unlinkMatchAction,
  createQuickAdjustmentAction,
  finalizeReconciliationAction,
} from "@/server/actions/reconciliation.actions";
import { useRouter } from "next/navigation";
import type { StatementLineType, MatchStatus } from "@/server/db/schema/reconciliation";

export interface StatementLineItem {
  id: string;
  transactionDate: string;
  description: string;
  type: StatementLineType;
  amountMinor: bigint;
  referenceNumber?: string | null;
  matchStatus: MatchStatus;
  matchedJournalLineId?: string | null;
  confidenceScore?: number | null;
  aiNotes?: string | null;
}

export interface UnmatchedLedgerItem {
  id: string;
  entryId: string;
  date: string;
  number: string;
  memo: string;
  debitMinor: bigint;
  creditMinor: bigint;
}

interface ReconciliationWorksheetProps {
  session: {
    id: string;
    bankAccountCode: string;
    bankAccountName: string;
    statementDate: string;
    statementBalanceMinor: bigint;
    ledgerBalanceMinor: bigint;
    differenceMinor: bigint;
    status: "IN_PROGRESS" | "COMPLETED";
    notes?: string | null;
  };
  statementLines: StatementLineItem[];
  unmatchedLedgerLines: UnmatchedLedgerItem[];
}

export function ReconciliationWorksheet({
  session,
  statementLines,
  unmatchedLedgerLines,
}: ReconciliationWorksheetProps) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<"ALL" | "UNMATCHED" | "SUGGESTIONS" | "MATCHED">("ALL");
  const [selectedStatementId, setSelectedStatementId] = React.useState<string | null>(null);
  const [selectedLedgerId, setSelectedLedgerId] = React.useState<string | null>(null);
  const [loadingAutoMatch, setLoadingAutoMatch] = React.useState(false);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);
  const [finalizing, setFinalizing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Compute live matched amounts
  const matchedStatementTotal = React.useMemo(() => {
    return statementLines
      .filter((l) => l.matchStatus === "MATCHED")
      .reduce((sum, l) => (l.type === "CR" ? sum + l.amountMinor : sum - l.amountMinor), 0n);
  }, [statementLines]);

  const currentDifferenceMinor = session.statementBalanceMinor - (session.ledgerBalanceMinor + matchedStatementTotal);
  const isBalanced = currentDifferenceMinor === 0n;

  const filteredStatementLines = React.useMemo(() => {
    return statementLines.filter((l) => {
      if (filter === "ALL") return true;
      if (filter === "MATCHED") return l.matchStatus === "MATCHED";
      if (filter === "SUGGESTIONS") return l.matchStatus === "UNMATCHED" && l.matchedJournalLineId;
      if (filter === "UNMATCHED") return l.matchStatus === "UNMATCHED" && !l.matchedJournalLineId;
      return true;
    });
  }, [statementLines, filter]);

  async function handleAutoMatch() {
    setLoadingAutoMatch(true);
    setError(null);
    try {
      const res = await runAutoMatchAction(session.id);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menjalankan auto-match.");
    } finally {
      setLoadingAutoMatch(false);
    }
  }

  async function handleConfirmMatch(statementId: string, journalId: string) {
    setActionLoadingId(statementId);
    setError(null);
    try {
      const res = await confirmMatchAction(statementId, journalId);
      if (!res.ok) throw new Error(res.error);
      setSelectedStatementId(null);
      setSelectedLedgerId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencocokkan baris.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleUnlinkMatch(statementId: string) {
    setActionLoadingId(statementId);
    setError(null);
    try {
      const res = await unlinkMatchAction(statementId);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan match.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleQuickAdjustment(statementId: string, kind: "FEE" | "INTEREST") {
    setActionLoadingId(statementId);
    setError(null);
    try {
      const res = await createQuickAdjustmentAction(statementId, kind);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat jurnal.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleFinalize() {
    if (!confirm("Apakah Anda yakin ingin mengunci dan menyelesaikan sesi rekonsiliasi ini?")) {
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      const res = await finalizeReconciliationAction(session.id);
      if (!res.ok) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyelesaikan rekonsiliasi.");
    } finally {
      setFinalizing(false);
    }
  }

  const isCompleted = session.status === "COMPLETED";

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/rekonsiliasi"
            className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink transition-colors mb-2"
          >
            <ArrowLeft className="size-3.5" />
            <span>Kembali ke Dasbor Rekonsiliasi</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-display font-semibold text-ink">
              Rekonsiliasi {session.bankAccountCode} - {session.bankAccountName}
            </h1>
            {isCompleted ? (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-50/50 text-[11px]">
                <CheckCircle2 className="size-3 mr-1" />
                Selesai / Terkunci
              </Badge>
            ) : (
              <Badge variant="outline" className="border-blue-500/30 text-blue-700 bg-blue-50/50 text-[11px]">
                Sedang Berlangsung
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-soft mt-0.5">
            Periode cut-off: <span className="font-semibold text-ink">{session.statementDate}</span>
          </p>
        </div>

        {!isCompleted && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingAutoMatch}
              onClick={handleAutoMatch}
              className="text-xs border-rule text-ink bg-paper"
            >
              {loadingAutoMatch ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="size-3.5 mr-1.5 text-terra" />
              )}
              Auto-Match (AI)
            </Button>

            <Button
              size="sm"
              disabled={finalizing}
              onClick={handleFinalize}
              className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {finalizing && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              <Check className="size-3.5 mr-1.5" />
              Kunci & Selesaikan
            </Button>
          </div>
        )}
      </div>

      {/* Sticky Balance Comparison Bar */}
      <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center divide-y sm:divide-y-0 sm:divide-x divide-rule">
          <div>
            <span className="text-[11px] font-medium text-ink-soft block uppercase tracking-wider">
              Saldo Rekening Koran
            </span>
            <div className="text-lg font-display font-semibold text-ink mt-1">
              {Money.fromMinor(session.statementBalanceMinor).formatIdr()}
            </div>
          </div>

          <div className="pt-2 sm:pt-0">
            <span className="text-[11px] font-medium text-ink-soft block uppercase tracking-wider">
              Saldo Buku Kas Neraca
            </span>
            <div className="text-lg font-display font-semibold text-ink mt-1">
              {Money.fromMinor(session.ledgerBalanceMinor + matchedStatementTotal).formatIdr()}
            </div>
          </div>

          <div className="pt-2 sm:pt-0">
            <span className="text-[11px] font-medium text-ink-soft block uppercase tracking-wider">
              Selisih Rekonsiliasi
            </span>
            <div className={`text-lg font-display font-semibold mt-1 ${isBalanced ? "text-emerald-700" : "text-destructive"}`}>
              {Money.fromMinor(currentDifferenceMinor).formatIdr()}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Manual Link Action Bar if items selected */}
      {selectedStatementId && selectedLedgerId && !isCompleted && (
        <div className="rounded-xl border border-terra/40 bg-terra/10 p-3 flex items-center justify-between animate-in fade-in">
          <span className="text-xs font-semibold text-terra">
            1 baris mutasi bank dan 1 baris buku kas telah dipilih.
          </span>
          <Button
            size="sm"
            onClick={() => handleConfirmMatch(selectedStatementId, selectedLedgerId)}
            className="text-xs bg-terra hover:bg-terra/90 text-white h-8"
          >
            <LinkIcon className="size-3.5 mr-1" />
            Hubungkan Transaksi Ini
          </Button>
        </div>
      )}

      {/* Side-by-Side Dual Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Pane: Bank Statement Lines */}
        <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden flex flex-col h-[650px]">
          <div className="p-3 border-b border-rule bg-canvas/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">
              Mutasi Rekening Koran ({statementLines.length})
            </span>
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setFilter("ALL")}
                className={`px-2 py-0.5 rounded font-medium ${filter === "ALL" ? "bg-paper text-ink shadow-2xs" : "text-ink-soft"}`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setFilter("UNMATCHED")}
                className={`px-2 py-0.5 rounded font-medium ${filter === "UNMATCHED" ? "bg-paper text-ink shadow-2xs" : "text-ink-soft"}`}
              >
                Belum Cocok
              </button>
              <button
                type="button"
                onClick={() => setFilter("SUGGESTIONS")}
                className={`px-2 py-0.5 rounded font-medium ${filter === "SUGGESTIONS" ? "bg-paper text-ink shadow-2xs" : "text-ink-soft"}`}
              >
                Saran AI
              </button>
              <button
                type="button"
                onClick={() => setFilter("MATCHED")}
                className={`px-2 py-0.5 rounded font-medium ${filter === "MATCHED" ? "bg-paper text-ink shadow-2xs" : "text-ink-soft"}`}
              >
                Cocok
              </button>
            </div>
          </div>

          <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
            {filteredStatementLines.length === 0 ? (
              <div className="p-12 text-center text-xs text-ink-soft">
                Tidak ada mutasi bank pada filter ini.
              </div>
            ) : (
              filteredStatementLines.map((l) => {
                const isSelected = selectedStatementId === l.id;
                const isMatched = l.matchStatus === "MATCHED";
                const hasSuggestion = !isMatched && Boolean(l.matchedJournalLineId);

                return (
                  <div
                    key={l.id}
                    onClick={() => !isCompleted && !isMatched && setSelectedStatementId(isSelected ? null : l.id)}
                    className={`rounded-lg border p-3 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "border-terra bg-terra/5 shadow-2xs"
                        : isMatched
                        ? "border-emerald-600/30 bg-emerald-50/20"
                        : "border-rule/70 bg-canvas/30 hover:border-rule"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ink-soft text-[11px]">{l.transactionDate}</span>
                          {isMatched && (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-50/50 text-[10px]">
                              Cocok
                            </Badge>
                          )}
                          {hasSuggestion && (
                            <Badge variant="outline" className="border-terra/40 text-terra bg-terra/10 text-[10px]">
                              Saran AI ({l.confidenceScore}%)
                            </Badge>
                          )}
                        </div>
                        <div className="font-medium text-ink leading-snug">{l.description}</div>
                        {l.aiNotes && (
                          <div className="text-[11px] text-terra/90 flex items-center gap-1">
                            <Sparkles className="size-3" />
                            <span>{l.aiNotes}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-mono font-semibold block ${
                            l.type === "CR" ? "text-emerald-700" : "text-destructive"
                          }`}
                        >
                          {l.type === "CR" ? "+" : "-"}
                          {Money.fromMinor(l.amountMinor).formatIdr()}
                        </span>
                        <span className="text-[10px] text-ink-soft">{l.type === "CR" ? "Uang Masuk" : "Uang Keluar"}</span>
                      </div>
                    </div>

                    {/* Action Bar inside card */}
                    {!isCompleted && (
                      <div className="mt-2 pt-2 border-t border-rule/50 flex items-center justify-end gap-1">
                        {hasSuggestion && l.matchedJournalLineId && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionLoadingId === l.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirmMatch(l.id, l.matchedJournalLineId!);
                            }}
                            className="h-6 text-[10px] border-terra/40 text-terra hover:bg-terra/10"
                          >
                            Setujui Saran AI
                          </Button>
                        )}

                        {!isMatched && l.type === "DB" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoadingId === l.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAdjustment(l.id, "FEE");
                            }}
                            className="h-6 text-[10px] text-ink-soft hover:text-ink"
                          >
                            + Beban Admin
                          </Button>
                        )}

                        {!isMatched && l.type === "CR" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoadingId === l.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAdjustment(l.id, "INTEREST");
                            }}
                            className="h-6 text-[10px] text-ink-soft hover:text-ink"
                          >
                            + Pendapatan Bunga
                          </Button>
                        )}

                        {isMatched && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoadingId === l.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnlinkMatch(l.id);
                            }}
                            className="h-6 text-[10px] text-ink-soft hover:text-destructive"
                          >
                            <Unlink className="size-3 mr-1" />
                            Lepas Tautan
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Ledger Cash/Bank Entries */}
        <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden flex flex-col h-[650px]">
          <div className="p-3 border-b border-rule bg-canvas/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">
              Buku Kas/Bank di Neraca ({unmatchedLedgerLines.length} transaksi belum cocok)
            </span>
          </div>

          <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
            {unmatchedLedgerLines.length === 0 ? (
              <div className="p-12 text-center text-xs text-ink-soft">
                Seluruh transaksi buku kas/bank telah direkonsiliasi.
              </div>
            ) : (
              unmatchedLedgerLines.map((j) => {
                const isSelected = selectedLedgerId === j.id;
                const isDebit = j.debitMinor > 0n;

                return (
                  <div
                    key={j.id}
                    onClick={() => !isCompleted && setSelectedLedgerId(isSelected ? null : j.id)}
                    className={`rounded-lg border p-3 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "border-terra bg-terra/5 shadow-2xs"
                        : "border-rule/70 bg-canvas/30 hover:border-rule"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-ink-soft text-[11px]">{j.date}</span>
                          <span className="font-mono text-terra text-[11px]">#{j.number}</span>
                        </div>
                        <div className="font-medium text-ink leading-snug">{j.memo}</div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-mono font-semibold block ${
                            isDebit ? "text-emerald-700" : "text-destructive"
                          }`}
                        >
                          {isDebit ? "+" : "-"}
                          {Money.fromMinor(isDebit ? j.debitMinor : j.creditMinor).formatIdr()}
                        </span>
                        <span className="text-[10px] text-ink-soft">{isDebit ? "Debet (Masuk)" : "Kredit (Keluar)"}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
