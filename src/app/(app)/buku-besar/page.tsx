import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { getLedger } from "@/server/db/repos/ledger.repo";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";

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
      <h1 className="font-display text-2xl">Buku Besar</h1>

      <form method="get" className="mt-6 flex items-end gap-3">
        <select name="account" defaultValue={selected ?? ""}
                className="h-9 rounded-md border border-rule bg-paper px-3 text-sm">
          {leaves.map((a) => (
            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Tampilkan</Button>
      </form>

      {ledger && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-rule bg-paper">
          <table className="w-full tnum text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs uppercase text-ink-soft">
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
                <tr key={`${r.number}-${i}`} className="border-b border-rule/60 last:border-0">
                  <td className="px-4 py-2">{r.number}</td>
                  <td className="px-4 py-2">{r.entryDate}</td>
                  <td className="px-4 py-2">{r.memo}</td>
                  <td className="px-4 py-2 text-right">
                    {r.debitMinor > 0n ? Money.fromMinor(r.debitMinor).formatIdr() : ""}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.creditMinor > 0n ? Money.fromMinor(r.creditMinor).formatIdr() : ""}
                  </td>
                  <td className="px-4 py-2 text-right">{Money.fromMinor(r.balanceMinor).formatIdr()}</td>
                </tr>
              ))}
              {ledger.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-soft">
                    Belum ada mutasi pada akun ini.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="rule-double">
                <td colSpan={5} className="px-4 py-3 text-right font-medium">Saldo Akhir</td>
                <td className="px-4 py-3 text-right font-medium">
                  {Money.fromMinor(closing).formatIdr()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
