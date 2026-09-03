"use client";

import * as React from "react";
import {
  Sparkles,
  Search,
  Plus,
  SidebarClose,
  Library,
  MessageSquare,
  Pin,
  MoreHorizontal,
  Edit2,
  Trash2,
  Check,
  X,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ThreadItem } from "./asisten-search-modal";

interface AsistenSidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  currentView: "chat" | "library";
  setCurrentView: (view: "chat" | "library") => void;
  threads: ThreadItem[];
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onNewChat: () => void;
  onOpenSearch: () => void;
  onRenameThread: (threadId: string, newTitle: string) => Promise<void>;
  onTogglePin: (thread: ThreadItem) => Promise<void>;
  onDeleteRequest: (threadId: string) => void;
  userEmail?: string;
}

export function AsistenSidebar({
  sidebarOpen,
  setSidebarOpen,
  currentView,
  setCurrentView,
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
  onOpenSearch,
  onRenameThread,
  onTogglePin,
  onDeleteRequest,
  userEmail,
}: AsistenSidebarProps) {
  const [editingThreadId, setEditingThreadId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");

  const handleSaveRename = async (threadId: string) => {
    if (!editingTitle.trim()) {
      setEditingThreadId(null);
      return;
    }
    await onRenameThread(threadId, editingTitle.trim());
    setEditingThreadId(null);
    setEditingTitle("");
  };

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-rule bg-paper transition-all duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] shrink-0",
        sidebarOpen ? "w-64 md:w-72" : "w-0 -translate-x-full overflow-hidden border-r-0 md:w-0",
      )}
    >
      {/* Sidebar Header */}
      <div className="flex h-14 items-center justify-between px-3.5 border-b border-rule shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-terra" />
          <span className="font-display font-semibold text-sm text-ink tracking-tight">Nara AI</span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSearch}
            className="size-8 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
            aria-label="Cari percakapan"
            title="Cari riwayat (Cmd+K)"
          >
            <Search className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="size-8 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
            aria-label="Tutup sidebar"
          >
            <SidebarClose className="size-4" />
          </Button>
        </div>
      </div>

      {/* New Chat & Navigation Tabs */}
      <div className="p-3 space-y-1.5 shrink-0">
        <Button
          onClick={onNewChat}
          className="w-full justify-start gap-2 rounded-xl bg-terra text-white shadow-2xs hover:bg-terra/90 text-xs font-semibold h-9 px-3"
        >
          <Plus className="size-4" />
          <span>Percakapan Baru</span>
        </Button>

        <button
          type="button"
          onClick={() => setCurrentView("library")}
          className={cn(
            "w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors text-left",
            currentView === "library"
              ? "bg-canvas text-terra font-semibold shadow-2xs"
              : "text-ink-soft hover:bg-canvas/60 hover:text-ink",
          )}
        >
          <Library className="size-4" />
          <span>Pustaka Berkas</span>
        </button>
      </div>

      {/* Chats Section Header */}
      <div className="px-3.5 pt-2 pb-1 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
        Chats
      </div>

      {/* Threads List */}
      <div className="flex-1 overflow-y-auto paper-scrollbar px-2 space-y-0.5">
        {threads.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink-soft">
            Belum ada riwayat percakapan.
          </div>
        ) : (
          threads.map((t) => {
            const isActive = currentView === "chat" && t.id === activeThreadId;
            const isEditing = t.id === editingThreadId;

            return (
              <div
                key={t.id}
                className={cn(
                  "group relative flex items-center justify-between rounded-xl px-2.5 py-2 text-xs transition-all",
                  isActive
                    ? "bg-canvas font-medium text-ink shadow-2xs"
                    : "text-ink-soft hover:bg-canvas/60 hover:text-ink",
                )}
              >
                {isEditing ? (
                  <div className="flex flex-1 items-center gap-1">
                    <Input
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(t.id);
                        if (e.key === "Escape") setEditingThreadId(null);
                      }}
                      autoFocus
                      className="h-7 text-xs border-rule bg-paper text-ink"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-emerald-600"
                      onClick={() => handleSaveRename(t.id)}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7 text-ink-soft"
                      onClick={() => setEditingThreadId(null)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentView("chat");
                        onSelectThread(t.id);
                      }}
                      className="flex-1 truncate text-left flex items-center gap-1.5"
                    >
                      {t.pinned && <Pin className="size-3 text-terra shrink-0 fill-current" />}
                      <span className="truncate">{t.title}</span>
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "size-6 rounded flex items-center justify-center text-ink-soft hover:text-ink hover:bg-paper transition-opacity",
                            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                          )}
                          aria-label="Opsi percakapan"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingThreadId(t.id);
                            setEditingTitle(t.title);
                          }}
                        >
                          <Edit2 className="size-3.5 mr-2 text-ink-soft" />
                          <span>Ganti nama</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem onClick={() => onTogglePin(t)}>
                          <Pin className={cn("size-3.5 mr-2 text-ink-soft", t.pinned && "fill-current text-terra")} />
                          <span>{t.pinned ? "Lepas sematan" : "Sematkan chat"}</span>
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onDeleteRequest(t.id)}
                        >
                          <Trash2 className="size-3.5 mr-2 text-destructive" />
                          <span>Hapus chat</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="border-t border-rule p-3 bg-paper flex items-center gap-2.5 text-xs text-ink shrink-0">
        <div className="flex size-7 items-center justify-center rounded-full bg-terra text-white text-xs font-semibold">
          {userEmail ? userEmail.charAt(0).toUpperCase() : <User className="size-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-ink">{userEmail || "Akun Pengguna"}</p>
        </div>
      </div>
    </aside>
  );
}
