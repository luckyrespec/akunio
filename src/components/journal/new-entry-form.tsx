"use client";

import { useMemo, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  FileText,
  Maximize2,
  Minimize2,
  Paperclip,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { createAndPostAction } from "@/server/actions/journal.actions";
import { uploadDocumentAction } from "@/server/actions/upload.actions";
import { PostedSuccess } from "@/components/journal/posted-success";
import { Money } from "@/core/money/money";
import { moduleLabelForKind } from "@/core/subledger/guard";
import { todayISO } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { SplitButton } from "@/components/ui/split-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AccountSelect } from "@/components/account-select";
import { PageHeader } from "@/components/page-header";
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
  controlKinds = {},
}: {
  accounts: Array<{ id: string; code?: string; name?: string; label?: string }>;
  controlKinds?: Record<string, "PIUTANG" | "UTANG" | "PERSEDIAAN">;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ id: string; number: string; totalMinor: bigint } | null>(null);
  const [flash, setFlash] = useState<{ id: string; number: string } | null>(null);

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

  // Akun kontrol tidak bisa diposting via jurnal manual (B1) — cegah sebelum submit.
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const blockedRows: Array<{ key: number; index: number; label: string; kind: "PIUTANG" | "UTANG" | "PERSEDIAAN" }> = [];
  rows.forEach((r, index) => {
    const kind = controlKinds[r.accountId];
    if (r.accountId && kind) {
      blockedRows.push({ key: r.key, index, label: accountById.get(r.accountId)?.label ?? r.accountId, kind });
    }
  });

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

  function resetForm() {
    setRows([
      { key: 1, accountId: "", debitText: "", creditText: "" },
      { key: 2, accountId: "", debitText: "", creditText: "" },
    ]);
    setMemo("");
    setDateISO(todayISO());
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setError(null);
  }

  function submitWithMode(mode: "post" | "post-new") {
    setError(null);
    setFlash(null);
    startTransition(async () => {
      try {
        let document: { id: string; fileName?: string } | undefined;
        if (file) {
          const fd = new FormData();
          fd.set("file", file);
          const upRes = await uploadDocumentAction(fd);
          if (!upRes.ok || !upRes.documentId) {
            setError(upRes.error ?? "Gagal mengunggah lampiran.");
            return;
          }
          document = { id: upRes.documentId, fileName: file.name };
        }
        const res = await createAndPostAction({
          dateISO,
          memo,
          lines: rows.map(({ accountId, debitText, creditText }) => ({
            accountId,
            debitText,
            creditText,
          })),
          document,
        });
        if (!res.ok) {
          setError(res.error ?? "Gagal memposting jurnal.");
          return;
        }
        if (mode === "post-new") {
          setFlash({ id: res.id ?? "", number: res.number ?? "" });
          resetForm();
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          setPosted({ id: res.id ?? "", number: res.number ?? "", totalMinor: totals.d });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memposting jurnal.");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    submitWithMode("post");
  }

  if (posted) {
    return (
      <PostedSuccess id={posted.id} number={posted.number} totalMinor={posted.totalMinor} />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader
        title="Tulis Jurnal Baru"
        eyebrow="Pastikan jumlah total Debit dan Kredit seimbang sebelum memposting transaksi."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/jurnal")}
              className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
            >
              Batal
            </Button>

            <SplitButton
              primaryType="submit"
              disabled={!totals.balanced || pending || blockedRows.length > 0}
              loading={pending}
              menuLabel="Opsi posting lainnya"
              items={[
                { label: "Posting Jurnal", onSelect: () => submitWithMode("post") },
                { label: "Posting & Tulis Lagi", onSelect: () => submitWithMode("post-new") },
              ]}
            >
              {pending ? "Memposting..." : "Posting Jurnal"}
            </SplitButton>
          </div>
        }
      />

      {blockedRows.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-ink">
          <p className="font-semibold">Akun kontrol tidak bisa dijurnal manual:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {blockedRows.map((b) => (
              <li key={b.key}>
                Baris {b.index + 1} · {b.label} — mutasi hanya via {moduleLabelForKind(b.kind)}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {flash?.id && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-debit/25 bg-debit/10 px-4 py-3 text-xs">
          <span className="text-ink">
            <strong className="tnum font-semibold">{flash.number}</strong> terposting &amp; terkunci. Formulir sudah dikosongkan untuk jurnal berikutnya.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] border-rule bg-paper" onClick={() => router.push(`/jurnal/${flash.id}`)}>
              Lihat Detail
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Tutup notifikasi" onClick={() => setFlash(null)}>
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs font-medium text-destructive">
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
                        aria-label={`Hapus baris ${idx + 1}`}
                        className="text-ink-soft hover:bg-destructive/10 hover:text-destructive max-sm:min-h-[44px] max-sm:min-w-[44px]"
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

            {/* Ringkasan Total Mobile */}
            <div className="rounded-xl border border-rule bg-canvas/30 px-3.5 py-2.5 text-xs sm:hidden">
              <div className="tnum flex items-center justify-between font-medium">
                <span>Debit: <strong className="text-ink">{Money.fromMinor(totals.d).formatIdr()}</strong></span>
                <span>Kredit: <strong className="text-ink">{Money.fromMinor(totals.c).formatIdr()}</strong></span>
              </div>
              <div className="mt-1 text-right">
                {totals.balanced ? (
                  <span className="font-medium text-debit">Seimbang — siap diposting</span>
                ) : totals.d === 0n && totals.c === 0n ? (
                  <span className="text-ink-soft">Isi nominal terlebih dahulu</span>
                ) : (
                  <span className="font-medium text-terra">
                    Belum seimbang — selisih {Money.fromMinor(totals.diff).formatIdr()}
                  </span>
                )}
              </div>
            </div>

            {/* Desktop & Tablet Table (>= sm) */}
            <div className="hidden sm:block overflow-x-auto rounded-xl border border-rule bg-paper shadow-2xs">
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
                            aria-label={`Hapus baris ${idx + 1}`}
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
            <div className="border-t border-rule/50 px-1 pt-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-ink-soft">{rows.length} baris jurnal</span>
                <div className="flex items-center gap-4 tnum font-medium">
                  <span>Debit: <strong className="text-ink font-semibold">{Money.fromMinor(totals.d).formatIdr()}</strong></span>
                  <span>Kredit: <strong className="text-ink font-semibold">{Money.fromMinor(totals.c).formatIdr()}</strong></span>
                </div>
              </div>
              <div className="mt-1.5 flex justify-end">
                {totals.balanced ? (
                  <span className="inline-flex items-center gap-1 font-medium text-debit">
                    <CheckCircle2 className="size-3.5" /> Seimbang — siap diposting
                  </span>
                ) : totals.d === 0n && totals.c === 0n ? (
                  <span className="text-ink-soft">Isi nominal debit atau kredit terlebih dahulu</span>
                ) : (
                  <span className="font-medium text-terra">
                    Belum seimbang — selisih {Money.fromMinor(totals.diff).formatIdr()}
                    {totals.diff > 0n && (totals.d > totals.c ? " (Debit lebih besar)" : " (Kredit lebih besar)")}
                  </span>
                )}
              </div>
            </div>
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

            <div className="flex items-center justify-between text-[11px] text-ink-soft">
              <span>Mendukung memo multi-baris</span>
              <span>{memo.length} karakter</span>
            </div>
          </div>
        </div>

        {/* Pane Kanan: Tanggal & Lampiran */}
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

          {/* Card: Lampiran / Data Dukung */}
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Paperclip className="size-3.5 text-ink-soft" />
                <span className="text-xs font-semibold text-ink">Lampiran / Data Dukung</span>
              </div>
              <span className="text-[11px] text-ink-soft">Maks 5 MB</span>
            </div>

            {file ? (
              <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/40 p-2.5 shadow-2xs">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-terra/10 text-terra">
                    <FileText className="size-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="truncate text-xs font-medium text-ink">{file.name}</p>
                    <p className="text-[11px] text-ink-soft">{(file.size / 1024).toFixed(1)} KB</p>
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
        </div>
      </div>
    </form>
  );
}
