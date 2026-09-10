"use client";

import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Money } from "@/core/money/money";
import { cn } from "@/lib/utils";
import type { CartRow, KasirCashAccount, KasirCatalogItem, KasirShift } from "./types";
import type { PosPaymentMethod } from "@/server/db/repos/pos.repo";

const METHODS: Array<{ id: PosPaymentMethod; label: string }> = [
  { id: "TUNAI", label: "Tunai" },
  { id: "QRIS", label: "QRIS" },
  { id: "TRANSFER", label: "Transfer" },
];

const QUICK_CASH = [10_000n, 20_000n, 50_000n, 100_000n, 200_000n];

function lineTotal(r: CartRow): bigint {
  return (r.unitPriceMinor * BigInt(Math.round(r.qty * 10000))) / 10000n - r.discountMinor;
}

export function CartPanel({
  cart,
  byId,
  onQty,
  onRemove,
  method,
  onMethod,
  cashAccounts,
  cashId,
  onCashId,
  shifts,
  shiftId,
  onShiftId,
  cashReceived,
  onCashReceived,
  onQuickCash,
  buyerName,
  onBuyerName,
  total,
  loading,
  error,
  onSubmit,
}: {
  cart: CartRow[];
  byId: Map<string, KasirCatalogItem>;
  onQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  method: PosPaymentMethod;
  onMethod: (m: PosPaymentMethod) => void;
  cashAccounts: KasirCashAccount[];
  cashId: string;
  onCashId: (id: string) => void;
  shifts: KasirShift[];
  shiftId: string;
  onShiftId: (id: string) => void;
  cashReceived: string;
  onCashReceived: (v: string) => void;
  onQuickCash: (minor: bigint) => void;
  buyerName: string;
  onBuyerName: (v: string) => void;
  total: bigint;
  loading: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const count = cart.reduce((a, r) => a + r.qty, 0);
  const quickOptions = QUICK_CASH.filter((d) => d >= total).slice(0, 4);

  return (
    <aside className="flex min-h-0 w-full flex-col border-t border-rule bg-paper lg:w-[400px] lg:shrink-0 lg:border-l lg:border-t-0">
      <div className="flex shrink-0 items-center justify-between border-b border-rule/60 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-ink">
          Keranjang
          <span className="tnum ml-1.5 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold text-ink-soft">
            {count}
          </span>
        </h2>
        <span className="tnum text-base font-bold text-ink">{Money.formatIdr(total)}</span>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {cart.length === 0 && (
          <p className="py-6 text-center text-xs text-ink-soft">
            Belum ada barang. Klik barang di kiri atau scan barcode.
          </p>
        )}
        {cart.map((r) => {
          const item = byId.get(r.id)!;
          return (
            <div key={r.id} data-testid={`kasir-cart-row-${item.code}`} className="rounded-xl border border-rule/70 bg-canvas/40 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-ink">{item.name}</p>
                <button
                  type="button"
                  aria-label={`Hapus ${item.name}`}
                  onClick={() => onRemove(r.id)}
                  className="shrink-0 text-ink-soft transition-colors hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid={`kasir-qty-minus-${item.code}`}
                    onClick={() => onQty(r.id, -1)}
                    className="rounded-md border border-rule bg-paper px-1.5 py-1 text-ink-soft transition-colors hover:text-ink"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="tnum min-w-8 text-center text-xs font-bold">{r.qty}</span>
                  <button
                    type="button"
                    data-testid={`kasir-qty-plus-${item.code}`}
                    onClick={() => onQty(r.id, 1)}
                    className="rounded-md border border-rule bg-paper px-1.5 py-1 text-ink-soft transition-colors hover:text-ink"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <span className="tnum text-xs font-bold text-ink">{Money.formatIdr(lineTotal(r))}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 space-y-2.5 border-t border-rule/70 p-3">
        <div className="grid grid-cols-3 gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              data-testid={`kasir-pay-${m.id}`}
              onClick={() => onMethod(m.id)}
              className={cn(
                "h-9 rounded-lg border text-xs font-bold transition-colors",
                method === m.id
                  ? "border-terra bg-terra/15 text-terra"
                  : "border-rule text-ink-soft hover:text-ink",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Kas penerima</span>
            <select
              value={cashId}
              onChange={(e) => onCashId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
            >
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Shift</span>
            <select
              value={shiftId}
              onChange={(e) => onShiftId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
            >
              <option value="">Tanpa shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.cashCode} · buka {s.openedAt?.slice(0, 16).replace("T", " ") ?? ""}</option>
              ))}
            </select>
          </label>
        </div>

        {method === "TUNAI" ? (
          <div>
            <label className="block">
              <span className="text-[11px] font-medium text-ink-soft">Uang diterima</span>
              <input
                data-testid="kasir-cash-received"
                value={cashReceived}
                onChange={(e) => onCashReceived(e.target.value)}
                inputMode="numeric"
                placeholder="cth 100000"
                className="tnum mt-1 h-10 w-full rounded-lg border border-rule bg-canvas px-2.5 text-sm font-bold text-ink"
              />
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="kasir-quick-cash-pas"
                onClick={() => onQuickCash(total)}
                className="h-7 rounded-full border border-terra/40 bg-terra/10 px-3 text-[11px] font-bold text-terra transition-colors hover:bg-terra/20"
              >
                Uang Pas
              </button>
              {quickOptions.map((d) => (
                <button
                  key={d.toString()}
                  type="button"
                  data-testid={`kasir-quick-cash-${d.toString()}`}
                  onClick={() => onQuickCash(d)}
                  className="tnum h-7 rounded-full border border-rule px-3 text-[11px] font-semibold text-ink-soft transition-colors hover:text-ink"
                >
                  {Money.formatIdr(d)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-canvas px-2.5 py-2 text-[11px] text-ink-soft">
            {method} otomatis uang pas — {Money.formatIdr(total)}.
          </p>
        )}

        <label className="block">
          <span className="text-[11px] font-medium text-ink-soft">Nama pembeli (opsional)</span>
          <input
            value={buyerName}
            onChange={(e) => onBuyerName(e.target.value)}
            placeholder="cth Pelanggan"
            className="mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
          />
        </label>

        <div className="flex items-center justify-between border-t border-dashed border-rule pt-2">
          <span className="text-xs text-ink-soft">Total bayar</span>
          <span className="tnum font-display text-xl font-bold text-ink">{Money.formatIdr(total)}</span>
        </div>
        {error && <p data-testid="kasir-error" className="text-xs font-medium text-red-600">{error}</p>}
        <button
          type="button"
          data-testid="kasir-submit"
          disabled={loading || cart.length === 0}
          onClick={onSubmit}
          className="h-11 w-full rounded-xl bg-terra text-sm font-bold text-paper shadow-xs transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Menyimpan..." : `Bayar ${Money.formatIdr(total)}`}
        </button>
        <Link
          href="/kas-bank/pembayaran/baru"
          className="block text-center text-[11px] font-medium text-ink-soft hover:text-terra"
        >
          Belanja operasional? Catat di Pembayaran
        </Link>
      </div>
    </aside>
  );
}
