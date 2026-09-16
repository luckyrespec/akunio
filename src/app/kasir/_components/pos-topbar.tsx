"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const DATE_FMT = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME_FMT = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
});

export function PosTopbar({ shiftLabel }: { shiftLabel: string }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-rule bg-paper px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">Kasir</p>
        <span className="max-w-32 truncate rounded-full border border-rule bg-canvas px-2.5 py-0.5 text-[11px] font-medium text-ink-soft">
          {shiftLabel}
        </span>
        <span className="tnum hidden text-[11px] text-ink-soft sm:inline">
          {DATE_FMT.format(now)}
        </span>
        <span className="tnum text-[11px] font-semibold text-ink-soft">
          {TIME_FMT.format(now)}
        </span>
      </div>
      <Link
        data-testid="kasir-back"
        href="/dashboard"
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-rule bg-paper px-3.5 text-xs font-semibold text-ink transition-colors hover:bg-canvas"
      >
        <ArrowLeft className="size-3.5" />
        Dashboard
      </Link>
    </header>
  );
}
