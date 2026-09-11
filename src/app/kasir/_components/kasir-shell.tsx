"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Money } from "@/core/money/money";
import { checkoutPosSaleAction } from "@/server/actions/pos.actions";
import type { PosPaymentMethod } from "@/server/db/repos/pos.repo";
import { PosTopbar } from "./pos-topbar";
import { ProductGrid } from "./product-grid";
import { CartPanel } from "./cart-panel";
import type { CartRow, KasirCashAccount, KasirCatalogItem, KasirShift } from "./types";

export function KasirShell({
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
  const [category, setCategory] = React.useState("Semua");
  const [cart, setCart] = React.useState<CartRow[]>([]);
  const [method, setMethod] = React.useState<PosPaymentMethod>("TUNAI");
  const [cashId, setCashId] = React.useState(cashAccounts[0]?.id ?? "");
  const [cashReceived, setCashReceived] = React.useState("");
  const [buyerName, setBuyerName] = React.useState("");
  const [shiftId, setShiftId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idemRef = React.useRef(crypto.randomUUID());

  // Preselect shift bila hanya satu yang terbuka — kasir sibuk tak boleh lupa memilih.
  React.useEffect(() => {
    if (!shiftId && shifts.length === 1) setShiftId(shifts[0].id);
  }, [shifts, shiftId]);

  const byId = React.useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

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

  function changeQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((r) => (r.id === id ? { ...r, qty: Math.max(1, r.qty + delta) } : r)),
    );
  }

  function removeRow(id: string) {
    setCart((prev) => prev.filter((r) => r.id !== id));
  }

  const subtotal = cart.reduce((a, r) => a + (r.unitPriceMinor * BigInt(Math.round(r.qty * 10000))) / 10000n, 0n);
  const discount = cart.reduce((a, r) => a + r.discountMinor, 0n);
  const total = subtotal - discount;

  // Syarat bayar versi shell (cermin CartPanel.canPay) untuk shortcut keyboard.
  function shellCanPay(): boolean {
    if (loading || cart.length === 0) return false;
    if (method !== "TUNAI") return true;
    try {
      return Money.parseIdr(cashReceived).minor >= total;
    } catch {
      return false;
    }
  }

  const activeShift = shifts.find((s) => s.id === shiftId);
  const shiftLabel = activeShift
    ? `Shift ${activeShift.cashCode} · ${activeShift.cashName}`
    : "Tanpa shift";

  // Shortcut kasir: "/" fokus search, Enter bayar (di luar input teks), Escape blur.
  // Guard ganda via shellCanPay + loading agar tak ada double-submit.
  const payRef = React.useRef(() => {});
  payRef.current = () => {
    if (shellCanPay()) void doCheckout();
  };
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("kasir-search")?.focus();
      } else if (e.key === "Escape" && typing) {
        t?.blur();
      } else if (e.key === "Enter" && !typing) {
        e.preventDefault();
        payRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <PosTopbar shiftLabel={shiftLabel} />
      <div id="kasir-utama" className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <ProductGrid
          catalog={catalog}
          query={query}
          onQuery={setQuery}
          category={category}
          onCategory={setCategory}
          onAdd={addToCart}
        />
        {/* minor → rupiah utuh: JANGAN kirim minor mentah ke input/parseIdr (inflasi 100×). */}
        <CartPanel
          cart={cart}
          byId={byId}
          onQty={changeQty}
          onRemove={removeRow}
          method={method}
          onMethod={setMethod}
          cashAccounts={cashAccounts}
          cashId={cashId}
          onCashId={setCashId}
          shifts={shifts}
          shiftId={shiftId}
          onShiftId={setShiftId}
          cashReceived={cashReceived}
          onCashReceived={setCashReceived}
          onQuickCash={(minor) => setCashReceived((minor / 100n).toString())}
          buyerName={buyerName}
          onBuyerName={setBuyerName}
          total={total}
          loading={loading}
          error={error}
          onSubmit={doCheckout}
        />
      </div>
    </div>
  );
}
