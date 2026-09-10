"use client";
import * as React from "react";
import { parseThreadsResponse, type ThreadItem } from "@/lib/parse-threads";

const LAST_THREAD_KEY = "neraca:last_thread_id";

// Selaras dengan DEFAULT_THREAD_TITLE di src/server/ai/thread-title.ts
// (tidak diimpor langsung: berkas itu menarik @google/genai khusus server).

const DEFAULT_TITLE = "Percakapan Baru";

export function useNaraThreads(opts: { initialThreads?: ThreadItem[]; initialActiveId?: string | null } = {}) {
  const [threads, setThreads] = React.useState<ThreadItem[]>(opts.initialThreads ?? []);
  // Render pertama harus sama dengan SSR (anti hydration mismatch):
  // jangan baca localStorage di initializer. Sinkron di effect bawah.
  const [activeThreadId, setActiveThreadIdState] = React.useState<string | null>(
    () => opts.initialActiveId ?? null,
  );

  // Sinkron id tersimpan (client-only) setelah mount.
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_THREAD_KEY);
      if (stored) setActiveThreadIdState(stored);
    } catch {}
  }, []);

  const setActiveThreadId = React.useCallback((id: string | null) => {
    setActiveThreadIdState(id);
    try {
      if (id) localStorage.setItem(LAST_THREAD_KEY, id);
      else localStorage.removeItem(LAST_THREAD_KEY);
    } catch {}
  }, []);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/nara/threads");
    if (!res.ok) return;
    const list = parseThreadsResponse(await res.json()).map((t) => ({
      ...t,
      updatedAt: t.updatedAt ?? t.createdAt ?? new Date(0).toISOString(),
    }));
    setThreads(list);
    if (!localStorage.getItem(LAST_THREAD_KEY) && list.length > 0) {
      setActiveThreadId(list[0].id);
    }
  }, [setActiveThreadId]);

  const handleCreated = React.useCallback(
    (id: string, title: string) => {
      setThreads((prev) => [{ id, title, updatedAt: new Date().toISOString() }, ...prev]);
      setActiveThreadId(id);
    },
    [setActiveThreadId],
  );

  // Penamaan otomatis sesi oleh Gemini (maks 1 request per thread).
  // Server yang menilai: judul kustom tak disentuh, <3 pesan user ditolak.
  // Selaras dengan DEFAULT_THREAD_TITLE di src/server/ai/thread-title.ts
  // (tidak diimpor langsung: berkas itu menarik @google/genai khusus server).
  const renamingRef = React.useRef(new Set<string>());
  const maybeAutoRename = React.useCallback(
    async (threadId: string) => {
      const current = threads.find((t) => t.id === threadId);
      const title = (current?.title ?? "").trim();
      if (!current || (title && title !== DEFAULT_TITLE)) return;
      if (renamingRef.current.has(threadId)) return;
      // Hormati saklar penamaan otomatis organisasi.
      try {
        const res = await fetch("/api/nara/prefs");
        if (res.ok) {
          const data = await res.json();
          if (data.prefs && data.prefs.autoTitleEnabled === false) return;
        }
      } catch {}
      renamingRef.current.add(threadId);
      try {
        const res = await fetch(`/api/nara/threads/${threadId}/title`, { method: "POST" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.renamed && typeof data.title === "string" && data.title) {
          const next = data.title as string;
          setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, title: next } : t)));
        }
      } catch {
      } finally {
        renamingRef.current.delete(threadId);
      }
    },
    [threads],
  );

  return { threads, setThreads, activeThreadId, setActiveThreadId, refresh, handleCreated, maybeAutoRename };
}
