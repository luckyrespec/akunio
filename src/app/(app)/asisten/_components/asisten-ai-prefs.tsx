"use client";

import * as React from "react";
import { Gauge, SlidersHorizontal } from "lucide-react";
import { type AiPrefs } from "@/lib/ai-prefs";
import { Money } from "@/core/money/money";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

function Toggle({
  label,
  desc,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-rule bg-card/50 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50 disabled:opacity-60"
    >
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{desc}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-5.5 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-terra" : "bg-rule",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 rounded-full bg-white shadow transition-all",
            checked ? "left-5" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

/**
 * Opsi perilaku asisten — controlled: induk memegang draft & tombol simpan.
 * Teks ambang dikomit ke draft saat blur/Enter (parse gagal = draft tak berubah).
 */
export function AsistenAiPrefs({
  prefs,
  onPrefsChange,
  disabled,
}: {
  prefs: AiPrefs;
  onPrefsChange: (next: AiPrefs) => void;
  disabled?: boolean;
}) {
  const [thresholdText, setThresholdText] = React.useState("");
  const [thresholdInvalid, setThresholdInvalid] = React.useState(false);

  const commitThreshold = () => {
    const t = thresholdText.trim();
    if (!t) {
      setThresholdInvalid(false);
      if (prefs.approvalThresholdMinor !== null) {
        onPrefsChange({ ...prefs, approvalThresholdMinor: null });
      }
      return;
    }
    try {
      const minor = Money.parseIdr(t).minor.toString();
      setThresholdInvalid(false);
      if (minor !== prefs.approvalThresholdMinor) {
        onPrefsChange({ ...prefs, approvalThresholdMinor: minor });
      }
      setThresholdText("");
    } catch {
      // Invalid: tandai saja — nilai tak valid tak pernah masuk draft.
      setThresholdInvalid(true);
    }
  };

  return (
    <div className="rounded-xl border border-rule bg-paper p-5 shadow-xs space-y-5">
      <div>
        <h3 className="font-display text-base font-bold tracking-tight text-ink flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-terra" />
          <span>Perilaku Asisten</span>
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
          Berlaku untuk sesi baru di halaman ini dan quick access. Sesi yang sedang berjalan tidak berubah.
        </p>
      </div>

      {/* Model default */}
      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-ink">Model default sesi baru</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "fast", label: "Cepat", desc: "Jawaban kilat sehari-hari" },
              { v: "deep", label: "Mendalam", desc: "Analisis berat, lebih lambat" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              disabled={disabled}
              onClick={() => onPrefsChange({ ...prefs, defaultPreset: o.v })}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                prefs.defaultPreset === o.v
                  ? "border-terra bg-terra/5 ring-1 ring-terra"
                  : "border-rule bg-card/50 hover:bg-muted/50",
              )}
            >
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Panjang jawaban */}
      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-ink">Panjang jawaban</p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "ringkas", label: "Ringkas", desc: "Langsung ke inti" },
              { v: "lengkap", label: "Lengkap", desc: "Penjelasan + contoh" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              disabled={disabled}
              onClick={() => onPrefsChange({ ...prefs, answerLength: o.v })}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                prefs.answerLength === o.v
                  ? "border-terra bg-terra/5 ring-1 ring-terra"
                  : "border-rule bg-card/50 hover:bg-muted/50",
              )}
            >
              <span className="block text-sm font-semibold text-ink">{o.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Toggle */}
      <div className="space-y-2">
        <Toggle
          label="Posting langsung"
          desc="“Catat” langsung posting setelah persetujuan. Mati = selalu draft dulu."
          checked={prefs.postDirectly}
          disabled={disabled}
          onChange={(v) => onPrefsChange({ ...prefs, postDirectly: v })}
        />
        <Toggle
          label="Saran tindak lanjut"
          desc="Chip saran dan daftar langkah berikutnya di tiap jawaban."
          checked={prefs.followupEnabled}
          disabled={disabled}
          onChange={(v) => onPrefsChange({ ...prefs, followupEnabled: v })}
        />
        <Toggle
          label="Sitasi rujukan"
          desc="Chip SAK, jurnal, barang, akun, dan aset yang bisa diklik."
          checked={prefs.citationsEnabled}
          disabled={disabled}
          onChange={(v) => onPrefsChange({ ...prefs, citationsEnabled: v })}
        />
        <Toggle
          label="Penamaan sesi otomatis"
          desc="Gemini menamai sesi setelah ≥3 pesan. Mati = selalu “Percakapan Baru”."
          checked={prefs.autoTitleEnabled}
          disabled={disabled}
          onChange={(v) => onPrefsChange({ ...prefs, autoTitleEnabled: v })}
        />
      </div>

      {/* Batas nominal persetujuan */}
      <div className="space-y-2 rounded-xl border border-rule bg-card/50 p-3.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Gauge className="size-3.5 text-terra" />
          Batas nominal persetujuan
        </p>
        <p className="text-[11px] leading-relaxed text-ink-soft">
          {prefs.approvalThresholdMinor
            ? `Draf: aksi di atas ${Money.formatIdr(prefs.approvalThresholdMinor)} selalu minta persetujuan, bahkan dalam mode otomatis.`
            : "Mati — mode kebijakan di atas yang berlaku penuh."}
        </p>
        <Input
          value={thresholdText}
          onChange={(e) => setThresholdText(e.target.value)}
          onBlur={commitThreshold}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="cth: 10000000 (kosongkan = mati)"
          inputMode="numeric"
          disabled={disabled}
          className="h-8 text-xs"
          aria-invalid={thresholdInvalid}
        />
        {thresholdInvalid && (
          <p className="text-[11px] font-medium text-destructive">
            Format nominal tidak valid — contoh yang benar: 10000000.
          </p>
        )}
      </div>
    </div>
  );
}
