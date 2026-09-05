"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Lock,
  Unlock,
  Building2,
  Receipt,
  ArrowLeftRight,
  FileSpreadsheet,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  evaluatePeriodReadinessAction,
  executePeriodCloseAction,
  reopenPeriodAction,
} from "@/server/actions/periods.actions";
import { postMonthlyDepreciationAction } from "@/server/actions/assets.actions";
import type { PreClosingChecklistResult } from "@/core/periods/closing-checklist";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

export function TutupBukuClient({
  initialPeriods,
  accounts,
}: {
  initialPeriods: any[];
  accounts: AccountOption[];
}) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [selectedPeriodName, setSelectedPeriodName] = useState<string>(
    periods[0]?.name || new Date().toISOString().slice(0, 7),
  );

  const selectedPeriod = periods.find((p) => p.name === selectedPeriodName);
  const isYearEnd = selectedPeriodName.endsWith("-12");

  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [checklist, setChecklist] = useState<PreClosingChecklistResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<null | "close" | "reopen">(null);

  // Accounts for Year-end close
  const reAccounts = accounts.filter((a) => a.type === "EKUITAS" && a.code.startsWith("32"));
  const [retainedEarningsAccountId, setRetainedEarningsAccountId] = useState(
    reAccounts[0]?.id || accounts.find((a) => a.code === "3200")?.id || accounts[0]?.id || "",
  );

  // Auto-evaluate when selected period changes
  useEffect(() => {
    if (!selectedPeriodName) return;
    setEvaluating(true);
    setActionError(null);
    setActionSuccess(null);

    evaluatePeriodReadinessAction(selectedPeriodName)
      .then((res) => {
        if (res.ok && res.data) {
          setChecklist(res.data);
        } else {
          setActionError(res.error || "Gagal mengevaluasi kesiapan periode.");
        }
      })
      .catch((err) => setActionError(err.message))
      .finally(() => setEvaluating(false));
  }, [selectedPeriodName]);

  const handleQuickRunDepreciation = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await postMonthlyDepreciationAction(selectedPeriodName);
      if (res.ok) {
        setActionSuccess("Beban penyusutan berhasil diposting! Mengevaluasi ulang...");
        // Re-evaluate
        const evalRes = await evaluatePeriodReadinessAction(selectedPeriodName);
        if (evalRes.ok && evalRes.data) setChecklist(evalRes.data);
      } else {
        setActionError(res.error || "Gagal memposting penyusutan.");
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClosePeriod = async () => {
    setLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await executePeriodCloseAction({
        periodName: selectedPeriodName,
        isYearEnd,
        retainedEarningsAccountId: isYearEnd ? retainedEarningsAccountId : undefined,
      });

      if (res.ok) {
        setActionSuccess(
          `Periode ${selectedPeriodName} berhasil ditutup! ${
            res.data?.closingJournalId
              ? "Jurnal penutup laba/rugi ke Laba Ditahan telah dibuat."
              : ""
          }`,
        );
        // Update local periods status
        setPeriods((prev) =>
          prev.map((p) =>
            p.name === selectedPeriodName ? { ...p, status: "CLOSED" } : p,
          ),
        );
      } else {
        setActionError(res.error || "Gagal menutup buku.");
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReopenPeriod = async () => {
    if (!selectedPeriod) return;

    setLoading(true);
    setActionError(null);
    try {
      const res = await reopenPeriodAction(selectedPeriod.id);
      if (res.ok) {
        setActionSuccess(`Periode ${selectedPeriodName} berhasil dibuka kembali.`);
        setPeriods((prev) =>
          prev.map((p) =>
            p.name === selectedPeriodName ? { ...p, status: "OPEN" } : p,
          ),
        );
      } else {
        setActionError(res.error || "Gagal membuka kembali periode.");
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Tutup Buku Akuntansi"
        eyebrow="Panduan sistematis verifikasi pra-penutupan, penguncian periode transaksi, dan jurnal penutup akhir tahun."
        actions={
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-ink-soft">Pilih Periode:</span>
            <select
              value={selectedPeriodName}
              onChange={(e) => setSelectedPeriodName(e.target.value)}
              className="rounded-xl border border-rule bg-paper px-3 py-2 text-xs font-mono font-semibold text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} — {p.status === "OPEN" ? "Terbuka" : p.status === "CLOSED" ? "Terkunci (Closed)" : "Locked"}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Action Notification */}
      {actionError && (
        <div className="motion-keep-fade rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="motion-keep-fade rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5">
          <motion.span
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
            className="inline-flex shrink-0 mt-0.5"
          >
            <CheckCircle2 className="size-4" />
          </motion.span>
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Period Status Card */}
      <Reveal>
      <Card className="border-rule bg-paper shadow-xs">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  selectedPeriod?.status === "OPEN"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-600"
                }`}
              >
                {selectedPeriod?.status === "OPEN" ? (
                  <Unlock className="size-6" />
                ) : (
                  <Lock className="size-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg font-semibold text-ink tracking-tight">
                    Periode {selectedPeriodName}
                  </h3>
                  <Badge
                    variant="outline"
                    className={
                      selectedPeriod?.status === "OPEN"
                        ? "border-emerald-500/30 text-emerald-700 bg-emerald-500/10"
                        : "border-rose-500/30 text-rose-700 bg-rose-500/10"
                    }
                  >
                    {selectedPeriod?.status === "OPEN" ? "Status: TERBUKA" : "Status: TERKUNCI (CLOSED)"}
                  </Badge>
                  {isYearEnd && (
                    <Badge variant="outline" className="border-terra/40 text-terra bg-terra/10">
                      Penutupan Akhir Tahun (Desember)
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-ink-soft mt-0.5">
                  Rentang: {selectedPeriod?.startsOn} s/d {selectedPeriod?.endsOn}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {selectedPeriod?.status === "CLOSED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmKind("reopen")}
                  disabled={loading}
                  className="text-xs text-ink-soft hover:text-ink"
                >
                  {loading && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  Buka Kembali Periode (Owner)
                </Button>
              ) : (
                <Button
                  onClick={() => setConfirmKind("close")}
                  disabled={loading || evaluating || !checklist?.isReady}
                  className="bg-terra text-white hover:bg-terra/90 text-xs shadow-xs"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="size-3.5 mr-1.5" />
                  )}
                  {isYearEnd ? "Tutup Buku Akhir Tahun & Ekuitas" : "Kunci & Tutup Periode Ini"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </Reveal>

      {/* Stepper Wizard / Pre-closing Checklist */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-ink tracking-tight">
            Checklist Pra-Penutupan Buku
          </h2>
          <div className="flex items-center gap-2.5">
            {evaluating && (
              <span className="text-xs text-ink-soft flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Mengevaluasi kesiapan data...
              </span>
            )}
            {checklist && (
              <span className="flex items-center gap-2 text-[11px] font-semibold text-ink-soft">
                <span className="tnum">
                  {Object.values(checklist.items).filter((i) => i.passed).length} dari{" "}
                  {Object.values(checklist.items).length} siap
                </span>
                <span
                  className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10"
                  role="progressbar"
                  aria-label="Kesiapan penutupan"
                  aria-valuenow={Object.values(checklist.items).filter((i) => i.passed).length}
                  aria-valuemin={0}
                  aria-valuemax={Object.values(checklist.items).length}
                >
                  <span
                    className={`block h-full rounded-full ${checklist.isReady ? "bg-debit" : "bg-terra"}`}
                    style={{
                      width: `${(Object.values(checklist.items).filter((i) => i.passed).length / Object.values(checklist.items).length) * 100}%`,
                    }}
                  />
                </span>
              </span>
            )}
          </div>
        </div>

        {checklist ? (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Rekonsiliasi Bank */}
            <StaggerItem>
            <Card
              className={`border transition-colors ${
                checklist.items.bankReconciliation.passed
                  ? "border-rule bg-paper"
                  : "border-rose-500/40 bg-rose-500/5"
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <ArrowLeftRight
                      className={`size-5 mt-0.5 ${
                        checklist.items.bankReconciliation.passed
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    />
                    <div>
                      <h4 className="font-semibold text-xs text-ink">1. Rekonsiliasi Bank</h4>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {checklist.items.bankReconciliation.message}
                      </p>
                    </div>
                  </div>
                  {checklist.items.bankReconciliation.passed ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[11px]">
                      Selesai
                    </Badge>
                  ) : (
                    <Link href="/rekonsiliasi">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5">
                        Selesaikan
                        <ArrowRight className="size-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
            </StaggerItem>

            {/* 2. Draf Jurnal Belum Diposting */}
            <StaggerItem>
            <Card
              className={`border transition-colors ${
                checklist.items.pendingDrafts.passed
                  ? "border-rule bg-paper"
                  : "border-rose-500/40 bg-rose-500/5"
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Clock
                      className={`size-5 mt-0.5 ${
                        checklist.items.pendingDrafts.passed
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    />
                    <div>
                      <h4 className="font-semibold text-xs text-ink">2. Verifikasi Draf Transaksi</h4>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {checklist.items.pendingDrafts.message}
                      </p>
                    </div>
                  </div>
                  {checklist.items.pendingDrafts.passed ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[11px]">
                      Bersih
                    </Badge>
                  ) : (
                    <Link href="/asisten">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5">
                        Tinjau Draf
                        <ArrowRight className="size-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
            </StaggerItem>

            {/* 3. Penyusutan Aset Tetap */}
            <StaggerItem>
            <Card
              className={`border transition-colors ${
                checklist.items.depreciationPosted.passed
                  ? "border-rule bg-paper"
                  : "border-amber-500/40 bg-amber-500/5"
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Building2
                      className={`size-5 mt-0.5 ${
                        checklist.items.depreciationPosted.passed
                          ? "text-emerald-600"
                          : "text-amber-600"
                      }`}
                    />
                    <div>
                      <h4 className="font-semibold text-xs text-ink">3. Penyusutan Aset Tetap</h4>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {checklist.items.depreciationPosted.message}
                      </p>
                    </div>
                  </div>
                  {checklist.items.depreciationPosted.passed ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[11px]">
                      Terposting
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleQuickRunDepreciation}
                      disabled={loading}
                      className="h-7 text-[11px] px-2.5 bg-terra text-white hover:bg-terra/90"
                    >
                      {loading ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Posting Sekarang"
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            </StaggerItem>

            {/* 4. Faktur & Piutang / Hutang */}
            <StaggerItem>
            <Card
              className={`border transition-colors ${
                checklist.items.unpostedInvoices.passed
                  ? "border-rule bg-paper"
                  : "border-rose-500/40 bg-rose-500/5"
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Receipt
                      className={`size-5 mt-0.5 ${
                        checklist.items.unpostedInvoices.passed
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    />
                    <div>
                      <h4 className="font-semibold text-xs text-ink">4. Faktur Belum Terposting</h4>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {checklist.items.unpostedInvoices.message}
                      </p>
                    </div>
                  </div>
                  {checklist.items.unpostedInvoices.passed ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[11px]">
                      Lengkap
                    </Badge>
                  ) : (
                    <Link href="/faktur">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5">
                        Buka Faktur
                        <ArrowRight className="size-3 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
            </StaggerItem>

            {/* 5. Keseimbangan Neraca Saldo */}
            <StaggerItem className="md:col-span-2">
            <Card
              className={`border transition-colors ${
                checklist.items.trialBalance.passed
                  ? "border-rule bg-paper"
                  : "border-rose-500/40 bg-rose-500/5"
              }`}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet
                      className={`size-5 mt-0.5 ${
                        checklist.items.trialBalance.passed
                          ? "text-emerald-600"
                          : "text-rose-600"
                      }`}
                    />
                    <div>
                      <h4 className="font-semibold text-xs text-ink">5. Keseimbangan Neraca Saldo (Trial Balance)</h4>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {checklist.items.trialBalance.message}
                      </p>
                    </div>
                  </div>
                  {checklist.items.trialBalance.passed ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[11px]">
                      Klop (Rp 0)
                    </Badge>
                  ) : (
                    <Link href="/laporan">
                      <Button size="sm" variant="outline" className="h-7 text-[11px] px-2.5">
                        Cek Laporan
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
            </StaggerItem>
          </Stagger>
        ) : (
          <div className="rounded-xl border border-rule bg-paper p-8 text-center text-xs text-ink-soft">
            <Loader2 className="size-5 animate-spin mx-auto mb-2 text-terra" />
            Sedang memeriksa integritas data akuntansi periode {selectedPeriodName}...
          </div>
        )}
      </div>

      {/* Year-End Account Configuration if December */}
      {isYearEnd && selectedPeriod?.status === "OPEN" && (
        <Card className="border-terra/30 bg-terra/5 shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-terra uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="size-4 text-terra" />
              Konfigurasi Akun Jurnal Penutup Akhir Tahun (SAK EMKM)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 space-y-3 text-xs">
            <p className="text-ink-soft leading-relaxed">
              Pada penutupan buku akhir tahun (Desember), sistem otomatis menolkan seluruh akun nominal (Pendapatan & Beban) dan memindahkan saldo laba/rugi bersih ke akun Laba Ditahan.
            </p>
            <div className="max-w-md space-y-1.5">
              <label className="font-medium text-ink text-xs">Pilih Akun Laba Ditahan (Retained Earnings)</label>
              <select
                value={retainedEarningsAccountId}
                onChange={(e) => setRetainedEarningsAccountId(e.target.value)}
                className="w-full rounded-md border border-rule bg-paper px-3 py-2 text-xs text-ink shadow-xs"
              >
                {accounts
                  .filter((a) => a.type === "EKUITAS")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog konfirmasi tutup / buka periode */}
      <Dialog open={confirmKind !== null} onOpenChange={(o) => !o && setConfirmKind(null)}>
        <DialogContent className="border-rule bg-paper sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display text-base font-semibold text-ink">
              {confirmKind === "close"
                ? `Kunci periode ${selectedPeriodName}?`
                : `Buka kembali periode ${selectedPeriodName}?`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-xs leading-relaxed text-ink-soft">
            {confirmKind === "close" ? (
              <>
                <p>
                  Transaksi pada periode ini akan <strong className="text-ink">dikunci permanen</strong>.
                  Koreksi setelahnya hanya bisa lewat jurnal pembalik di periode berjalan.
                </p>
                {isYearEnd && (
                  <p>
                    Penutupan Desember juga menolkan akun Pendapatan &amp; Beban dan memindahkan
                    laba/rugi bersih ke akun Laba Ditahan yang dipilih di atas.
                  </p>
                )}
              </>
            ) : (
              <p>
                Pembukaan kembali <strong className="text-ink">dicatat di jejak audit</strong> dan
                hanya boleh dilakukan Owner. Transaksi yang sudah terkunci menjadi bisa diubah
                selama periode terbuka.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setConfirmKind(null)}
              className="text-xs"
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={() => {
                const run = confirmKind === "close" ? handleClosePeriod : handleReopenPeriod;
                setConfirmKind(null);
                void run();
              }}
              className={
                confirmKind === "close"
                  ? "bg-terra text-xs text-white hover:bg-terra/90"
                  : "text-xs"
              }
            >
              {loading && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              {confirmKind === "close" ? "Ya, Kunci Periode" : "Ya, Buka Kembali"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
