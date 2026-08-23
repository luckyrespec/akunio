import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { Money } from "@/core/money/money";

export interface PeriodOption { name: string }

export function StatementShell({
  title, periodName, options, children,
}: {
  title: string; periodName: string; options: PeriodOption[];
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-2xl">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/laporan" className="text-xs text-ink-soft underline">
            ← Semua laporan
          </Link>
          <h1 className="font-display text-2xl">{title}</h1>
          <form method="get" className="mt-2 flex items-center gap-2 text-sm">
            <select name="period" defaultValue={periodName}
                    className="h-8 rounded-md border border-rule bg-paper px-2">
              {options.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
            </select>
            <button type="submit" className="rounded-md border border-rule px-2 hover:bg-canvas">
              Tampilkan
            </button>
          </form>
        </div>
        <PrintButton />
      </header>
      <div className="mt-6 rounded-lg border border-rule bg-paper p-6">{children}</div>
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
