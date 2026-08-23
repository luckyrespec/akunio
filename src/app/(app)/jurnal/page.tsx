import { Fragment } from "react";
import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listEntriesWithLines } from "@/server/db/repos/journals.repo";
import { Money } from "@/core/money/money";
import { ReverseButton } from "@/components/journal/reverse-button";
import { Button } from "@/components/ui/button";

export default async function JurnalPage() {
  const ctx = await requireContext();
  const entries = await db.transaction((tx) => listEntriesWithLines(tx, ctx.orgId, 100));

  return (
    <section>
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Jurnal Umum</h1>
        <Link href="/jurnal/baru">
          <Button className="bg-terra hover:bg-terra/90">+ Tulis Jurnal</Button>
        </Link>
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border border-rule bg-paper">
        <table className="w-full tnum text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Nomor</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Akun &amp; Keterangan</th>
              <th className="px-4 py-3 font-medium text-right">Debit</th>
              <th className="px-4 py-3 font-medium text-right">Kredit</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-ink-soft">
                  Belum ada jurnal. Mulai dengan menekan “+ Tulis Jurnal”.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <Fragment key={e.id}>
                {e.lines.map((l, i) => (
                  <tr key={l.id} className="border-b border-rule/60 last:border-0">
                    <td className="px-4 py-2 align-top">
                      {i === 0 ? <span className="font-medium">{e.number}</span> : ""}
                    </td>
                    <td className="px-4 py-2 align-top">{i === 0 ? e.entryDate : ""}</td>
                    <td className="px-4 py-2 pl-8">
                      {l.accountCode} · {l.accountName}
                      <span className="ml-2 text-xs text-ink-soft">{l.memo ?? e.memo}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.debitMinor > 0n ? Money.fromMinor(l.debitMinor).formatIdr() : ""}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.creditMinor > 0n ? Money.fromMinor(l.creditMinor).formatIdr() : ""}
                    </td>
                    <td className="px-4 py-2">
                      {i === 0 && e.status === "POSTED" && !e.reversalOfId && (
                        <ReverseButton entryId={e.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {entries.some((e) => e.reversalOfId) && (
        <p className="mt-3 text-xs text-ink-soft">
          Entri dengan balikan terhubung otomatis; koreksi tidak pernah menghapus riwayat.
        </p>
      )}
    </section>
  );
}
