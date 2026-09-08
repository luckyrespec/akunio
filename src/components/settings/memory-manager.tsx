"use client";

import * as React from "react";
import { Brain, Loader2, Plus, Trash2 } from "lucide-react";
import {
  deleteMemoryAction,
  listMemoriesAction,
  saveMemoryAction,
  updateMemoryEnabledAction,
  type MemoryItemDTO,
} from "@/server/actions/settings.actions";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  PROFILE: "Profil",
  PREFERENCE: "Preferensi",
  FACT: "Fakta",
  THREAD_SUMMARY: "Ringkasan",
};

export function MemoryManager({
  initialMemories,
  memoryEnabled,
  canEdit,
}: {
  initialMemories: MemoryItemDTO[];
  memoryEnabled: boolean;
  canEdit: boolean;
}) {
  const [memories, setMemories] = React.useState<MemoryItemDTO[]>(initialMemories);
  const [enabled, setEnabled] = React.useState(memoryEnabled);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState("FACT");
  const [content, setContent] = React.useState("");

  const refresh = React.useCallback(async () => {
    const res = await listMemoriesAction();
    if (res.ok) setMemories(res.memories);
  }, []);

  const handleToggle = async () => {
    if (saving || !canEdit) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await updateMemoryEnabledAction(next);
      if (!res.ok) throw new Error(res.error || "Gagal menyimpan.");
      setMsg(next ? "Ingatan Akunio diaktifkan." : "Ingatan Akunio dimatikan.");
    } catch (err) {
      setEnabled(!next);
      setMsg(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async () => {
    if (saving || !canEdit || !content.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await saveMemoryAction({
        kind: kind as "PROFILE" | "PREFERENCE" | "FACT",
        content: content.trim(),
      });
      if (!res.ok || !("memory" in res) || !res.memory) throw new Error(res.error || "Gagal menyimpan.");
      setMemories((prev) => [res.memory as MemoryItemDTO, ...prev]);
      setContent("");
      setMsg("Ingatan tersimpan.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (saving || !canEdit) return;
    const prev = memories;
    setMemories((list) => list.filter((m) => m.id !== id));
    try {
      const res = await deleteMemoryAction(id);
      if (!res.ok) throw new Error(res.error || "Gagal menghapus.");
    } catch (err) {
      setMemories(prev);
      setMsg(err instanceof Error ? err.message : "Terjadi kesalahan.");
    }
  };

  return (
    <div className="rounded-xl border border-rule bg-paper p-5 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-ink flex items-center gap-2">
            <Brain className="size-4 text-terra" />
            <span>Ingatan Akunio</span>
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            Fakta dan preferensi yang diingat lintas percakapan. Matikan untuk mode tanpa ingatan.
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={saving || !canEdit}
          aria-pressed={enabled}
          data-testid="assistant-memory-toggle"
          className={cn(
            "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
            enabled ? "border-terra bg-terra" : "border-rule bg-canvas",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
              enabled ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2 rounded-xl border border-rule/70 bg-canvas/50 p-3">
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-8 rounded-lg border border-rule bg-paper px-2 text-xs text-ink"
              aria-label="Jenis ingatan"
            >
              <option value="FACT">Fakta</option>
              <option value="PREFERENCE">Preferensi</option>
              <option value="PROFILE">Profil</option>
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !content.trim()}
              className="flex h-8 items-center gap-1 rounded-lg bg-terra px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              <span>Simpan</span>
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="cth: Tutup buku tiap tanggal 5"
            className="w-full rounded-lg border border-rule bg-paper p-2 text-xs text-ink placeholder:text-ink-soft"
          />
        </div>
      )}

      <div className="space-y-2" data-testid="assistant-memory-list">
        {memories.length === 0 && (
          <p className="text-xs text-ink-soft">Belum ada ingatan tersimpan.</p>
        )}
        {memories.map((m) => (
          <div
            key={m.id}
            className="flex items-start justify-between gap-2 rounded-xl border border-rule/70 bg-card/50 p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="rounded-md border border-terra/30 bg-terra/5 px-1.5 py-0.5 text-[10px] font-semibold text-terra">
                  {KIND_LABEL[m.kind] ?? m.kind}
                </span>
                <span className="text-[10px] text-ink-soft">
                  {m.source === "user" ? "manual" : "otomatis"}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink">{m.content}</p>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => handleDelete(m.id)}
                className="rounded-lg p-1.5 text-ink-soft hover:bg-canvas hover:text-destructive"
                aria-label="Hapus ingatan"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void refresh()}
        className="text-[11px] text-ink-soft hover:text-ink"
      >
        Muat ulang daftar
      </button>

      {msg && <p className="text-xs font-medium text-emerald-600">{msg}</p>}
    </div>
  );
}
