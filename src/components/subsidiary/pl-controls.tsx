"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlControlsProps {
  periodName: string;
  periodEndsOn?: string;
  options: { name: string }[];
  enableCumulative?: boolean;
}

export function PlControls({ periodName, periodEndsOn, options, enableCumulative = false }: PlControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const cumulative = searchParams.get("mode") === "ytd";
  const shortMonth = periodEndsOn
    ? new Intl.DateTimeFormat("id-ID", { month: "short" }).format(new Date(`${periodEndsOn}T00:00:00`))
    : "";

  const push = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div
      aria-busy={isPending}
      className="flex flex-col gap-3 rounded-2xl border border-rule bg-paper p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-2.5">
        <Calendar className="size-4 text-terra" />
        <select
          aria-label="Periode pembukuan"
          value={periodName}
          disabled={isPending}
          onChange={(e) => push((p) => p.set("period", e.target.value))}
          className="h-9 rounded-xl border-2 border-rule bg-canvas px-3 text-xs font-bold text-ink shadow-2xs hover:border-terra focus:border-terra focus:outline-none focus:ring-2 focus:ring-terra/30 disabled:opacity-50 cursor-pointer transition-colors"
        >
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              Periode {o.name}
            </option>
          ))}
        </select>
        {isPending && <Loader2 className="size-3.5 animate-spin text-terra" />}
      </div>

      {enableCumulative && (
        <div
          role="group"
          aria-label="Rentang kartu"
          className="grid grid-cols-2 gap-1 rounded-xl border-2 border-rule bg-canvas p-1"
        >
          <button
            type="button"
            aria-pressed={!cumulative}
            disabled={isPending}
            onClick={() => push((p) => p.delete("mode"))}
            className={cn(
              "focus-ring h-8 rounded-lg px-3 text-[11px] font-bold transition-colors active:scale-[0.98] disabled:opacity-50",
              !cumulative ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
            )}
          >
            Bulan Terpilih
          </button>
          <button
            type="button"
            aria-pressed={cumulative}
            disabled={isPending}
            onClick={() => push((p) => p.set("mode", "ytd"))}
            className={cn(
              "focus-ring h-8 rounded-lg px-3 text-[11px] font-bold transition-colors active:scale-[0.98] disabled:opacity-50",
              cumulative ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
            )}
          >
            Kumulatif Jan{shortMonth ? `–${shortMonth}` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
