import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getCashHistoryRepo } from "@/server/db/repos/cash-bank.repo";
import { accounts } from "@/server/db/schema/org";
import { Money } from "@/core/money/money";
import { eq, and, or } from "drizzle-orm";

function monthRange(d: Date): { dari: string; sampai: string } {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, d.getMonth() + 1, 0).getDate();
  return { dari: `${y}-${m}-01`, sampai: `${y}-${m}-${last}` };
}

export default async function HistoriPage({
  searchParams,
}: {
  searchParams: Promise<{ akun?: string; dari?: string; sampai?: string }>;
}) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const cashAccounts = await db
    .select({ id: accounts.id, code: accounts.code, name: accounts.name })
    .from(accounts)
    .where(
      and(
        eq(accounts.orgId, ctx.orgId),
        or(eq(accounts.isBank, true), eq(accounts.isCash, true))
      )
    );
  const def = monthRange(new Date());
  const akun = sp.akun ?? cashAccounts[0]?.id ?? "";
  const dari = sp.dari ?? def.dari;
  const sampai = sp.sampai ?? def.sampai;
  const history = akun
    ? await getCashHistoryRepo(db, ctx.orgId, akun, dari, sampai)
    : null;

  let totalMasuk = 0n;
  let totalKeluar = 0n;
  for (const r of history?.rows ?? []) {
    totalMasuk += r.debitMinor;
    totalKeluar += r.creditMinor;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">
          Histori Bank
        </h1>
        <p className="text-sm text-ink-soft">
          Mutasi kas/bank versi pembukuan — dasar pencocokan rekonsiliasi.
        </p>
      </div>
      {history && (
        <>
          <p className="text-sm text-ink-soft">
            {history.account.code} {history.account.name} · Saldo awal{" "}
            {Money.formatIdr(history.openingMinor)} · Masuk{" "}
            {Money.formatIdr(totalMasuk)} · Keluar{" "}
            {Money.formatIdr(totalKeluar)}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th className="py-2 pr-4 font-medium">Tanggal</th>
                <th className="py-2 pr-4 font-medium">Nomor</th>
                <th className="py-2 pr-4 font-medium">Keterangan</th>
                <th className="py-2 pr-4 font-medium text-right">Masuk</th>
                <th className="py-2 pr-4 font-medium text-right">Keluar</th>
                <th className="py-2 font-medium text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.map((r) => (
                <tr key={r.entryId} className="border-t border-rule">
                  <td className="py-2 pr-4">{r.entryDate}</td>
                  <td className="py-2 pr-4">{r.number}</td>
                  <td className="py-2 pr-4">{r.memo}</td>
                  <td className="py-2 pr-4 text-right">
                    {r.debitMinor > 0n ? Money.formatIdr(r.debitMinor) : "—"}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {r.creditMinor > 0n ? Money.formatIdr(r.creditMinor) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {Money.formatIdr(r.balanceMinor)}
                  </td>
                </tr>
              ))}
              {history.rows.length === 0 && (
                <tr className="border-t border-rule">
                  <td colSpan={6} className="py-6 text-center text-ink-soft">
                    Tidak ada mutasi pada rentang ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
