import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterPill {
  value: string;
  label: string;
  href: string;
  active: boolean;
}

/** Bar saring ala Buku Besar: kolom cari (GET) + pil status. Murni server. */
export function FilterBar({
  q,
  keepParams,
  pills,
  searchPlaceholder,
}: {
  q: string;
  keepParams: Record<string, string>;
  pills: FilterPill[];
  searchPlaceholder: string;
}) {
  return (
    <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 rounded-2xl border border-rule bg-paper p-2.5 shadow-2xs">
      <form method="get" className="relative w-full md:max-w-xs" role="search">
        <Search className="absolute left-2.5 top-2 size-3.5 text-ink-soft" />
        {Object.entries(keepParams).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input
          name="q"
          defaultValue={q}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-7.5 w-full rounded-xl border border-rule bg-canvas/60 pl-8 pr-3 text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-1 focus:ring-terra transition-[border-color,box-shadow]"
        />
      </form>
      <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Filter status">
        {pills.map((p) => (
          <Link
            key={p.value}
            href={p.href}
            aria-pressed={p.active}
            className={cn(
              "h-7.5 rounded-xl px-3 text-xs font-medium transition-colors shrink-0 inline-flex items-center focus-ring",
              p.active
                ? "bg-ink text-paper font-semibold shadow-2xs"
                : "text-ink-soft hover:text-ink hover:bg-canvas/50",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
