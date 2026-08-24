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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  accounts: Array<{ id: string; label: string }>;
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
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="space-y-2">
            <Label htmlFor="tanggal-review">Tanggal</Label>
            <Input id="tanggal-review" type="date" value={dateISO}
                   onChange={(e) => setDateISO(e.target.value)} />
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="memo-review">Keterangan</Label>
            <Input id="memo-review" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg border border-rule">
          <table className="w-full tnum text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs uppercase text-ink-soft">
                <th className="px-3 py-2 font-medium">Akun</th>
                <th className="px-3 py-2 text-right font-medium w-32">Debit</th>
                <th className="px-3 py-2 text-right font-medium w-32">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const line = draft.lines[i];
                const needsCheck = line && (line.confidence < 0.7 || line.unresolved);
                return (
                  <tr key={r.key}
                      className={`border-b border-rule/60 last:border-0 ${needsCheck ? "border-l-4 border-l-terra" : ""}`}>
                    <td className="px-3 py-2">
                      <Select value={r.accountId}
                              onValueChange={(v) => update(r.key, { accountId: v })}>
                        <SelectTrigger className={r.accountId === "" ? "text-ink-soft" : ""}>
                          <SelectValue placeholder="Pilih akun" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {needsCheck && (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-terra">
                          <Badge variant="outline">periksa</Badge>
                          {Math.round(line.confidence * 100)}%
                        </span>
                      )}
                      {line?.reason && (
                        <span className="mt-1 block text-xs text-ink-soft">{line.reason}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Input inputMode="numeric" placeholder="0" value={r.debitText}
                             disabled={!!r.creditText}
                             onChange={(e) => update(r.key, {
                               debitText: e.target.value, creditText: "",
                             })} />
                    </td>
                    <td className="px-3 py-2">
                      <Input inputMode="numeric" placeholder="0" value={r.creditText}
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

        <div className="flex items-center justify-between tnum text-sm">
          <span>
            Debit {Money.fromMinor(totals.d).formatIdr()}
            <span className="mx-2 text-rule">|</span>
            Kredit {Money.fromMinor(totals.c).formatIdr()}
          </span>
          <Badge className={totals.balanced ? "bg-canvas text-debit" : "bg-canvas text-credit"}>
            {totals.balanced ? "Seimbang" : "Belum seimbang"}
          </Badge>
        </div>

        {hasDiff && (
          <div className="rounded-lg border border-rule bg-paper px-4 py-3 text-sm">
            <p className="font-medium">
              Perubahanmu vs draft AI — {diff.changed} diubah · {diff.added} ditambah · {diff.removed} dihapus
            </p>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              {diff.rows.filter((r) => r.state !== "SAME").map((r, i) => (
                <li key={i}>
                  {r.state === "CHANGED" && `Diubah: ${r.accountCode}`}
                  {r.state === "ADDED" && `Ditambah: ${r.accountCode}`}
                  {r.state === "REMOVED" && `Dihapus: ${r.accountCode}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-credit">{error}</p>}

        <div className="flex justify-end gap-3">
          <Button variant="outline" disabled={pending} onClick={tolak}>Tolak</Button>
          <Button disabled={!canPost} onClick={posting} className="bg-terra hover:bg-terra/90">
            {pending ? "Memposting..." : "Posting"}
          </Button>
        </div>
      </div>
    </div>
  );
}
