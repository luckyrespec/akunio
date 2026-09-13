"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { DEFAULT_DEBOUNCE_MS } from "@/lib/constants";

const LIMITS = [10, 25, 50];

export type OpnameStatusTab =
  | "ALL"
  | "DRAFT"
  | "REVIEW_DRAFT_JOURNAL"
  | "COMPLETED"
  | "CANCELLED";

export interface OpnameToolbarCounts {
  all: number;
  draft: number;
  review: number;
  completed: number;
  cancelled: number;
}

const STATUS_TABS: Array<{ key: OpnameStatusTab; label: string; countKey: keyof OpnameToolbarCounts }> = [
  { key: "ALL", label: "Semua", countKey: "all" },
  { key: "DRAFT", label: "Draf", countKey: "draft" },
  { key: "REVIEW_DRAFT_JOURNAL", label: "Draf Jurnal", countKey: "review" },
  { key: "COMPLETED", label: "Selesai", countKey: "completed" },
  { key: "CANCELLED", label: "Dibatalkan", countKey: "cancelled" },
];

export function OpnameToolbar({
  defaultQuery,
  defaultStatus,
  defaultLimit,
  counts,
}: {
  defaultQuery: string;
  defaultStatus: OpnameStatusTab;
  defaultLimit: number;
  counts: OpnameToolbarCounts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(defaultQuery);
  const debouncedQuery = useDebounce(query, DEFAULT_DEBOUNCE_MS);
  const isFirstMount = useRef(true);
  const [isPending, startTransition] = useTransition();
  const reduce = useReducedMotion();

  function apply(next: { q?: string; status?: OpnameStatusTab; limit?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q.trim()) params.set("q", next.q.trim());
      else params.delete("q");
    }
    if (next.status !== undefined) {
      if (next.status === "ALL") params.delete("status");
      else params.set("status", next.status);
    }
    if (next.limit !== undefined) params.set("limit", String(next.limit));
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const currentQ = searchParams.get("q") ?? "";
    if (debouncedQuery.trim() !== currentQ.trim()) {
      apply({ q: debouncedQuery });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nomor sesi atau catatan..."
          aria-label="Cari sesi opname"
          className="h-9 border-rule bg-paper pl-9"
        />
        {isPending && (
          <Loader2
            aria-hidden
            className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-ink-soft"
          />
        )}
      </div>

      <div className={cn("flex flex-wrap items-center gap-1.5", isPending && "opacity-70")}>
        {STATUS_TABS.map((s) => {
          const active = defaultStatus === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ status: s.key })}
              className={cn(
                "relative rounded-lg px-3 py-1.5 font-mono text-xs font-medium transition-colors",
                active ? "text-terra" : "border border-rule bg-canvas text-ink-soft hover:text-ink",
              )}
            >
              {active && (
                <motion.span
                  layoutId="opname-status-active"
                  transition={reduce ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 rounded-lg bg-ink"
                />
              )}
              <span className={cn("relative z-10", active && "text-paper")}>{s.label} ({counts[s.countKey]})</span>
            </button>
          );
        })}

        <label htmlFor="opname-limit" className="ml-auto whitespace-nowrap text-xs text-ink-soft">
          Baris:
        </label>
        <select
          id="opname-limit"
          value={defaultLimit}
          onChange={(e) => apply({ limit: Number(e.target.value) })}
          className="h-9 rounded-lg border border-rule bg-paper px-2 text-xs text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra"
        >
          {LIMITS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
