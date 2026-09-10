"use client";

import Link from "next/link";
import { Printer, Share2, Plus } from "lucide-react";
import { Money } from "@/core/money/money";

export function StrukActions({
  number,
  soldDate,
  paymentMethod,
  total,
  items,
}: {
  number: string;
  soldDate: string;
  paymentMethod: string;
  total: string;
  items: Array<{ code: string; name: string; qty: string; unitPrice: string; lineTotal: string }>;
}) {
  const waText = [
    "Terima kasih sudah berbelanja!",
    `${number} · ${soldDate}`,
    ...items.map((it) => `${it.name} x${it.qty} ${Money.formatIdr(BigInt(it.lineTotal))}`),
    `Total ${Money.formatIdr(BigInt(total))} (${paymentMethod})`,
  ].join("\n");

  return (
    <div className="mt-4 flex gap-2 print:hidden">
      <button
        type="button"
        data-testid="kasir-print"
        onClick={() => window.print()}
        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rule text-xs font-semibold text-ink hover:bg-canvas"
      >
        <Printer className="size-3.5" /> Cetak
      </button>
      <a
        data-testid="kasir-wa-share"
        href={`https://wa.me/?text=${encodeURIComponent(waText)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-rule text-xs font-semibold text-ink hover:bg-canvas"
      >
        <Share2 className="size-3.5" /> WA
      </a>
      <Link
        data-testid="kasir-new-sale"
        href="/kasir"
        className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-terra text-xs font-semibold text-paper hover:opacity-90"
      >
        <Plus className="size-3.5" /> Baru
      </Link>
    </div>
  );
}
