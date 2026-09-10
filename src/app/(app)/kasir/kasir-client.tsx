"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Minus, Trash2, Printer } from "lucide-react";
import { Money } from "@/core/money/money";
import { checkoutPosSaleAction } from "@/server/actions/pos.actions";
import type { PosPaymentMethod } from "@/server/db/repos/pos.repo";
import { cn } from "@/lib/utils";

export interface KasirCatalogItem {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  appBarcode: string | null;
  unit: string;
  qty: string;
  price: string;
  minStock: string;
}

export interface KasirCashAccount {
  id: string;
  code: string;
  name: string;
}

export interface KasirShift {
  id: string;
  cashAccountId: string;
  cashCode: string;
  cashName: string;
  openedAt: string | null;
}

interface CartRow {
  id: string;
  qty: number;
  unitPriceMinor: bigint;
  discountMinor: bigint;
}

const METHODS: Array<{ id: PosPaymentMethod; label: string }> = [
  { id: "TUNAI", label: "Tunai" },
  { id: "QRIS", label: "QRIS" },
  { id: "TRANSFER", label: "Transfer" },
];

export function KasirClient({
  cashAccounts,
  catalog,
  shifts,
}: {
  cashAccounts: KasirCashAccount[];
  catalog: KasirCatalogItem[];
  shifts: KasirShift[];
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [cart, setCart] = React.useState<CartRow[]>([]);
  const [method, setMethod] = React.useState<PosPaymentMethod>("TUNAI");
  const [cashId, setCashId] = React.useState(cashAccounts[0]?.id ?? "");
  const [cashReceived, setCashReceived] = React.useState("");
  const [buyerName, setBuyerName] = React.useState("");
  const [shiftId, setShiftId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idemRef = React.useRef(crypto.randomUUID());

  const byId = React.useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 24);
    return catalog
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        (c.barcode ?? "").toLowerCase().includes(q) ||
        (c.appBarcode ?? "").includes(q))
      .slice(0, 24);
  }, [catalog, query]);

  function addToCart(item: KasirCatalogItem) {
    if (Number(item.qty) <= 0) return;
    setCart((prev) => {
      const found = prev.find((r) => r.id === item.id);
      if (found) {
        return prev.map((r) => (r.id === item.id ? { ...r, qty: r.qty + 1 } : r));
      }
      return [...prev, { id: item.id, qty: 1, unitPriceMinor: BigInt(item.price), discountMinor: 0n }];
    });
  }

  const subtotal = cart.reduce((a, r) => a + r.unitPriceMinor * BigInt(Math.round(r.qty * 10000)) / 10000n, 0n);
  const discount = cart.reduce((a, r) => a + r.discountMinor, 0n);
  const total = subtotal - discount;

  async function doCheckout() {
    if (cart.length === 0) {
      setError("Keranjang masih kosong.");
      return;
    }
    if (!cashId) {
      setError("Pilih kas / bank penerima.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Teks rupiah ketikan user → minor di client; yang dikirim selalu minor (digit saja).
      let receivedMinor: bigint;
      try {
        receivedMinor = method === "TUNAI" ? Money.parseIdr(cashReceived).minor : total;
      } catch {
        setError("Uang diterima tidak valid. Tulis angka saja, mis. 1500000.");
        return;
      }
      const res = await checkoutPosSaleAction({
        items: cart.map((r) => ({
          itemId: r.id,
          qty: r.qty,
          unitPriceMinor: r.unitPriceMinor.toString(),
          discountMinor: r.discountMinor.toString(),
        })),
        paymentMethod: method,
        cashAccountId: cashId,
        cashReceivedMinor: receivedMinor.toString(),
        buyerName: buyerName.trim() || undefined,
        shiftId: shiftId || null,
        idempotencyKey: idemRef.current,
      });
      if (!res.ok) throw new Error(res.error);
      idemRef.current = crypto.randomUUID();
      router.push(`/kasir/struk/${res.data.saleId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan penjualan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border border-rule bg-paper p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            data-testid="kasir-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, SKU, atau scan barcode..."
            className="h-10 w-full rounded-xl border border-rule bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft/60 focus-ring"
          />
        </label>
        <div data-testid="kasir-grid" data-catalog-count={catalog.length} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filtered.map((c) => {
            const stock = Number(c.qty);
            const low = stock <= Number(c.minStock);
            const empty = stock <= 0;
            return (
              <button
                key={c.id}
                type="button"
                data-testid={`kasir-item-${c.code}`}
                disabled={empty}
                onClick={() => addToCart(c)}
                className={cn(
                  "rounded-xl border border-rule bg-canvas p-3 text-left transition-colors",
                  empty ? "opacity-45" : "hover:border-terra/50 hover:shadow-2xs",
                )}
              >
                <p className="truncate text-xs font-semibold text-ink">{c.name}</p>
                <p className="mt-0.5 font-mono text-[10px] text-ink-soft">{c.code}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="tnum text-xs font-bold text-terra">{Money.formatIdr(c.price)}</span>
                  <span className={cn(
                    "tnum text-[10px]",
                    empty ? "font-semibold text-red-600" : low ? "font-semibold text-amber-600" : "text-ink-soft",
                  )}>
                    {empty ? "Habis" : `Stok ${stock}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="mt-4 text-center text-xs text-ink-soft">Barang tidak ditemukan. Tambah dulu di Persediaan.</p>
        )}
      </div>

      <div className="h-fit rounded-xl border border-rule bg-paper p-4 lg:sticky lg:top-4">
        <h2 className="text-sm font-semibold text-ink">Keranjang</h2>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {cart.length === 0 && <p className="text-xs text-ink-soft">Belum ada barang. Klik barang di kiri.</p>}
          {cart.map((r) => {
            const item = byId.get(r.id)!;
            return (
              <div key={r.id} data-testid={`kasir-cart-row-${item.code}`} className="rounded-lg border border-rule/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-ink">{item.name}</p>
                  <button
                    type="button"
                    aria-label={`Hapus ${item.name}`}
                    onClick={() => setCart((prev) => prev.filter((x) => x.id !== r.id))}
                    className="text-ink-soft hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid={`kasir-qty-minus-${item.code}`}
                      onClick={() => setCart((prev) => prev.map((x) => (x.id === r.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}
                      className="rounded-md border border-rule px-1.5 py-0.5 text-ink-soft hover:text-ink"
                    >
                      <Minus className="size-3" />
                    </button>
                    <span className="tnum min-w-8 text-center text-xs font-semibold">{r.qty}</span>
                    <button
                      type="button"
                      data-testid={`kasir-qty-plus-${item.code}`}
                      onClick={() => setCart((prev) => prev.map((x) => (x.id === r.id ? { ...x, qty: x.qty + 1 } : x)))}
                      className="rounded-md border border-rule px-1.5 py-0.5 text-ink-soft hover:text-ink"
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                  <span className="tnum text-xs font-semibold text-ink">
                    {Money.formatIdr(r.unitPriceMinor * BigInt(Math.round(r.qty * 10000)) / 10000n)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 space-y-2 border-t border-rule/70 pt-3">
          <div className="grid grid-cols-3 gap-1.5">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                data-testid={`kasir-pay-${m.id}`}
                onClick={() => setMethod(m.id)}
                className={cn(
                  "h-8 rounded-lg border text-xs font-semibold transition-colors",
                  method === m.id
                    ? "border-terra bg-terra/15 text-terra"
                    : "border-rule text-ink-soft hover:text-ink",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Kas / bank penerima</span>
            <select
              value={cashId}
              onChange={(e) => setCashId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
            >
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Shift (opsional)</span>
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
            >
              <option value="">Tanpa shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.cashCode} · buka {s.openedAt?.slice(0, 16).replace("T", " ") ?? ""}</option>
              ))}
            </select>
          </label>
          {method === "TUNAI" && (
            <label className="block">
              <span className="text-[11px] font-medium text-ink-soft">Uang diterima</span>
              <input
                data-testid="kasir-cash-received"
                value={cashReceived}
                onChange={(e) => setCashReceived(e.target.value)}
                inputMode="numeric"
                placeholder="cth 100000"
                className="tnum mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
              />
            </label>
          )}
          <label className="block">
            <span className="text-[11px] font-medium text-ink-soft">Nama pembeli (opsional)</span>
            <input
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="cth Pelanggan"
              className="mt-1 h-9 w-full rounded-lg border border-rule bg-canvas px-2 text-xs text-ink"
            />
          </label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">Total</span>
            <span className="tnum text-base font-bold text-ink">{Money.formatIdr(total)}</span>
          </div>
          {error && <p data-testid="kasir-error" className="text-xs font-medium text-red-600">{error}</p>}
          <button
            type="button"
            data-testid="kasir-submit"
            disabled={loading || cart.length === 0}
            onClick={doCheckout}
            className="h-9 w-full rounded-xl bg-terra text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : `Bayar ${Money.formatIdr(total)}`}
          </button>
          <Link
            href="/kas-bank/pembayaran/baru"
            className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-ink-soft hover:text-terra"
          >
            <Printer className="size-3" /> Belanja operasional? Catat di Pembayaran
          </Link>
        </div>
      </div>
    </div>
  );
}
