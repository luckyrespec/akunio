"use client";

import * as React from "react";
import { ShieldCheck, ShieldAlert, Zap, Loader2 } from "lucide-react";
import { updateHitlPolicyAction } from "@/server/actions/settings.actions";
import { cn } from "@/lib/utils";

type Policy = "smart" | "strict" | "autonomous";

export function HitlPolicySelector({
  currentPolicy = "smart",
}: {
  currentPolicy?: Policy;
}) {
  const [selected, setSelected] = React.useState<Policy>(currentPolicy);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const handleSelect = async (val: Policy) => {
    if (saving || val === selected) return;
    setSelected(val);
    setSaving(true);
    setMsg(null);
    try {
      const res = await updateHitlPolicyAction(val);
      if (!res.ok) {
        throw new Error(res.error || "Gagal menyimpan.");
      }
      setMsg("Kebijakan AI berhasil diperbarui.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-rule bg-paper p-5 shadow-xs space-y-4">
      <div>
        <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
          <ShieldCheck className="size-4 text-terra" />
          <span>Kebijakan Persetujuan & Otomatisasi AI (Nara)</span>
        </h3>
        <p className="mt-1 text-xs text-ink-soft">
          Atur tingkat izin otomatisasi untuk pencatatan transaksi yang dieksekusi oleh Asisten AI (Nara) di seluruh aplikasi.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => handleSelect("smart")}
          disabled={saving}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3.5 text-left transition-all",
            selected === "smart"
              ? "border-terra bg-terra/5 ring-1 ring-terra"
              : "border-rule bg-card/50 hover:bg-muted/50",
          )}
        >
          <div className="flex w-full items-center justify-between">
            <span className="font-semibold text-xs text-ink">Mode Izin Transaksi</span>
            <ShieldCheck className="size-4 text-emerald-600" />
          </div>
          <p className="mt-1 text-[11px] text-ink-soft leading-relaxed">
            (Rekomendasi) Pembacaan data berjalan instan. Setiap transaksi mutasi atau posting jurnal wajib Anda setujui.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelect("strict")}
          disabled={saving}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3.5 text-left transition-all",
            selected === "strict"
              ? "border-terra bg-terra/5 ring-1 ring-terra"
              : "border-rule bg-card/50 hover:bg-muted/50",
          )}
        >
          <div className="flex w-full items-center justify-between">
            <span className="font-semibold text-xs text-ink">Verifikasi Ketat</span>
            <ShieldAlert className="size-4 text-amber-600" />
          </div>
          <p className="mt-1 text-[11px] text-ink-soft leading-relaxed">
            Semua tindakan pembacaan maupun penulisan memerlukan persetujuan manual pengguna sebelum dijalankan.
          </p>
        </button>

        <button
          type="button"
          onClick={() => handleSelect("autonomous")}
          disabled={saving}
          className={cn(
            "flex flex-col items-start rounded-xl border p-3.5 text-left transition-all",
            selected === "autonomous"
              ? "border-terra bg-terra/5 ring-1 ring-terra"
              : "border-rule bg-card/50 hover:bg-muted/50",
          )}
        >
          <div className="flex w-full items-center justify-between">
            <span className="font-semibold text-xs text-ink">Eksekusi Otomatis</span>
            <Zap className="size-4 text-purple-600" />
          </div>
          <p className="mt-1 text-[11px] text-ink-soft leading-relaxed">
            Seluruh transaksi langsung diposting secara otonom tanpa jeda konfirmasi (mode cepat).
          </p>
        </button>
      </div>

      {saving && (
        <div className="flex items-center gap-1.5 text-xs text-ink-soft">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Menyimpan pengaturan kebijakan...</span>
        </div>
      )}

      {msg && !saving && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          {msg}
        </p>
      )}
    </div>
  );
}
