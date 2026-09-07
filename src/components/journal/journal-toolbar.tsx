"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/use-debounce";
import { DEFAULT_DEBOUNCE_MS } from "@/lib/constants";

const LIMITS = [10, 25, 50];

export function JournalToolbar({
  defaultQuery,
  defaultLimit,
}: {
  defaultQuery: string;
  defaultLimit: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(defaultQuery);
  const debouncedQuery = useDebounce(query, DEFAULT_DEBOUNCE_MS);
  const isFirstMount = useRef(true);

  function apply(next: { q?: string; limit?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q.trim()) params.set("q", next.q.trim());
      else params.delete("q");
    }
    if (next.limit !== undefined) params.set("limit", String(next.limit));
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  // Update query state when defaultQuery from URL changes
  useEffect(() => {
    setQuery(defaultQuery);
  }, [defaultQuery]);

  // Trigger search on debounced query change
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
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: query });
      }}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nomor, keterangan, atau akun…"
          className="border-rule bg-paper pl-9"
          aria-label="Cari jurnal"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm" className="border-rule">
          Cari
        </Button>
        {defaultQuery && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-ink-soft"
            onClick={() => {
              setQuery("");
              apply({ q: "" });
            }}
          >
            Reset
          </Button>
        )}
        <label htmlFor="jurnal-limit" className="whitespace-nowrap text-xs text-ink-soft">
          Baris:
        </label>
        <select
          id="jurnal-limit"
          value={defaultLimit}
          onChange={(e) => apply({ limit: Number(e.target.value) })}
          className="h-9 rounded-lg border border-rule bg-paper px-2 text-xs text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra"
        >
          {LIMITS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
    </form>
  );
}
