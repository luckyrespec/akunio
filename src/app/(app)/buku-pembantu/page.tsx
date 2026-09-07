import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/core/money/money";
import { SUBLEDGER_KIND_LABEL, SUBLEDGER_LIST_ROUTE } from "@/core/subledger/cards";
import { getSubledgerReconAction } from "@/server/actions/subledger.actions";
import { RunCheckButton } from "./run-check-button";
import { Entrance } from "@/components/subsidiary/animated";
import { Package, Users, Store, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_META = {
  PERSEDIAAN: { icon: Package, title: "Kartu Persediaan per SKU", desc: "Mutasi masuk, keluar, dan saldo tiap barang" },
  PIUTANG: { icon: Users, title: "Kartu Piutang per Pelanggan", desc: "Tagihan, pembayaran, dan sisa tiap pelanggan" },
  UTANG: { icon: Store, title: "Kartu Utang per Pemasok", desc: "Tagihan, pelunasan, dan sisa tiap pemasok" },
} as const;

export default async function BukuPembantuPage() {
  const rows = await getSubledgerReconAction();
  const mismatch = rows.filter((r) => r.differenceMinor !== "0");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buku Pembantu"
        eyebrow="Pantau keselarasan akun kontrol dengan rinciannya"
        actions={<RunCheckButton />}
      />
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

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-paper p-8 text-center text-xs text-ink-soft shadow-2xs">
          Belum ada akun kontrol terdaftar. Selesaikan onboarding untuk seed registry subledger.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {rows.map((r) => {
            const meta = KIND_META[r.kind as keyof typeof KIND_META];
            if (!meta) return null;
            const Icon = meta.icon;
            const ok = r.differenceMinor === "0";
            return (
              <Link
                key={r.kind}
                href={SUBLEDGER_LIST_ROUTE[r.kind as keyof typeof SUBLEDGER_LIST_ROUTE]}
                data-testid={`subledger-nav-${r.kind.toLowerCase()}`}
                className={cn(
                  "group flex flex-col gap-3 rounded-2xl border bg-paper p-4 shadow-2xs transition-colors hover:border-terra/40",
                  ok ? "border-rule" : "border-rose-500/40",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-canvas border border-rule text-terra">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink leading-tight">{meta.title}</span>
                    <span className="block text-[11px] text-ink-soft truncate">{meta.desc}</span>
                  </span>
                  <Badge variant={ok ? "outline" : "destructive"}>{ok ? "Cocok" : "Selisih"}</Badge>
                </div>
                <dl className="space-y-1 border-t border-rule/60 pt-3 text-xs tnum">
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-soft">Saldo kontrol</dt>
                    <dd className="font-mono font-bold text-ink">{Money.formatIdr(r.controlBalanceMinor)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-soft">Total pembantu</dt>
                    <dd className="font-mono text-ink">{Money.formatIdr(r.subledgerTotalMinor)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-soft">Selisih</dt>
                    <dd className={cn("font-mono font-bold", ok ? "text-ink-soft" : "text-rose-600 dark:text-rose-400")}>
                      {Money.formatIdr(r.differenceMinor)}
                    </dd>
                  </div>
                </dl>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-terra">
                  Lihat kartu
                  <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
