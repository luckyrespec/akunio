import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { SUBLEDGER_KIND_LABEL, SUBLEDGER_LIST_ROUTE } from "@/core/subledger/cards";
import { getSubledgerReconAction } from "@/server/actions/subledger.actions";
import { RunCheckButton } from "./run-check-button";
import { Entrance } from "@/components/subsidiary/animated";
import { Package, Users, Store, ChevronRight } from "lucide-react";

const NAV_ROWS = [
  { kind: "PERSEDIAAN" as const, icon: Package, title: "Kartu Persediaan per SKU", desc: "Mutasi masuk, keluar, dan saldo tiap barang" },
  { kind: "PIUTANG" as const, icon: Users, title: "Kartu Piutang per Pelanggan", desc: "Tagihan, pembayaran, dan sisa tiap pelanggan" },
  { kind: "UTANG" as const, icon: Store, title: "Kartu Utang per Pemasok", desc: "Tagihan, pelunasan, dan sisa tiap pemasok" },
];

export default async function BukuPembantuPage() {
  const rows = await getSubledgerReconAction();
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  const mismatch = rows.filter((r) => r.differenceMinor !== "0");
  const sum = (pick: (r: (typeof rows)[number]) => string) =>
    rows.reduce((a, r) => a + BigInt(pick(r)), 0n);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buku Pembantu"
        eyebrow="Pantau keselarasan akun kontrol dengan rinciannya"
        actions={<RunCheckButton />}
      />
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Akun Kontrol
            </span>
            <p className="mt-1 font-display text-xl sm:text-2xl font-bold text-ink">
              {rows.length}
              <span className="ml-2 font-sans text-xs font-normal text-ink-soft">
                ({rows.length - mismatch.length} cocok)
              </span>
            </p>
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Total Saldo Kontrol
            </span>
            <p className="mt-1 font-mono text-sm sm:text-base font-bold text-ink tnum">
              {Money.formatIdr(sum((r) => r.controlBalanceMinor))}
            </p>
          </div>
          <div className="rounded-2xl border border-rule bg-paper p-3.5 shadow-2xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              Total Pembantu
            </span>
            <p className="mt-1 font-mono text-sm sm:text-base font-bold text-ink tnum">
              {Money.formatIdr(sum((r) => r.subledgerTotalMinor))}
            </p>
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <Entrance>
        <div
          data-testid="subledger-verdict"
          className="flex flex-col gap-3 rounded-2xl border border-rule bg-paper p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight text-ink">
              {mismatch.length === 0 ? "Pembukuan rapi — semua cocok" : `${mismatch.length} akun selisih`}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {mismatch.length === 0
                ? `${rows.length} akun kontrol sama dengan total rinciannya.`
                : `Periksa ${mismatch.map((m) => SUBLEDGER_KIND_LABEL[m.kind as keyof typeof SUBLEDGER_KIND_LABEL] ?? m.kind).join(", ")}.`}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              mismatch.length === 0
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
            }`}
          >
            <span className={`size-2 rounded-full ${mismatch.length === 0 ? "bg-emerald-500" : "bg-rose-500"}`} />
            {mismatch.length === 0 ? `${rows.length}/${rows.length} cocok` : "Butuh rekonsiliasi"}
          </span>
        </div>
        </Entrance>
      )}
      <div className="rounded-xl border border-rule overflow-hidden">
        <table className="w-full text-sm tnum">
          <thead>
            <tr className="border-b border-rule bg-canvas/80 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              <th className="text-left px-4 py-3">Buku Pembantu</th>
              <th className="text-right px-4 py-3">Saldo Kontrol</th>
              <th className="text-right px-4 py-3">Total Pembantu</th>
              <th className="text-right px-4 py-3">Selisih</th>
              <th className="text-right px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ok = r.differenceMinor === "0";
              return (
                <tr key={r.kind} data-testid="subledger-row" className="border-b border-rule/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{SUBLEDGER_KIND_LABEL[r.kind as keyof typeof SUBLEDGER_KIND_LABEL] ?? r.kind}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{Money.formatIdr(r.controlBalanceMinor)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{Money.formatIdr(r.subledgerTotalMinor)}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{Money.formatIdr(r.differenceMinor)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Badge variant={ok ? "outline" : "destructive"}>{ok ? "Cocok" : "Selisih"}</Badge>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                  Belum ada akun kontrol terdaftar. Selesaikan onboarding untuk seed registry subledger.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft pt-2">
          Rincian per Akun
        </h2>
        {NAV_ROWS.map((n) => {
          const Icon = n.icon;
          const recon = byKind.get(n.kind);
          return (
            <Link
              key={n.kind}
              href={SUBLEDGER_LIST_ROUTE[n.kind]}
              data-testid={`subledger-nav-${n.kind.toLowerCase()}`}
              className="flex items-center gap-3 rounded-xl border border-rule bg-paper px-4 py-3 transition-colors hover:border-terra/40"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-canvas border border-rule text-terra">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{n.title}</span>
                <span className="block text-xs text-ink-soft truncate">{n.desc}</span>
              </span>
              {recon && (
                <span className="ml-auto shrink-0 text-right">
                  <span className="block font-mono text-sm font-bold text-ink tnum">
                    {Money.formatIdr(recon.controlBalanceMinor)}
                  </span>
                  <span className="block text-[11px] text-ink-soft">saldo kontrol</span>
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-ink-soft" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
