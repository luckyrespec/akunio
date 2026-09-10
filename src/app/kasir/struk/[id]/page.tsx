import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Money } from "@/core/money/money";
import { getPosSaleAction } from "@/server/actions/pos.actions";
import { StrukActions } from "./struk-actions";

export const metadata = {
  title: "Struk Penjualan | Akunio",
};

export default async function StrukPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getPosSaleAction(id);

  return (
    <section className="mx-auto w-full max-w-md space-y-4 px-4 sm:px-0">
      <div className="print:hidden">
        <Link
          href="/kasir"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Kasir
        </Link>
      </div>

      {!res.ok && <p className="rounded-xl border border-rule bg-paper p-4 text-sm text-red-600">{res.error}</p>}

      {res.ok && (
        <div data-testid="kasir-receipt" className="rounded-xl border border-rule bg-paper p-5">
          <p className="text-center font-display text-lg font-semibold text-ink">Struk Penjualan</p>
          <p className="mt-1 text-center font-mono text-xs text-ink-soft">{res.data.number}</p>
          <p className="text-center text-[11px] text-ink-soft">
            {res.data.soldDate} · {res.data.paymentMethod}
            {res.data.buyerName ? ` · ${res.data.buyerName}` : ""}
          </p>
          <div className="my-3 border-t border-dashed border-rule" />
          <ul className="space-y-2">
            {res.data.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-xs">
                <div>
                  <p className="font-medium text-ink">{it.name}</p>
                  <p className="tnum text-ink-soft">
                    {it.qty} × {Money.formatIdr(BigInt(it.unitPrice))}
                  </p>
                </div>
                <span className="tnum font-semibold text-ink">{Money.formatIdr(BigInt(it.lineTotal))}</span>
              </li>
            ))}
          </ul>
          <div className="my-3 border-t border-dashed border-rule" />
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Total</dt>
              <dd className="tnum text-sm font-bold text-ink">{Money.formatIdr(BigInt(res.data.total))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Diterima</dt>
              <dd className="tnum text-ink">{Money.formatIdr(BigInt(res.data.cashReceived))}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Kembalian</dt>
              <dd className="tnum text-ink">{Money.formatIdr(BigInt(res.data.change))}</dd>
            </div>
            {res.data.journalNumber && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">Jurnal</dt>
                <dd className="font-mono text-ink">{res.data.journalNumber}</dd>
              </div>
            )}
          </dl>

          <StrukActions
            number={res.data.number}
            soldDate={res.data.soldDate}
            paymentMethod={res.data.paymentMethod}
            total={res.data.total}
            items={res.data.items}
          />
        </div>
      )}
    </section>
  );
}
