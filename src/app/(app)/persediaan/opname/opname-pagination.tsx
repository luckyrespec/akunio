"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { OpnameStatusTab } from "./opname-toolbar";

const DEFAULT_LIMIT = 25;

function pageHref(q: string, status: OpnameStatusTab, limit: number, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status !== "ALL") params.set("status", status);
  if (limit !== DEFAULT_LIMIT) params.set("limit", String(limit));
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `/persediaan/opname?${s}` : "/persediaan/opname";
}

/** Umpan balik navigasi: label diredupkan + spinner kecil selama halaman tujuan dimuat. */
function PendingLabel({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="relative inline-flex items-center justify-center">
      <span className={pending ? "opacity-30" : undefined}>{children}</span>
      {pending && <Loader2 aria-hidden className="absolute size-3 animate-spin" />}
    </span>
  );
}

export function OpnamePagination({
  q,
  status,
  limit,
  page,
  totalPages,
  total,
  from,
  to,
}: {
  q: string;
  status: OpnameStatusTab;
  limit: number;
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
}) {
  if (total === 0) return null;

  const nums = [1, totalPages, page - 1, page, page + 1]
    .filter((p, i, a) => p >= 1 && p <= totalPages && a.indexOf(p) === i)
    .sort((a, b) => a - b);
  const trail: (number | "…")[] = [];
  nums.forEach((p, i) => {
    if (i > 0 && p - nums[i - 1]! > 1) trail.push("…");
    trail.push(p);
  });

  return (
    <nav
      className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between"
      aria-label="Navigasi halaman opname"
    >
      <p className="text-xs text-ink-soft">
        Menampilkan {from}–{to} dari {total} sesi{q ? ` untuk “${q}”` : ""}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <PageLink
            href={pageHref(q, status, limit, page - 1)}
            disabled={page <= 1}
            label={<ChevronLeft className="size-3.5" />}
            aria="Halaman sebelumnya"
          />
          {trail.map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 text-xs text-ink-soft">
                …
              </span>
            ) : (
              <PageLink
                key={p}
                href={pageHref(q, status, limit, p)}
                active={p === page}
                label={String(p)}
              />
            ),
          )}
          <PageLink
            href={pageHref(q, status, limit, page + 1)}
            disabled={page >= totalPages}
            label={<ChevronRight className="size-3.5" />}
            aria="Halaman berikutnya"
          />
        </div>
      )}
    </nav>
  );
}

function PageLink({
  href,
  label,
  active,
  disabled,
  aria,
}: {
  href: string;
  label: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  aria?: string;
}) {
  if (disabled) {
    return (
      <span
        aria-hidden
        className="rounded-lg border border-rule/60 px-2.5 py-1.5 text-xs text-ink-soft/40"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={aria}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? "border-terra bg-terra font-semibold text-white"
          : "border-rule bg-paper text-ink hover:bg-canvas"
      }`}
    >
      <PendingLabel>{label}</PendingLabel>
    </Link>
  );
}
