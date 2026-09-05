"use client";

import * as React from "react";
import { Search, X, MessageSquare, Pin } from "lucide-react";

export interface ThreadItem {
  id: string;
  title: string;
  pinned?: boolean;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

interface AsistenSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  threads: ThreadItem[];
  onSelectThread: (threadId: string) => void;
}

export function AsistenSearchModal({
  isOpen,
  onClose,
  threads,
  onSelectThread,
}: AsistenSearchModalProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const searchMatchingThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-xs pt-20 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-rule bg-paper shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95">
        {/* Search Input Bar */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-rule">
          <Search className="size-4 text-ink-soft shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari percakapan..."
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-soft/60 outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-soft hover:bg-canvas hover:text-ink focus-ring"
            aria-label="Tutup pencarian"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Search Results list */}
        <div className="p-3">
          <div className="px-2 py-1 text-xs font-semibold text-ink-soft">
            {searchQuery ? "Hasil pencarian" : "Recent chats"}
          </div>

          <div className="mt-1 max-h-80 overflow-y-auto space-y-0.5">
            {searchMatchingThreads.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-soft">
                Tidak ditemukan percakapan yang cocok.
              </div>
            ) : (
              searchMatchingThreads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onSelectThread(t.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-ink hover:bg-canvas transition-colors focus-ring text-left"
                >
                  <MessageSquare className="size-4 text-ink-soft shrink-0" />
                  <span className="truncate flex-1 font-medium">{t.title}</span>
                  {t.pinned && <Pin className="size-3 text-terra shrink-0 fill-current" />}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
