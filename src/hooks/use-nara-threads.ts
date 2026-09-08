"use client";
import * as React from "react";
import { parseThreadsResponse, type ThreadItem } from "@/lib/parse-threads";

const LAST_THREAD_KEY = "neraca:last_thread_id";

export function useNaraThreads(opts: { initialThreads?: ThreadItem[]; initialActiveId?: string | null } = {}) {
  const [threads, setThreads] = React.useState<ThreadItem[]>(opts.initialThreads ?? []);
  const [activeThreadId, setActiveThreadIdState] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_THREAD_KEY) ?? opts.initialActiveId ?? null;
    } catch {
      return opts.initialActiveId ?? null;
    }
  });

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

  return { threads, setThreads, activeThreadId, setActiveThreadId, refresh, handleCreated };
}
