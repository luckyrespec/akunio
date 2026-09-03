import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { getLedger } from "@/server/db/repos/ledger.repo";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion";
import { PageHeader } from "@/components/page-header";
import { GlowCard } from "@/components/aceternity/glow-card";
import { LedgerAccountFilter } from "@/components/ledger/ledger-account-filter";

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
    <section className="space-y-6">
      <PageHeader title="Buku Besar" eyebrow="Detail mutasi per akun" />

      <Reveal delay={0.06}>
        <div className="rounded-xl border border-rule bg-paper p-4 shadow-xs">
          <LedgerAccountFilter accounts={leaves} selectedId={selected} />
        </div>
      </Reveal>

      {ledger && (
        <Reveal delay={0.1}>
          <div className="space-y-4">
            {/* Mobile Cards (< sm) */}
            <div className="space-y-3 sm:hidden">
              {ledger.rows.length === 0 && (
                <div className="rounded-xl border border-rule bg-paper p-8 text-center shadow-xs">
                  <p className="font-display text-base font-medium text-ink">Belum ada mutasi</p>
                  <p className="mt-1 text-xs text-ink-soft">Pilih akun lain atau buat jurnal baru.</p>
                </div>
              )}
              {ledger.rows.map((r, i) => (
                <div key={`${r.number}-${i}`} className="rounded-xl border border-rule bg-paper p-4 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-rule/50 pb-2">
                    <span className="font-semibold text-sm text-ink">{r.number}</span>
                    <span className="text-xs text-ink-soft">{r.entryDate}</span>
                  </div>
                  {r.memo && <p className="text-xs text-ink-soft">{r.memo}</p>}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <div className="flex items-center gap-1.5 font-medium tnum">
                      {r.debitMinor > 0n && (
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                          Debit: {Money.fromMinor(r.debitMinor).formatIdr()}
                        </span>
                      )}
                      {r.creditMinor > 0n && (
                        <span className="rounded bg-terra/10 px-2 py-0.5 text-terra font-semibold">
                          Kredit: {Money.fromMinor(r.creditMinor).formatIdr()}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-ink-soft uppercase block">Saldo</span>
                      <span className="font-semibold text-ink tnum">{Money.fromMinor(r.balanceMinor).formatIdr()}</span>
                    </div>
                  </div>
                </div>
              ))}

              {ledger.rows.length > 0 && (
                <div className="rounded-xl border border-rule bg-canvas p-4 text-sm shadow-xs flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Saldo Akhir</span>
                  <span className="font-display text-base font-bold text-ink tnum">
                    {Money.fromMinor(closing).formatIdr()}
                  </span>
                </div>
              )}
            </div>

            {/* Desktop & Tablet Table (>= sm) */}
            <div className="hidden sm:block">
              <GlowCard>
                <div className="overflow-x-auto rounded-xl border border-rule bg-paper shadow-xs">
                  <table className="w-full tnum text-sm">
                    <thead>
                      <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                        <th className="px-4 py-3">Nomor</th>
                        <th className="px-4 py-3">Tanggal</th>
                        <th className="px-4 py-3">Keterangan</th>
                        <th className="px-4 py-3 text-right">Debit</th>
                        <th className="px-4 py-3 text-right">Kredit</th>
                        <th className="px-4 py-3 text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule/60">
                      {ledger.rows.map((r, i) => (
                        <tr key={`${r.number}-${i}`} className="transition-colors hover:bg-canvas/30">
                          <td className="px-4 py-3 font-semibold text-ink">{r.number}</td>
                          <td className="px-4 py-3 text-ink-soft">{r.entryDate}</td>
                          <td className="px-4 py-3">{r.memo}</td>
                          <td className="px-4 py-3 text-right">
                            {r.debitMinor > 0n ? Money.fromMinor(r.debitMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.creditMinor > 0n ? Money.fromMinor(r.creditMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-ink">{Money.fromMinor(r.balanceMinor).formatIdr()}</td>
                        </tr>
                      ))}
                      {ledger.rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-16 text-center">
                            <p className="font-display text-base font-medium text-ink">Belum ada mutasi</p>
                            <p className="mt-1 text-xs text-ink-soft">Pilih akun lain atau buat jurnal baru.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="rule-double bg-canvas/50">
                        <td colSpan={5} className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-ink-soft">Saldo Akhir</td>
                        <td className="px-4 py-3.5 text-right font-display text-base font-semibold text-ink">
                          {Money.fromMinor(closing).formatIdr()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </GlowCard>
            </div>
          </div>
        </Reveal>
      )}
    </section>
  );
}
