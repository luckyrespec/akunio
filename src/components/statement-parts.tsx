import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/motion";
import { Money } from "@/core/money/money";

export interface PeriodOption { name: string }

export function StatementShell({
  title, periodName, options, children,
}: {
  title: string; periodName: string; options: PeriodOption[];
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-4">
        <Link href="/laporan" className="inline-flex items-center text-xs font-medium text-ink-soft hover:text-terra transition-colors">
          ← Kembali ke Semua Laporan
        </Link>
      </div>
      <div>
        <PageHeader title={title} eyebrow="IFRS untuk SME" actions={<PrintButton />} />
      </div>
      <form method="get" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="period-select" className="text-xs font-medium text-ink-soft">
            Periode:
          </label>
          <select id="period-select" name="period" defaultValue={periodName}
                  className="h-9 min-w-[200px] rounded-lg border border-border/80 bg-paper px-3 text-sm text-foreground shadow-xs transition-colors hover:border-ring/60 focus:ring-2 focus:ring-ring/30 focus:outline-none dark:bg-input/20">
            {options.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-lg border border-border/80 bg-paper px-3.5 text-xs font-medium text-foreground shadow-xs hover:bg-canvas transition-colors">
          Tampilkan
        </button>
      </form>
      <Reveal delay={0.08}>
      <div className="mt-6 rounded-2xl border border-rule bg-paper p-6 sm:p-8 shadow-xs">{children}</div>
      </Reveal>
    </section>
  );
}

export function ReportRowView({
  label, minor, bold, indent,
}: { label: string; minor: bigint; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${indent ? "pl-4" : ""} ${bold ? "font-medium" : ""}`}>
      <span>{label}</span>
      <span className="tnum">{Money.fromMinor(minor).formatIdr()}</span>
    </div>
  );
}
