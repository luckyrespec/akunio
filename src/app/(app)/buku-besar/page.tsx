import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { getLedger } from "@/server/db/repos/ledger.repo";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";

export default async function BukuBesarPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const rows = await db.transaction((tx) => listAccounts(tx, ctx.orgId));
  const leaves = rows.filter((a) => !rows.some((c) => c.parentCode === a.code));

  const selected = sp.account && leaves.some((a) => a.id === sp.account) ? sp.account : leaves[0]?.id;
  const ledger = selected
    ? await db.transaction((tx) => getLedger(tx, ctx.orgId, selected))
    : null;

  const closing = ledger?.rows.at(-1)?.balanceMinor ?? 0n;

  return (
    <section>
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">Buku Besar</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-ink-soft">Detail mutasi per akun</p>
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.06}>
        <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Akun</label>
            <select name="account" defaultValue={selected ?? ""}
                    className="h-9 min-w-[220px] rounded-lg border border-rule bg-paper px-3 text-sm shadow-sm">
              {leaves.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="outline" className="border-rule bg-canvas hover:bg-paper">Tampilkan</Button>
        </form>
      </Reveal>

      {ledger && (
        <Reveal delay={0.1}>
          <div className="matte-card mt-6 overflow-x-auto rounded-xl border border-rule bg-paper">
            <table className="w-full tnum text-sm">
              <thead>
                <tr className="border-b border-rule bg-canvas/60 text-left text-[11px] uppercase tracking-widest text-ink-soft">
                  <th className="px-4 py-3 font-medium">Nomor</th>
                  <th className="px-4 py-3 font-medium">Tanggal</th>
                  <th className="px-4 py-3 font-medium">Keterangan</th>
                  <th className="px-4 py-3 font-medium text-right">Debit</th>
                  <th className="px-4 py-3 font-medium text-right">Kredit</th>
                  <th className="px-4 py-3 font-medium text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((r, i) => (
                  <tr key={`${r.number}-${i}`} className="border-b border-rule/60 last:border-0 transition-colors hover:bg-canvas">
                    <td className="px-4 py-2.5 font-medium">{r.number}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{r.entryDate}</td>
                    <td className="px-4 py-2.5">{r.memo}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.debitMinor > 0n ? Money.fromMinor(r.debitMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.creditMinor > 0n ? Money.fromMinor(r.creditMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{Money.fromMinor(r.balanceMinor).formatIdr()}</td>
                  </tr>
                ))}
                {ledger.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <p className="font-display text-sm">Belum ada mutasi</p>
                      <p className="mt-1 text-xs text-ink-soft">Pilih akun lain atau buat jurnal baru.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="rule-double bg-canvas/40">
                  <td colSpan={5} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-widest text-ink-soft">Saldo Akhir</td>
                  <td className="px-4 py-3 text-right font-display font-semibold">
                    {Money.fromMinor(closing).formatIdr()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Reveal>
      )}
    </section>
  );
}
