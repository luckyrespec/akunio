"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAndPostAction } from "@/server/actions/journal.actions";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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

export function NewEntryForm({ accounts }: { accounts: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { key: 1, accountId: "", debitText: "", creditText: "" },
    { key: 2, accountId: "", debitText: "", creditText: "" },
  ]);

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

  // Max existing key + 1 avoids duplicate React keys after row deletions.
  const nextKey = Math.max(0, ...rows.map((r) => r.key)) + 1;

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAndPostAction({
        dateISO,
        memo,
        lines: rows.map(({ accountId, debitText, creditText }) => ({
          accountId, debitText, creditText,
        })),
      });
      if (!res.ok) { setError(res.error ?? "Gagal menyimpan jurnal."); return; }
      router.push("/jurnal");
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div className="flex gap-4">
        <div className="space-y-2">
          <Label htmlFor="tanggal">Tanggal</Label>
          <Input id="tanggal" type="date" value={dateISO}
                 onChange={(e) => setDateISO(e.target.value)} required />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="memo">Keterangan</Label>
          <Input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)}
                 placeholder="mis. Pembelian perlengkapan kantor tunai" />
        </div>
      </div>

      <div className="rounded-lg border border-rule">
        <table className="w-full tnum text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase text-ink-soft">
              <th className="px-3 py-2 font-medium">Akun</th>
              <th className="px-3 py-2 font-medium text-right w-40">Debit</th>
              <th className="px-3 py-2 font-medium text-right w-40">Kredit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-rule/60 last:border-0">
                <td className="px-3 py-2">
                  <Select value={r.accountId} onValueChange={(v) => update(r.key, { accountId: v })}>
                    <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input inputMode="numeric" placeholder="0"
                         value={r.debitText}
                         onChange={(e) => update(r.key, { debitText: e.target.value, creditText: "" })}
                         disabled={!!r.creditText} />
                </td>
                <td className="px-3 py-2">
                  <Input inputMode="numeric" placeholder="0"
                         value={r.creditText}
                         onChange={(e) => update(r.key, { creditText: e.target.value, debitText: "" })}
                         disabled={!!r.debitText} />
                </td>
                <td className="px-2 py-2">
                  {rows.length > 2 && (
                    <Button type="button" variant="ghost" size="sm"
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline"
                onClick={() =>
                  setRows((rs) => [...rs, { key: nextKey, accountId: "", debitText: "", creditText: "" }])
                }>
          + Baris
        </Button>
        <div className="text-right tnum text-sm">
          <span className="text-ink-soft">Debit </span>
          {Money.fromMinor(totals.d).formatIdr()}
          <span className="mx-2 text-rule">|</span>
          <span className="text-ink-soft">Kredit </span>
          {Money.fromMinor(totals.c).formatIdr()}
          <Badge className={`ml-3 ${totals.balanced ? "bg-canvas text-debit" : "bg-canvas text-credit"}`}>
            {totals.balanced ? "Seimbang" : "Belum seimbang"}
          </Badge>
        </div>
      </div>

      {error && <p className="text-sm text-credit">{error}</p>}

      <Button type="submit" disabled={!totals.balanced || pending}
              className="bg-terra hover:bg-terra/90">
        {pending ? "Memposting..." : "Posting Jurnal"}
      </Button>
    </form>
  );
}
