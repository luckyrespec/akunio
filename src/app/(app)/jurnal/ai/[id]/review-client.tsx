"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { acceptDraftAction, rejectDraftAction } from "@/server/actions/ai.actions";
import { Money } from "@/core/money/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountSelect } from "@/components/account-select";
import { PageActionButton, PageActions } from "@/components/page-actions";

export interface ReviewDraftLine {
  accountCode: string;
  debitText: string;
  creditText: string;
  confidence: number;
  reason: string;
  accountId: string | null;
  matchedName: string | null;
  unresolved: boolean;
}

export interface ReviewDraft {
  dateISO: string;
  memo: string;
  lines: ReviewDraftLine[];
  overallConfidence: number;
  explanation: string;
  mapping?: { warnings: string[] };
}

interface Row {
  key: number;
  accountId: string;
  debitText: string;
  creditText: string;
}

function safeMinor(text: string): bigint | null {
  if (!text.trim()) return 0n;
  try { return Money.parseIdr(text).minor; } catch { return null; }
}

export function ReviewClient({
  draftId, draft, accounts, documentMeta,
}: {
  draftId: string;
  draft: ReviewDraft;
  accounts: Array<{ id: string; code?: string; name?: string; label?: string }>;
  documentMeta: { mime: string; storageKey: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [postedNumber, setPostedNumber] = useState<string | null>(null);
  const [confirmTolak, setConfirmTolak] = useState(false);

  const [dateISO, setDateISO] = useState(draft.dateISO);
  const [memo, setMemo] = useState(draft.memo);
  const [rows, setRows] = useState<Row[]>(() =>
    draft.lines.map((l, i) => ({
      key: i + 1,
      accountId: l.accountId ?? "",
      debitText: l.debitText,
      creditText: l.creditText,
    })),
  );

  const totals = useMemo(() => {
    let d = 0n, c = 0n, invalid = false;
    for (const r of rows) {
      const dv = safeMinor(r.debitText);
      const cv = safeMinor(r.creditText);
      if (dv === null || cv === null) invalid = true;
      d += dv ?? 0n;
      c += cv ?? 0n;
    }
    return { d, c, invalid, balanced: !invalid && d > 0n && d === c };
  }, [rows]);

  const allHaveAccounts = rows.every((r) => r.accountId !== "");

  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        dateISO: draft.dateISO,
        memo: draft.memo,
        rows: draft.lines.map((l) => ({
          accountId: l.accountId ?? "",
          debitText: l.debitText,
          creditText: l.creditText,
        })),
      }),
    [draft],
  );
  const isDirty =
    JSON.stringify({
      dateISO,
      memo,
      rows: rows.map(({ accountId, debitText, creditText }) => ({
        accountId,
        debitText,
        creditText,
      })),
    }) !== initialSnapshot;

  useEffect(() => {
    if (!isDirty || postedNumber) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [isDirty, postedNumber]);

  const codeById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.code ?? ""])),
    [accounts],
  );

  // Diff jujur sejajar indeks: baris edited membawa accountId (uuid),
  // draf asli membawa accountCode — pencocokan kode mentah selalu gagal
  // dan menandai semua baris dihapus+ditambah. Selesaikan uuid ke kode dulu,
  // lalu sandingkan per posisi. Baris yang belum disentuh tapi akunnya masih
  // kosong dilaporkan sebagai NEEDS_ACCOUNT, bukan CHANGED.
  const diff = useMemo(() => {
    type State = "SAME" | "CHANGED" | "ADDED" | "REMOVED" | "NEEDS_ACCOUNT";
    const out: Array<{ state: State; accountCode: string; debitText: string; creditText: string }> = [];
    let changed = 0, added = 0, removed = 0, needsAccount = 0;
    draft.lines.forEach((o, i) => {
      const e = rows[i];
      if (!e) {
        removed++;
        out.push({ state: "REMOVED", accountCode: o.accountCode, debitText: o.debitText, creditText: o.creditText });
        return;
      }
      const eCode = codeById.get(e.accountId) ?? e.accountId;
      const amountsSame = e.debitText === o.debitText && e.creditText === o.creditText;
      if (!eCode && amountsSame) {
        needsAccount++;
        out.push({ state: "NEEDS_ACCOUNT", accountCode: o.accountCode, debitText: e.debitText, creditText: e.creditText });
        return;
      }
      const same = eCode === o.accountCode && amountsSame;
      if (!same) changed++;
      out.push({
        state: same ? "SAME" : "CHANGED",
        accountCode: eCode || o.accountCode,
        debitText: e.debitText,
        creditText: e.creditText,
      });
    });
    rows.slice(draft.lines.length).forEach((e) => {
      added++;
      const eCode = codeById.get(e.accountId) ?? "";
      out.push({ state: "ADDED", accountCode: eCode, debitText: e.debitText, creditText: e.creditText });
    });
    return { changed, added, removed, needsAccount, rows: out };
  }, [rows, draft.lines, codeById]);

  const hasDiff = diff.changed > 0 || diff.added > 0 || diff.removed > 0 || diff.needsAccount > 0;
  const diffSummary = [
    diff.changed > 0 ? `${diff.changed} diubah` : null,
    diff.added > 0 ? `${diff.added} ditambah` : null,
    diff.removed > 0 ? `${diff.removed} dihapus` : null,
    diff.needsAccount > 0 ? `${diff.needsAccount} perlu dilengkapi` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(" · ");

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function tolak() {
    if (!confirmTolak) {
      setConfirmTolak(true);
      return;
    }
    setConfirmTolak(false);
    startTransition(async () => {
      await rejectDraftAction(draftId);
      router.push("/jurnal");
    });
  }

  function posting() {
    setError(null);
    startTransition(async () => {
      const res = await acceptDraftAction(draftId, {
        dateISO, memo,
        lines: rows.map(({ accountId, debitText, creditText }) => ({
          accountId, debitText, creditText,
        })),
      });
      if (!res.ok) { setError(res.error ?? "Gagal memposting."); return; }
      setPostedNumber(res.number ?? "");
    });
  }

  const canPost = !pending && totals.balanced && allHaveAccounts;

  if (postedNumber) {
    return (
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-rule bg-paper p-8 text-center shadow-xs">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-debit/10 text-debit">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          Terposting &amp; Terkunci
        </p>
        <p className="tnum mt-1 font-display text-3xl font-semibold tracking-tight text-ink">
          {postedNumber}
        </p>
        <p className="tnum mt-1 text-xs text-ink-soft">
          {Money.fromMinor(totals.d).formatIdr()} · koreksi hanya via jurnal pembalik
        </p>
        <div className="rule-double mx-auto mt-4 max-w-[220px]" />
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <Button
            type="button"
            onClick={() => router.push("/jurnal")}
            className="bg-terra text-xs text-white hover:bg-terra/90"
          >
            Lihat Jurnal Umum
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/asisten")}
            className="text-xs"
          >
            Kembali ke Asisten
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-8 md:grid-cols-2">
      {/* Kiri: apa yang dibaca asisten */}
      <div className="space-y-4">
        <div className="rounded-lg border border-rule bg-paper p-4">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Apa yang dibaca asisten</p>
          <p className="mt-2 text-sm leading-relaxed">{draft.explanation}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">
              Keyakinan {Math.round(draft.overallConfidence * 100)}%
            </Badge>
            {documentMeta && (
              <Badge variant="outline">Dokumen: {documentMeta.mime}</Badge>
            )}
          </div>
        </div>
        {draft.mapping && draft.mapping.warnings.length > 0 && (
          <div className="rounded-lg border border-credit/40 bg-paper p-4">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Perhatian pemetaan akun</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-credit">
              {draft.mapping.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
        )}
        {draft.lines.some((l) => l.confidence < 0.7 || l.unresolved) && (
          <p className="text-xs text-ink-soft leading-relaxed">
            Garis terracotta berarti akun belum dipilih dan wajib dilengkapi. Garis amber berarti
            keyakinan di bawah 70% — periksa sebelum posting.
          </p>
        )}
      </div>

      {/* Kanan: draft editable */}
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="tanggal-review" className="text-xs font-medium text-ink-soft">Tanggal</Label>
            <Input id="tanggal-review" type="date" value={dateISO}
                   onChange={(e) => setDateISO(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="memo-review" className="text-xs font-medium text-ink-soft">Keterangan</Label>
            <Input id="memo-review" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>

        {/* Mobile Rows (< sm) */}
        <div className="space-y-3 sm:hidden">
          {rows.map((r, i) => {
            const line = draft.lines[i];
            const blocked = !r.accountId || line?.unresolved === true;
            const needsCheck = blocked || (line != null && line.confidence < 0.7);
            return (
              <div
                key={r.key}
                className={`rounded-xl border border-rule bg-canvas/30 p-3.5 space-y-3 ${
                  needsCheck ? (blocked ? "border-terra/40 bg-terra/5" : "border-amber-500/40 bg-amber-500/5") : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-soft">Baris #{i + 1}</span>
                  {needsCheck && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[11px] ${blocked ? "border-terra/30 text-terra bg-terra/5" : "border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/5"}`}>
                        {blocked ? "pilih akun" : "perlu cek"}
                      </Badge>
                      <span className={`text-xs font-semibold ${blocked ? "text-terra" : "text-amber-700 dark:text-amber-400"}`}>{Math.round((line?.confidence ?? 0) * 100)}%</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-ink-soft">Akun</Label>
                  <AccountSelect
                    accounts={accounts}
                    value={r.accountId}
                    onValueChange={(v) => update(r.key, { accountId: v })}
                    placeholder="Pilih akun..."
                  />
                  {needsCheck && line?.reason && (
                    <p className="text-[11px] text-ink-soft mt-1">{line.reason}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-ink-soft">Debit (Rp)</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      value={r.debitText}
                      className="text-right bg-paper"
                      disabled={!!r.creditText}
                      onChange={(e) => update(r.key, { debitText: e.target.value, creditText: "" })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-ink-soft">Kredit (Rp)</Label>
                    <Input
                      inputMode="numeric"
                      placeholder="0"
                      value={r.creditText}
                      className="text-right bg-paper"
                      disabled={!!r.debitText}
                      onChange={(e) => update(r.key, { creditText: e.target.value, debitText: "" })}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop & Tablet Table (>= sm) */}
        <div className="hidden sm:block overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
          <table className="w-full table-fixed tnum text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Akun</th>
                <th className="w-32 px-3 py-3 text-right sm:w-36">Debit</th>
                <th className="w-32 px-3 py-3 text-right sm:w-36">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {rows.map((r, i) => {
                const line = draft.lines[i];
                const blocked = !r.accountId || line?.unresolved === true;
                const needsCheck = blocked || (line && line.confidence < 0.7);
                return (
                  <tr key={r.key}
                      className={`transition-colors hover:bg-canvas/30 ${needsCheck ? (blocked ? "bg-terra/5 shadow-[inset_2px_0_0_var(--color-terra)]" : "bg-amber-500/5 shadow-[inset_2px_0_0_var(--color-amber-500)]") : ""}`}>
                    <td className="px-3 py-2.5">
                      <AccountSelect
                        accounts={accounts}
                        value={r.accountId}
                        onValueChange={(v) => update(r.key, { accountId: v })}
                        placeholder="Pilih akun..."
                      />
                      {needsCheck && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className={`text-[11px] ${blocked ? "border-terra/30 text-terra bg-terra/5" : "border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/5"}`}>
                            {blocked ? "pilih akun" : "periksa"}
                          </Badge>
                          <span className={`text-xs font-medium ${blocked ? "text-terra" : "text-amber-700 dark:text-amber-400"}`}>{Math.round((line?.confidence ?? 0) * 100)}%</span>
                          {line?.reason && (
                            <span className="text-xs leading-relaxed text-ink-soft">{line.reason}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Input inputMode="numeric" placeholder="0" value={r.debitText}
                             className="text-right"
                             disabled={!!r.creditText}
                             onChange={(e) => update(r.key, {
                               debitText: e.target.value, creditText: "",
                             })} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Input inputMode="numeric" placeholder="0" value={r.creditText}
                             className="text-right"
                             disabled={!!r.debitText}
                             onChange={(e) => update(r.key, {
                               creditText: e.target.value, debitText: "",
                             })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-rule bg-canvas/40 p-4 text-sm">
          <div className="flex items-center justify-between sm:justify-start gap-3 tnum">
            <div>
              <span className="text-xs uppercase text-ink-soft">Debit: </span>
              <span className="text-base font-bold text-ink">{Money.fromMinor(totals.d).formatIdr()}</span>
            </div>
            <span className="text-rule">|</span>
            <div>
              <span className="text-xs uppercase text-ink-soft">Kredit: </span>
              <span className="text-base font-bold text-ink">{Money.fromMinor(totals.c).formatIdr()}</span>
            </div>
          </div>
          <Badge className={`inline-flex items-center gap-1 font-medium ${totals.balanced ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border border-terra/20 bg-terra/10 text-terra"}`}>
            {totals.balanced && <CheckCircle2 className="size-3" />}
            {totals.invalid ? "Nominal tak valid" : totals.balanced ? "Seimbang" : "Belum seimbang"}
          </Badge>
        </div>
        {!totals.balanced && (
          <p className="text-xs text-ink-soft leading-relaxed">
            {totals.invalid
              ? "Ada nominal yang bukan angka rupiah — perbaiki penulisannya."
              : "Lengkapi akun tiap baris dan pastikan total debit sama dengan kredit untuk memposting."}
          </p>
        )}

        {hasDiff && (
          <div className="rounded-xl border border-rule bg-paper p-4 text-sm shadow-xs">
            <p className="font-medium text-ink">
              Perubahan Anda vs draft AI ({diffSummary})
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {diff.rows.filter((r) => r.state !== "SAME").map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`inline-block size-1.5 rounded-full ${r.state === "CHANGED" ? "bg-amber-500" : r.state === "ADDED" ? "bg-emerald-500" : "bg-terra"}`} />
                  {r.state === "CHANGED" && `Diubah: ${r.accountCode}`}
                  {r.state === "ADDED" && (r.accountCode ? `Ditambah: ${r.accountCode}` : "Baris baru (akun belum dipilih)")}
                  {r.state === "REMOVED" && `Dihapus: ${r.accountCode}`}
                  {r.state === "NEEDS_ACCOUNT" && `Lengkapi akun: ${r.accountCode}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex flex-col items-stretch justify-end gap-2 sm:items-end">
          {confirmTolak && (
            <p className="text-xs text-ink-soft">
              Draft yang ditolak tidak bisa dikembalikan. Klik Tolak sekali lagi untuk lanjut.
            </p>
          )}
          <PageActions className="justify-end">
            <PageActionButton
              variant="secondary"
              disabled={pending}
              onClick={() => {
                tolak();
                window.setTimeout(() => setConfirmTolak(false), 6000);
              }}
              className={confirmTolak ? "border-destructive/50 text-destructive hover:text-destructive" : ""}
            >
              {confirmTolak ? "Klik lagi untuk menolak" : "Tolak"}
            </PageActionButton>
            <PageActionButton variant="primary" loading={pending} disabled={!canPost} onClick={posting}>
              {pending ? "Memposting..." : "Posting"}
            </PageActionButton>
          </PageActions>
        </div>
      </div>
    </div>
  );
}
