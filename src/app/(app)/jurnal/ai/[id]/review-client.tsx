"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptDraftAction, rejectDraftAction } from "@/server/actions/ai.actions";
import { diffDraftVsEdited } from "@/core/ai/diff";
import { Money } from "@/core/money/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountSelect } from "@/components/account-select";

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
    return { d, c, balanced: !invalid && d > 0n && d === c };
  }, [rows]);

  const allHaveAccounts = rows.every((r) => r.accountId !== "");

  const diff = useMemo(
    () => diffDraftVsEdited(
      {
        lines: draft.lines.map(({ accountCode, debitText, creditText }) => ({
          accountCode, debitText, creditText,
        })),
      },
      rows.map(({ accountId, debitText, creditText }) => ({
        accountCode: accountId, debitText, creditText,
      })),
    ),
    [rows, draft.lines],
  );

  const hasDiff = diff.changed > 0 || diff.added > 0 || diff.removed > 0;

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function tolak() {
    startTransition(async () => {
      await rejectDraftAction(draftId);
      router.push("/jurnal?tab=draft");
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
      router.push("/jurnal?tab=draft");
    });
  }

  const canPost = !pending && totals.balanced && allHaveAccounts;

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
          <p className="text-xs text-ink-soft">
            Baris dengan garis terracotta butuh pemeriksaan (keyakinan &lt; 70% atau akun belum cocok).
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
            const needsCheck = line && (line.confidence < 0.7 || line.unresolved);
            return (
              <div
                key={r.key}
                className={`rounded-xl border border-rule bg-canvas/30 p-3.5 space-y-3 ${
                  needsCheck ? "border-terra/40 bg-terra/5" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-soft">Baris #{i + 1}</span>
                  {needsCheck && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="border-terra/30 text-terra bg-terra/5 text-[10px]">
                        perlu cek
                      </Badge>
                      <span className="text-xs text-terra font-semibold">{Math.round((line?.confidence ?? 0) * 100)}%</span>
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
                const needsCheck = line && (line.confidence < 0.7 || line.unresolved);
                return (
                  <tr key={r.key}
                      className={`transition-colors hover:bg-canvas/30 ${needsCheck ? "bg-terra/5 border-l-4 border-l-terra" : ""}`}>
                    <td className="px-3 py-2.5">
                      <AccountSelect
                        accounts={accounts}
                        value={r.accountId}
                        onValueChange={(v) => update(r.key, { accountId: v })}
                        placeholder="Pilih akun..."
                      />
                      {needsCheck && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="border-terra/30 text-terra bg-terra/5 text-[10px]">
                            periksa
                          </Badge>
                          <span className="text-xs text-terra font-medium">{Math.round(line.confidence * 100)}%</span>
                          {line?.reason && (
                            <span className="text-xs text-ink-soft truncate max-w-[200px]">{line.reason}</span>
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
              <span className="font-semibold text-ink">{Money.fromMinor(totals.d).formatIdr()}</span>
            </div>
            <span className="text-rule">|</span>
            <div>
              <span className="text-xs uppercase text-ink-soft">Kredit: </span>
              <span className="font-semibold text-ink">{Money.fromMinor(totals.c).formatIdr()}</span>
            </div>
          </div>
          <Badge className={`font-medium ${totals.balanced ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border border-terra/20 bg-terra/10 text-terra"}`}>
            {totals.balanced ? "✓ Seimbang" : "Belum seimbang"}
          </Badge>
        </div>

        {hasDiff && (
          <div className="rounded-xl border border-rule bg-paper p-4 text-sm shadow-xs">
            <p className="font-medium text-ink">
              Perubahan Anda vs draft AI ({diff.changed} diubah · {diff.added} ditambah · {diff.removed} dihapus)
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {diff.rows.filter((r) => r.state !== "SAME").map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`inline-block size-1.5 rounded-full ${r.state === "CHANGED" ? "bg-amber-500" : r.state === "ADDED" ? "bg-emerald-500" : "bg-terra"}`} />
                  {r.state === "CHANGED" && `Diubah: ${r.accountCode}`}
                  {r.state === "ADDED" && `Ditambah: ${r.accountCode}`}
                  {r.state === "REMOVED" && `Dihapus: ${r.accountCode}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" disabled={pending} onClick={tolak}>Tolak</Button>
          <Button disabled={!canPost} onClick={posting} className="bg-terra text-white hover:bg-terra/90 shadow-sm">
            {pending ? "Memposting..." : "Posting"}
          </Button>
        </div>
      </div>
    </div>
  );
}
