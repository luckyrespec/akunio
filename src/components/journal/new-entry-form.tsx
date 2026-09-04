"use client";

import { useMemo, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { createAndPostAction } from "@/server/actions/journal.actions";
import { uploadDocumentAction } from "@/server/actions/upload.actions";
import { createDraftAction } from "@/server/actions/ai.actions";
import { Money } from "@/core/money/money";
import { todayISO } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect } from "@/components/account-select";
import { cn } from "@/lib/utils";

interface Row {
  key: number;
  accountId: string;
  debitText: string;
  creditText: string;
}

function safeMinor(text: string): bigint | null {
  if (!text.trim()) return 0n;
  try {
    return Money.parseIdr(text).minor;
  } catch {
    return null;
  }
}

export function NewEntryForm({
  accounts,
}: {
  accounts: Array<{ id: string; code?: string; name?: string; label?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [dateISO, setDateISO] = useState(() => todayISO());
  const [memo, setMemo] = useState("");
  const [isMemoExpanded, setIsMemoExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const [rows, setRows] = useState<Row[]>([
    { key: 1, accountId: "", debitText: "", creditText: "" },
    { key: 2, accountId: "", debitText: "", creditText: "" },
  ]);

  const totals = useMemo(() => {
    let d = 0n,
      c = 0n,
      invalid = false;
    for (const r of rows) {
      const dv = safeMinor(r.debitText);
      const cv = safeMinor(r.creditText);
      if (dv === null || cv === null) invalid = true;
      d += dv ?? 0n;
      c += cv ?? 0n;
    }
    const diff = d > c ? d - c : c - d;
    return { d, c, diff, balanced: !invalid && d > 0n && d === c };
  }, [rows]);

  const nextKey = Math.max(0, ...rows.map((r) => r.key)) + 1;

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 5 * 1024 * 1024) {
        setError("Ukuran file maksimal 5 MB.");
        return;
      }
      setError(null);
      setFile(selected);
    }
  }

  function removeFile() {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // AI Auto-Draft Execution
  async function handleGenerateWithAI() {
    if (!file && !memo.trim()) {
      setError("Lampirkan dokumen data dukung atau ketik keterangan transaksi terlebih dahulu.");
      return;
    }

    setError(null);
    setAiProcessing(true);
    setAiStatusMessage(file ? "Mengunggah data dukung & membaca OCR..." : "Menganalisis transaksi via AI...");

    try {
      let documentId: string | undefined;
      if (file) {
        const formData = new FormData();
        formData.set("file", file);
        const upRes = await uploadDocumentAction(formData);
        if (!upRes.ok || !upRes.documentId) {
          throw new Error(upRes.error ?? "Gagal mengunggah file data dukung.");
        }
        documentId = upRes.documentId;
      }

      setAiStatusMessage("Menyusun jurnal double-entry & mencocokkan bagan akun...");
      const draftRes = await createDraftAction({
        text: memo.trim() || (file ? `Analisis data dukung: ${file.name}` : undefined),
        documentId,
      });

      if (!draftRes.ok || !draftRes.draftId) {
        throw new Error(draftRes.error ?? "Gagal membuat draft jurnal.");
      }

      setAiStatusMessage("Membuka halaman review draft...");
      router.push(`/jurnal/ai/${draftRes.draftId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan saat memproses via AI.");
      setAiProcessing(false);
      setAiStatusMessage("");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAndPostAction({
        dateISO,
        memo,
        lines: rows.map(({ accountId, debitText, creditText }) => ({
          accountId,
          debitText,
          creditText,
        })),
      });
      if (!res.ok) {
        setError(res.error ?? "Gagal memposting jurnal.");
        return;
      }
      router.push("/jurnal");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* 1. Top Action Bar: Status Balance & Top Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 rounded-2xl border border-rule bg-paper p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <Badge
            className={cn(
              "px-3 py-1 text-xs font-semibold flex items-center gap-1.5",
              totals.balanced
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-terra/10 text-terra border border-terra/20"
            )}
          >
            {totals.balanced ? (
              <>
                <CheckCircle2 className="size-3.5" />
                <span>✓ Seimbang ({Money.fromMinor(totals.d).formatIdr()})</span>
              </>
            ) : (
              <span>
                Belum seimbang {totals.diff > 0n && `(Selisih ${Money.fromMinor(totals.diff).formatIdr()})`}
              </span>
            )}
          </Badge>

          <div className="hidden sm:flex items-center gap-2 text-xs text-ink-soft tnum">
            <span>Debit: <strong className="text-ink font-semibold">{Money.fromMinor(totals.d).formatIdr()}</strong></span>
            <span>·</span>
            <span>Kredit: <strong className="text-ink font-semibold">{Money.fromMinor(totals.c).formatIdr()}</strong></span>
          </div>
        </div>

        {/* Top Buttons: Batal & Posting */}
        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => router.push("/jurnal")}
            className="h-9 px-4 text-xs font-medium border-rule"
          >
            Batal
          </Button>

          <Button
            type="submit"
            size="sm"
            disabled={!totals.balanced || pending || aiProcessing}
            className="h-9 px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold shadow-xs transition-transform active:scale-[0.98]"
          >
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                Memposting...
              </>
            ) : (
              "Posting Jurnal"
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {/* 2. Main 2-Pane Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Pane Kiri: Isi Jurnal (Daftar Akun Debit & Kredit) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-rule/60 pb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-ink">Isi Baris Jurnal</h2>
                <p className="text-xs text-ink-soft mt-0.5">Pilih akun dan tentukan nilai Debit atau Kredit.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs border-rule gap-1 bg-canvas/60 hover:bg-canvas"
                onClick={() =>
                  setRows((rs) => [...rs, { key: nextKey, accountId: "", debitText: "", creditText: "" }])
                }
              >
                <Plus className="size-3.5" /> Tambah Baris
              </Button>
            </div>

            {/* Mobile View (< sm) */}
            <div className="space-y-3 sm:hidden">
              {rows.map((r, idx) => (
                <div key={r.key} className="rounded-xl border border-rule bg-canvas/30 p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-soft">Baris #{idx + 1}</span>
                    {rows.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-ink-soft hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-ink-soft">Akun</Label>
                    <AccountSelect
                      accounts={accounts}
                      value={r.accountId}
                      onValueChange={(v) => update(r.key, { accountId: v })}
                      placeholder="Cari nomor atau nama akun..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-ink-soft">Debit (Rp)</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="0"
                        className="text-right bg-paper font-mono text-xs"
                        value={r.debitText}
                        onChange={(e) => update(r.key, { debitText: e.target.value, creditText: "" })}
                        disabled={!!r.creditText}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-ink-soft">Kredit (Rp)</Label>
                      <Input
                        inputMode="numeric"
                        placeholder="0"
                        className="text-right bg-paper font-mono text-xs"
                        value={r.creditText}
                        onChange={(e) => update(r.key, { creditText: e.target.value, debitText: "" })}
                        disabled={!!r.debitText}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop & Tablet Table (>= sm) */}
            <div className="hidden sm:block overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs">
              <table className="w-full table-fixed tnum text-sm">
                <thead>
                  <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                    <th className="px-4 py-2.5">Akun</th>
                    <th className="w-36 lg:w-44 px-3 py-2.5 text-right">Debit</th>
                    <th className="w-36 lg:w-44 px-3 py-2.5 text-right">Kredit</th>
                    <th className="w-10 px-2 py-2.5 text-center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule/60">
                  {rows.map((r, idx) => (
                    <tr key={r.key} className="transition-colors hover:bg-canvas/30">
                      <td className="px-3 py-2">
                        <AccountSelect
                          accounts={accounts}
                          value={r.accountId}
                          onValueChange={(v) => update(r.key, { accountId: v })}
                          placeholder="Cari nomor atau nama akun..."
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          inputMode="numeric"
                          placeholder="0"
                          className="text-right font-mono text-xs"
                          value={r.debitText}
                          onChange={(e) => update(r.key, { debitText: e.target.value, creditText: "" })}
                          disabled={!!r.creditText}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          inputMode="numeric"
                          placeholder="0"
                          className="text-right font-mono text-xs"
                          value={r.creditText}
                          onChange={(e) => update(r.key, { creditText: e.target.value, debitText: "" })}
                          disabled={!!r.debitText}
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {rows.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-ink-soft hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Subtotal Panel di Bawah Tabel */}
            <div className="flex items-center justify-between pt-2 text-xs border-t border-rule/50 px-1">
              <span className="text-ink-soft">{rows.length} baris jurnal</span>
              <div className="flex items-center gap-4 tnum font-medium">
                <span>Debit: <strong className="text-ink font-semibold">{Money.fromMinor(totals.d).formatIdr()}</strong></span>
                <span>Kredit: <strong className="text-ink font-semibold">{Money.fromMinor(totals.c).formatIdr()}</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Pane Kanan: Tanggal, Keterangan / Memo Expandable, Lampiran & AI Helper */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* Card: Tanggal Transaksi */}
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-1.5">
            <Label htmlFor="tanggal" className="text-xs font-semibold text-ink-soft flex items-center gap-1.5">
              <Calendar className="size-3.5 text-ink-soft" />
              <span>Tanggal Transaksi</span>
            </Label>
            <Input
              id="tanggal"
              type="date"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
              required
              className="bg-paper"
            />
          </div>

          {/* Card: Keterangan / Memo dengan Expand Animation */}
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="memo" className="text-xs font-semibold text-ink-soft">
                Keterangan / Memo
              </Label>
              <button
                type="button"
                onClick={() => setIsMemoExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-terra hover:text-terra/80 transition-colors"
              >
                {isMemoExpanded ? (
                  <>
                    <Minimize2 className="size-3" /> Perkecil
                  </>
                ) : (
                  <>
                    <Maximize2 className="size-3" /> Perluas Tampilan
                  </>
                )}
              </button>
            </div>

            <motion.div
              layout
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
              }
              className="relative"
            >
              <Textarea
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Contoh: Pembayaran tagihan internet & listrik kantor bulan ini..."
                className={cn(
                  "w-full bg-paper transition-colors resize-y text-xs sm:text-sm leading-relaxed p-2.5",
                  isMemoExpanded ? "min-h-[160px]" : "min-h-[72px]"
                )}
              />
            </motion.div>

            <div className="flex items-center justify-between text-[10px] text-ink-soft">
              <span>Mendukung memo multi-baris</span>
              <span>{memo.length} karakter</span>
            </div>
          </div>

          {/* Card: Lampiran / Data Dukung */}
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Paperclip className="size-3.5 text-ink-soft" />
                <span className="text-xs font-semibold text-ink">Lampiran / Data Dukung</span>
              </div>
              <span className="text-[10px] text-ink-soft">Maks 5 MB</span>
            </div>

            {file ? (
              <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/40 p-2.5 shadow-2xs">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-terra/10 text-terra">
                    <FileText className="size-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="truncate text-xs font-medium text-ink">{file.name}</p>
                    <p className="text-[10px] text-ink-soft">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={removeFile}
                  className="text-ink-soft hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Hapus file"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rule bg-canvas/30 px-3 py-3 text-xs text-ink-soft transition-colors hover:bg-canvas hover:text-ink">
                <UploadCloud className="size-4 text-terra" />
                <span className="text-[11px]">Unggah nota, kwitansi, atau PDF</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Card: Bantuan AI Auto-Draft */}
          <div className="rounded-2xl border border-terra/25 bg-terra/[0.04] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-terra">
              <Sparkles className="size-4 shrink-0" />
              <h3 className="text-xs font-semibold">Otomasi Entri dengan AI</h3>
            </div>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              Unggah lampiran atau tulis keterangan singkat di atas, lalu minta AI menyusun jurnal lengkap siap review.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateWithAI}
              disabled={aiProcessing || (!file && !memo.trim())}
              className="w-full border-terra/30 text-terra bg-paper hover:bg-terra/10 text-xs font-semibold gap-1.5 h-8.5 shadow-2xs"
            >
              {aiProcessing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{aiStatusMessage || "Memproses AI..."}</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-3.5" />
                  <span>Susun Otomatis via AI</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
