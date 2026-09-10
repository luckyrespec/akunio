"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HitlPolicySelector } from "@/components/settings/hitl-policy-selector";
import { MemoryManager } from "@/components/settings/memory-manager";
import { AsistenAiPrefs } from "./asisten-ai-prefs";
import { updateHitlPolicyAction, updateAiPrefsAction } from "@/server/actions/settings.actions";
import type { MemoryItemDTO } from "@/server/actions/settings.actions";
import type { AiPrefs } from "@/lib/ai-prefs";

/**
 * View Pengaturan di halaman /asisten — mencerminkan kebijakan AI dari
 * /pengaturan (HITL + ingatan) plus preferensi perilaku asisten.
 * Otorisasi + preferensi diedit sebagai draf dan disimpan sekaligus
 * lewat satu tombol global; daftar ingatan tetap kelola langsung.
 */
export function AsistenSettingsView({
  hitlPolicy,
  initialMemories,
  memoryEnabled,
  initialPrefs,
  canEdit,
}: {
  hitlPolicy: "smart" | "strict" | "autonomous";
  initialMemories: MemoryItemDTO[];
  memoryEnabled: boolean;
  initialPrefs: AiPrefs;
  canEdit: boolean;
}) {
  const [draftPolicy, setDraftPolicy] = React.useState(hitlPolicy);
  const [draftPrefs, setDraftPrefs] = React.useState<AiPrefs>(initialPrefs);
  const [savedPolicy, setSavedPolicy] = React.useState(hitlPolicy);
  const [savedPrefs, setSavedPrefs] = React.useState<AiPrefs>(initialPrefs);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    draftPolicy !== savedPolicy || JSON.stringify(draftPrefs) !== JSON.stringify(savedPrefs);

  const handleReset = () => {
    setDraftPolicy(savedPolicy);
    setDraftPrefs(savedPrefs);
    setMsg(null);
  };

  const handleSave = async () => {
    if (saving || !dirty || !canEdit) return;
    setSaving(true);
    setMsg(null);
    try {
      if (draftPolicy !== savedPolicy) {
        const r1 = await updateHitlPolicyAction(draftPolicy);
        if (!r1.ok) throw new Error(r1.error || "Gagal menyimpan otorisasi.");
      }
      if (JSON.stringify(draftPrefs) !== JSON.stringify(savedPrefs)) {
        const r2 = await updateAiPrefsAction({
          defaultPreset: draftPrefs.defaultPreset,
          answerLength: draftPrefs.answerLength,
          followupEnabled: draftPrefs.followupEnabled,
          postDirectly: draftPrefs.postDirectly,
          citationsEnabled: draftPrefs.citationsEnabled,
          autoTitleEnabled: draftPrefs.autoTitleEnabled,
          approvalThresholdText:
            draftPrefs.approvalThresholdMinor === savedPrefs.approvalThresholdMinor
              ? undefined
              : (draftPrefs.approvalThresholdMinor ?? null),
        });
        if (!r2.ok) throw new Error(r2.error || "Gagal menyimpan preferensi.");
      }
      setSavedPolicy(draftPolicy);
      setSavedPrefs(draftPrefs);
      setMsg({ ok: true, text: "Pengaturan asisten tersimpan dan berlaku untuk sesi baru." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Terjadi kesalahan." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
      <div className="flex-1 overflow-y-auto paper-scrollbar">
        <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-6">
          <div className="pt-2">
            <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-balance text-ink">
              Pengaturan Asisten
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
              Kendali cara Akunio bekerja untuk usaha Anda — otorisasi, ingatan, dan perilaku.
              Sama seperti tab Agen di Pengaturan: berubah di sini, berubah di sana.
            </p>
          </div>

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <section className="space-y-4 lg:col-span-2">
              <h3 className="font-display text-lg font-bold tracking-tight text-ink">
                Otorisasi &amp; Persetujuan
              </h3>
              <HitlPolicySelector
                currentPolicy={hitlPolicy}
                value={draftPolicy}
                onChange={setDraftPolicy}
                disabled={!canEdit || saving}
              />
            </section>

            <section className="space-y-4">
              <h3 className="font-display text-lg font-bold tracking-tight text-ink">
                Perilaku
              </h3>
              <AsistenAiPrefs
                prefs={draftPrefs}
                onPrefsChange={(next) => {
                  setDraftPrefs(next);
                  setMsg(null);
                }}
                disabled={!canEdit || saving}
              />
            </section>

            <section className="space-y-4">
              <h3 className="font-display text-lg font-bold tracking-tight text-ink">
                Ingatan Akunio
              </h3>
              <MemoryManager
                initialMemories={initialMemories}
                memoryEnabled={memoryEnabled}
                canEdit={canEdit}
              />
            </section>
          </div>
        </div>

        {/* Bilah simpan global */}
        <div className="sticky bottom-0 z-10 border-t border-rule/60 bg-paper/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 md:px-6">
            <p className="mr-auto text-xs text-ink-soft" role="status">
              {saving ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Menyimpan pengaturan...
                </span>
              ) : msg ? (
                <span className={msg.ok ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-destructive font-medium"}>
                  {msg.text}
                </span>
              ) : dirty ? (
                "Ada perubahan belum tersimpan."
              ) : (
                "Semua perubahan tersimpan."
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={!dirty || saving || !canEdit}
              onClick={handleReset}
            >
              Batalkan
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs bg-terra text-white hover:bg-terra/90 shadow-2xs"
              disabled={!dirty || saving || !canEdit}
              onClick={handleSave}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                  Menyimpan...
                </>
              ) : (
                "Simpan Pengaturan"
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
