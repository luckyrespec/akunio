import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { SUBLEDGER_KIND_LABEL, SUBLEDGER_LIST_ROUTE } from "@/core/subledger/cards";
import { getSubledgerReconAction } from "@/server/actions/subledger.actions";
import { RunCheckButton } from "./run-check-button";
import { Package, Users, Store, ChevronRight } from "lucide-react";

const NAV_ROWS = [
  { kind: "PERSEDIAAN" as const, icon: Package, title: "Kartu Persediaan per SKU", desc: "Mutasi masuk, keluar, dan saldo tiap barang" },
  { kind: "PIUTANG" as const, icon: Users, title: "Kartu Piutang per Pelanggan", desc: "Tagihan, pembayaran, dan sisa tiap pelanggan" },
  { kind: "UTANG" as const, icon: Store, title: "Kartu Utang per Pemasok", desc: "Tagihan, pelunasan, dan sisa tiap pemasok" },
];

export default async function BukuPembantuPage() {
  const rows = await getSubledgerReconAction();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buku Pembantu"
        eyebrow="Total rincian vs saldo akun kontrol — harus nol selisih"
        actions={<RunCheckButton />}
      />
      <div className="rounded-xl border border-rule overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase text-ink-soft border-b border-rule">
              <th className="text-left font-semibold px-4 py-2">Buku Pembantu</th>
              <th className="text-right font-semibold px-4 py-2">Saldo Kontrol</th>
              <th className="text-right font-semibold px-4 py-2">Total Pembantu</th>
              <th className="text-right font-semibold px-4 py-2">Selisih</th>
              <th className="text-right font-semibold px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ok = r.differenceMinor === "0";
              return (
                <tr key={r.kind} data-testid="subledger-row" className="border-b border-rule/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{SUBLEDGER_KIND_LABEL[r.kind as keyof typeof SUBLEDGER_KIND_LABEL] ?? r.kind}</td>
                  <td className="px-4 py-2.5 text-right tnum">{Money.formatIdr(r.controlBalanceMinor)}</td>
                  <td className="px-4 py-2.5 text-right tnum">{Money.formatIdr(r.subledgerTotalMinor)}</td>
                  <td className="px-4 py-2.5 text-right tnum">{Money.formatIdr(r.differenceMinor)}</td>
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
              <ChevronRight className="size-4 ml-auto shrink-0 text-ink-soft" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
