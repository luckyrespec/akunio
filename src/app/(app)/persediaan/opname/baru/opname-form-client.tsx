"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/core/money/money";
import { createStockOpnameAction } from "@/server/actions/inventory.actions";

interface Props {
  items: Array<{
    id: string;
    code: string;
    name: string;
    unit: string;
    currentQty: string;
    averageCostMinor: bigint;
  }>;
}

export function OpnameFormClient({ items }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [opnameDate, setOpnameDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");

  const [counts, setCounts] = useState<
    Record<string, { physicalQty: number; reason: string }>
  >(() => {
    const init: Record<string, { physicalQty: number; reason: string }> = {};
    for (const it of items) {
      init[it.id] = { physicalQty: Number(it.currentQty), reason: "" };
    }
    return init;
  });

  const handleQtyChange = (itemId: string, val: number) => {
    setCounts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], physicalQty: val },
    }));
  };

  const handleReasonChange = (itemId: string, reason: string) => {
    setCounts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], reason },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payloadItems = items.map((it) => ({
      itemId: it.id,
      physicalQty: counts[it.id]?.physicalQty ?? Number(it.currentQty),
      reason: counts[it.id]?.reason || undefined,
    }));

    startTransition(async () => {
      const res = await createStockOpnameAction({
        opnameDate,
        notes,
        items: payloadItems,
      });

      if (!res.ok) {
        setError(res.error || "Gagal menyimpan lembar opname");
      } else {
        router.push(`/persediaan/opname/${res.opnameId}`);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/persediaan/opname">
            <Button variant="ghost" size="sm" className="h-8 px-2" type="button">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Kembali
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-serif tracking-tight text-[var(--color-tinta)]">
              Lembar Hitung Stok Opname
            </h1>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Isi hasil perhitungan fisik aktual di gudang per item.
            </p>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="bg-[var(--color-tinta)] text-[var(--color-paper)] hover:opacity-90"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1.5" />
          )}
          Simpan Sesi Opname
        </Button>
      </div>

      {error && (
        <div className="p-3 text-sm rounded bg-red-500/10 border border-red-500/20 text-red-600">
          {error}
        </div>
      )}

      {/* Detail Sesi */}
      <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-paper)] grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
            Tanggal Opname *
          </label>
          <Input
            type="date"
            required
            value={opnameDate}
            onChange={(e) => setOpnameDate(e.target.value)}
            className="mt-1 bg-white/50"
          />
        </div>
        <div>
          <label className="text-xs font-mono uppercase text-[var(--color-ink-muted)]">
            Catatan Pelaksanaan
          </label>
          <Input
            placeholder="Contoh: Opname rutin akhir bulan / gudang utama"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 bg-white/50"
          />
        </div>
      </div>

      {/* Tabel Hitung Fisik */}
      <div className="border border-[var(--color-border)] rounded-xl bg-[var(--color-paper)] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase font-mono tracking-wider text-[var(--color-ink-muted)] bg-[var(--color-kanvas)]/50 border-b border-[var(--color-border)]">
              <tr>
                <th className="py-3 px-4">Barang (SKU)</th>
                <th className="py-3 px-4 text-right">Stok Sistem</th>
                <th className="py-3 px-4 text-right w-36">Hitungan Fisik</th>
                <th className="py-3 px-4 text-right">Selisih Unit</th>
                <th className="py-3 px-4 text-right">Estimasi Selisih (Rp)</th>
                <th className="py-3 px-4 w-52">Alasan / Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {items.map((it) => {
                const sysQty = Number(it.currentQty);
                const physQty = counts[it.id]?.physicalQty ?? sysQty;
                const diffQty = physQty - sysQty;
                const unitCost = it.averageCostMinor;
                const diffVal = (unitCost * BigInt(Math.round(diffQty * 10000))) / 10000n;

                return (
                  <tr key={it.id} className="hover:bg-[var(--color-kanvas)]/30">
                    <td className="py-3 px-4">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-xs font-mono text-[var(--color-ink-muted)]">
                        {it.code}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--color-ink-muted)]">
                      {sysQty} {it.unit}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Input
                        type="number"
                        step="any"
                        value={physQty}
                        onChange={(e) => handleQtyChange(it.id, Number(e.target.value))}
                        className="text-right font-mono h-8 bg-white/50"
                      />
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium">
                      <span
                        className={
                          diffQty < 0
                            ? "text-red-600"
                            : diffQty > 0
                            ? "text-emerald-700"
                            : "text-[var(--color-ink-muted)]"
                        }
                      >
                        {diffQty > 0 ? `+${diffQty}` : diffQty} {it.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium">
                      <span
                        className={
                          diffVal < 0n
                            ? "text-red-600"
                            : diffVal > 0n
                            ? "text-emerald-700"
                            : "text-[var(--color-ink-muted)]"
                        }
                      >
                        {Money.fromMinor(diffVal).formatIdr()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <Input
                        placeholder="Contoh: Barang rusak / tumpah"
                        value={counts[it.id]?.reason ?? ""}
                        onChange={(e) => handleReasonChange(it.id, e.target.value)}
                        className="text-xs h-8 bg-white/50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </form>
  );
}
