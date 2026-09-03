"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, ArrowLeftRight, CheckCircle2, Clock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { CreateSessionDialog, type BankAccountOption } from "./create-session-dialog";

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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-ink">Rekonsiliasi Bank</h1>
          <p className="text-xs text-ink-soft mt-1">
            Unggah rekening koran bank dan cocokkan mutasi kas/bank secara otomatis dengan AI.
          </p>
        </div>

        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-terra hover:bg-terra/90 text-white text-xs h-9"
        >
          <Plus className="size-4 mr-1.5" />
          Mulai Rekonsiliasi Baru
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Akun Bank Aktif</span>
            <ArrowLeftRight className="size-4 text-terra" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-ink">
            {bankAccounts.length} Akun
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Terdaftar pada bagan akun (COA)</div>
        </div>

        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Sesi Sedang Berlangsung</span>
            <Clock className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-blue-600">
            {inProgressCount} Sesi
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Perlu diselesaikan / dicocokkan</div>
        </div>

        <div className="rounded-xl border border-rule bg-paper p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-ink-soft">Sesi Selesai (Terkunci)</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-display font-semibold text-emerald-700">
            {completedCount} Sesi
          </div>
          <div className="mt-1 text-[11px] text-ink-soft">Rekonsiliasi seimbang dan diaudit</div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-rule flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Riwayat Sesi Rekonsiliasi Bank</h3>
            <p className="text-xs text-ink-soft">Daftar rekonsiliasi yang pernah dilakukan pada seluruh akun kas & bank</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-soft">
            <FileText className="size-8 mx-auto mb-2 text-ink-soft/40" />
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
            <table className="w-full text-left text-xs">
              <thead className="border-b border-rule bg-canvas/50 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Akun Bank</th>
                  <th className="px-4 py-3 font-medium">Tanggal Cut-Off</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo Rekening Koran</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo Buku Kas</th>
                  <th className="px-4 py-3 font-medium text-right">Selisih</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
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
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-50/50 text-[10px]">
                            <CheckCircle2 className="size-3 mr-1" />
                            Selesai
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-blue-500/30 text-blue-700 bg-blue-50/50 text-[10px]">
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
                        <Link href={`/rekonsiliasi/${s.id}`}>
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

      {/* Dialog */}
      <CreateSessionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bankAccounts={bankAccounts}
      />
    </div>
  );
}
