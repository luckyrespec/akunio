"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Plus, ArrowLeftRight, CheckCircle2, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { CreateSessionDialog, type BankAccountOption } from "./create-session-dialog";
import { PageHeader } from "@/components/page-header";
import { Reveal, AnimatedNumber } from "@/components/motion";

export interface ReconciliationSessionRow {
  id: string;
  bankAccountId: string;
  bankAccountCode: string;
  bankAccountName: string;
  statementDate: string;
  statementBalanceMinor: bigint;
  ledgerBalanceMinor: bigint;
  differenceMinor: bigint;
  status: "IN_PROGRESS" | "COMPLETED";
  createdAt: string | Date;
}

interface ReconciliationDashboardProps {
  sessions: ReconciliationSessionRow[];
  bankAccounts: BankAccountOption[];
}

export function ReconciliationDashboard({
  sessions,
  bankAccounts,
}: ReconciliationDashboardProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const completedCount = sessions.filter((s) => s.status === "COMPLETED").length;
  const inProgressCount = sessions.filter((s) => s.status === "IN_PROGRESS").length;

  // Sorotan: sesi berjalan terbaru, atau sesi terakhir bila semua sudah selesai.
  const spotlight =
    sessions.find((s) => s.status === "IN_PROGRESS") ?? sessions[0] ?? null;
  const spotlightBalanced = spotlight !== null && spotlight.differenceMinor === 0n;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Rekonsiliasi Bank"
        eyebrow="Unggah rekening koran bank dan cocokkan mutasi kas/bank secara otomatis dengan AI."
        actions={
          <Button
            onClick={() => setDialogOpen(true)}
            className="bg-terra hover:bg-terra/90 text-white text-xs h-9 rounded-xl shadow-2xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]"
          >
            <Plus className="size-4 mr-1.5" />
            Mulai Rekonsiliasi Baru
          </Button>
        }
      />

      {/* Sorotan sesi — koran vs buku vs selisih */}
      {spotlight ? (
        <div className="matte-card grid gap-6 rounded-2xl border border-rule bg-paper p-5 sm:p-6 lg:grid-cols-[1fr_1.2fr] lg:gap-10">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-soft">
              <ArrowLeftRight className="size-3.5" />
              {spotlight.status === "IN_PROGRESS" ? "Sesi Berjalan" : "Sesi Terakhir"}
            </p>
            <p className="mt-2 font-display text-xl font-semibold tracking-tight text-ink md:text-2xl">
              {spotlight.bankAccountName}
            </p>
            <p className="tnum mt-1 text-xs text-ink-soft">
              {spotlight.bankAccountCode} · cut-off {spotlight.statementDate}
              {inProgressCount > 1 && ` · +${inProgressCount - 1} sesi berjalan lain`}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href={`/kas-bank/rekonsiliasi/${spotlight.id}`}>
                <Button size="sm" className="h-8 bg-terra text-xs text-white hover:bg-terra/90">
                  {spotlight.status === "IN_PROGRESS" ? "Lanjutkan Worksheet" : "Buka Worksheet"}
                </Button>
              </Link>
              {spotlight.status === "COMPLETED" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                  Seimbang & terkunci
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 space-y-2 text-xs lg:border-l lg:border-rule/70 lg:pl-10">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">Saldo rekening koran</span>
              <span className="tnum font-mono font-medium text-ink">
                {Money.fromMinor(spotlight.statementBalanceMinor).formatIdr()}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">Saldo buku kas</span>
              <span className="tnum font-mono font-medium text-ink">
                {Money.fromMinor(spotlight.ledgerBalanceMinor).formatIdr()}
              </span>
            </div>
            <div className="rule-double flex items-baseline justify-between gap-3 pb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-ink-soft">
                Selisih
              </span>
              <span className={`tnum font-display text-xl font-semibold tracking-tight md:text-2xl ${spotlightBalanced ? "text-emerald-700" : "text-destructive"}`}>
                <AnimatedNumber minor={spotlight.differenceMinor} />
              </span>
            </div>
            <p className="text-[11px] text-ink-soft">
              {completedCount} sesi selesai · {inProgressCount} berjalan
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-rule bg-paper p-6 text-xs text-ink-soft sm:flex-row sm:items-center sm:justify-between">
          <span>Belum ada sesi — unggah rekening koran pertama untuk mulai mencocokkan.</span>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="h-8 bg-terra text-xs text-white hover:bg-terra/90"
          >
            <Plus className="size-3.5 mr-1.5" />
            Mulai Rekonsiliasi Pertama
          </Button>
        </div>
      )}

      {/* Sessions Table */}
      <Reveal delay={0.08}>
      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Riwayat Sesi Rekonsiliasi Bank</h3>
            <p className="text-xs text-ink-soft">Daftar rekonsiliasi yang pernah dilakukan pada seluruh akun kas & bank</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-soft">
            <motion.span
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="inline-block"
            >
              <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
            </motion.span>
            <p>Belum ada sesi rekonsiliasi bank yang dibuat.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="mt-3 text-xs border-rule text-ink"
            >
              Mulai Rekonsiliasi Pertama
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tnum">
              <thead className="border-b border-rule bg-canvas/50 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <tr>
                  <th className="px-4 py-3">Akun Bank</th>
                  <th className="px-4 py-3">Tanggal Cut-Off</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Saldo Rekening Koran</th>
                  <th className="px-4 py-3 text-right">Saldo Buku Kas</th>
                  <th className="px-4 py-3 text-right">Selisih</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {sessions.map((s) => {
                  const isBalanced = s.differenceMinor === 0n;
                  return (
                    <tr key={s.id} className="hover:bg-canvas/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-ink">
                        <div>{s.bankAccountName}</div>
                        <div className="text-[11px] font-mono text-ink-soft">{s.bankAccountCode}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-soft font-mono">{s.statementDate}</td>
                      <td className="px-4 py-3">
                        {s.status === "COMPLETED" ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-50/50 text-[11px]">
                            <CheckCircle2 className="size-3 mr-1" />
                            Selesai
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-blue-500/30 text-blue-700 bg-blue-50/50 dark:text-blue-300 dark:bg-blue-500/15 text-[11px]">
                            <Clock className="size-3 mr-1" />
                            Berlangsung
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-ink">
                        {Money.fromMinor(s.statementBalanceMinor).formatIdr()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-ink-soft">
                        {Money.fromMinor(s.ledgerBalanceMinor).formatIdr()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        <span className={isBalanced ? "text-emerald-700" : "text-destructive"}>
                          {Money.fromMinor(s.differenceMinor).formatIdr()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/kas-bank/rekonsiliasi/${s.id}`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-rule text-ink hover:text-terra"
                          >
                            Buka Worksheet
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </Reveal>

      {/* Dialog */}
      <CreateSessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}
