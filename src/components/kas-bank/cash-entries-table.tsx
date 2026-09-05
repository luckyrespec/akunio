"use client";

import * as React from "react";
import Link from "next/link";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { postCashDraftAction } from "@/server/actions/cash-bank.actions";
import type { CashEntryRow } from "@/server/db/repos/cash-bank.repo";
import { Loader2 } from "lucide-react";

export function CashEntriesTable({ entries }: { entries: CashEntryRow[] }) {
  const [postingId, setPostingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handlePost(id: string) {
    setPostingId(id);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("id", id);
      const res = await postCashDraftAction(fd);
      if (!res.ok) throw new Error(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memposting draft.");
    } finally {
      setPostingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          {error}
        </div>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-soft">
            <th className="py-2 pr-4 font-medium">Tanggal</th>
            <th className="py-2 pr-4 font-medium">Nomor</th>
            <th className="py-2 pr-4 font-medium">Kas/Bank</th>
            <th className="py-2 pr-4 font-medium">Lawan</th>
            <th className="py-2 pr-4 font-medium text-right">Nominal</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.id}
              data-testid="kas-bank-row"
              className="border-t border-rule"
            >
              <td className="py-2 pr-4">{e.entryDate}</td>
              <td className="py-2 pr-4 font-mono text-xs">{e.number}</td>
              <td className="py-2 pr-4">
                {e.cashCode} {e.cashName}
              </td>
              <td className="py-2 pr-4">
                {e.counterCode} {e.counterName}
              </td>
              <td className="py-2 pr-4 text-right">
                {Money.formatIdr(e.amountMinor)}
              </td>
              <td className="py-2 pr-4">
                <Badge
                  variant={e.status === "POSTED" ? "default" : "secondary"}
                >
                  {e.status === "POSTED" ? "Posted" : "Draft"}
                </Badge>
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  {e.status === "DRAFT" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={postingId === e.id}
                      onClick={() => handlePost(e.id)}
                    >
                      {postingId === e.id && (
                        <Loader2 className="size-3.5 animate-spin mr-1" />
                      )}
                      Posting
                    </Button>
                  )}
                  {e.journalEntryId && (
                    <Link
                      href={`/jurnal/${e.journalEntryId}`}
                      className="text-xs text-terra hover:underline"
                    >
                      Jurnal
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr className="border-t border-rule">
              <td colSpan={7} className="py-6 text-center text-ink-soft">
                Belum ada transaksi tercatat.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
