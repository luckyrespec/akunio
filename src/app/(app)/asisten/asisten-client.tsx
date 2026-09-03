"use client";

import * as React from "react";
import {
  Sparkles,
  Plus,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  SidebarClose,
  SidebarOpen,
  Receipt,
  FileSpreadsheet,
  AlertCircle,
  FileCheck,
  Loader2,
  RotateCcw,
  MessageSquare,
  Library,
  Pin,
  MoreHorizontal,
  SquarePen,
  FileText,
  Image as ImageIcon,
  ArrowUpDown,
  LayoutList,
  LayoutGrid,
  User,
  Upload,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from "@/components/ai-elements/confirmation";
import {
  PromptInput,
  PromptInputHeader,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  Attachments,
  AttachmentItem,
  type Attachment,
} from "@/components/ai-elements/attachments";
import {
  ModelSelector,
  type ModelPreset,
} from "@/components/ai-elements/model-selector";
import { HitlTool } from "@/components/ai-elements/hitl-tool";
import { cn } from "@/lib/utils";

interface Thread {
  id: string;
  title: string;
  modelPreset?: string;
  pinned?: boolean;
  createdAt: string | Date;
  updatedAt?: string | Date;
}

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string | null;
  attachments?: Attachment[] | null;
  toolInvocations?: Array<{
    callId?: string;
    toolName: string;
    status: string;
    args?: Record<string, unknown>;
    result?: unknown;
    error?: string;
  }> | null;
  citations?: Array<{ kind: string; ref: string; excerpt: string; section?: string }> | null;
  createdAt?: string | Date;
}

interface PendingApproval {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  explanation: string;
}

interface LibraryFile {
  id: string;
  storageKey: string;
  fileName: string;
  mime: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
}

export default function AsistenClient({
  initialThreads,
  initialHitlPolicy = "smart",
  userEmail,
}: {
  initialThreads: Thread[];
  initialHitlPolicy?: "smart" | "strict" | "autonomous";
  userEmail?: string;
}) {
  const [threads, setThreads] = React.useState<Thread[]>(initialThreads);
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(
    initialThreads[0]?.id ?? null,
  );
  const [currentView, setCurrentView] = React.useState<"chat" | "library">("chat");
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [modelPreset, setModelPreset] = React.useState<ModelPreset>("fast");
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingReasoning, setStreamingReasoning] = React.useState("");
  const [streamingText, setStreamingText] = React.useState("");
  const [pendingApproval, setPendingApproval] = React.useState<PendingApproval | null>(null);
  const [allowAllForSession, setAllowAllForSession] = React.useState(
    initialHitlPolicy === "autonomous",
  );
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [searchModalOpen, setSearchModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Library view state
  const [libraryFiles, setLibraryFiles] = React.useState<LibraryFile[]>([]);
  const [libraryLoading, setLibraryLoading] = React.useState(false);
  const [librarySearch, setLibrarySearch] = React.useState("");
  const [libraryFilter, setLibraryFilter] = React.useState<"all" | "images" | "docs">("all");
  const [librarySort, setLibrarySort] = React.useState<"desc" | "asc">("desc");
  const [libraryLayout, setLibraryLayout] = React.useState<"list" | "grid">("list");

  const [editingThreadId, setEditingThreadId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [deletingThreadId, setDeletingThreadId] = React.useState<string | null>(null);
  const [confirmingLoading, setConfirmingLoading] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const libraryUploadInputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Load active thread messages
  React.useEffect(() => {
    if (!activeThreadId || currentView !== "chat") {
      if (!activeThreadId) setMessages([]);
      return;
    }

    async function loadThread() {
      try {
        const res = await fetch(`/api/nara/threads/${activeThreadId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.thread?.modelPreset) {
          setModelPreset(data.thread.modelPreset as ModelPreset);
        }
        setMessages(data.messages ?? []);
      } catch (err) {
        console.error("Gagal memuat pesan sesi", err);
      }
    }

    loadThread();
  }, [activeThreadId, currentView]);

  // Load library files when switching to library view
  const fetchLibraryFiles = React.useCallback(async () => {
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/nara/library");
      if (res.ok) {
        const data = await res.json();
        setLibraryFiles(data.files ?? []);
      }
    } catch (err) {
      console.error("Gagal memuat berkas pustaka", err);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (currentView === "library") {
      fetchLibraryFiles();
    }
  }, [currentView, fetchLibraryFiles]);

  // Handle file uploads to /api/nara/upload with instant local preview
  const handleFileUpload = async (files: FileList | File[], forChat = true) => {
    const validFiles = Array.from(files);
    if (validFiles.length === 0) return;

    if (forChat) {
      // Instant client-side preview for 0ms perceived latency
      const instantPreviews: Attachment[] = validFiles.map((f) => ({
        id: `temp-${Date.now()}-${Math.random()}`,
        fileName: f.name,
        mime: f.type,
        sizeBytes: f.size,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        status: "uploading",
      }));
      setAttachments((prev) => [...prev, ...instantPreviews]);
    }

    setUploading(true);
    setErrorBanner(null);
    try {
      const fd = new FormData();
      for (const f of validFiles) {
        fd.append("files", f);
      }

      const res = await fetch("/api/nara/upload", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengunggah berkas.");
      }

      if (forChat && Array.isArray(data.files)) {
        setAttachments((prev) => {
          const nonTemp = prev.filter((p) => !p.id.startsWith("temp-"));
          const confirmed = data.files.map((cf: Attachment) => {
            const match = prev.find((p) => p.fileName === cf.fileName);
            return {
              ...cf,
              previewUrl: match?.previewUrl || cf.url,
              status: "done" as const,
            };
          });
          return [...nonTemp, ...confirmed];
        });
      } else {
        // Refresh library files if uploaded from library view
        fetchLibraryFiles();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal mengunggah berkas.";
      setErrorBanner(msg);
      if (forChat) {
        setAttachments((prev) => prev.filter((p) => !p.id.startsWith("temp-")));
      }
    } finally {
      setUploading(false);
    }
  };

  // Create new chat session
  const handleNewChat = () => {
    setCurrentView("chat");
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setPendingApproval(null);
    setAllowAllForSession(initialHitlPolicy === "autonomous");
    setErrorBanner(null);
  };

  // Switch to specific thread
  const handleSelectThread = (threadId: string) => {
    setCurrentView("chat");
    setActiveThreadId(threadId);
  };

  // Rename thread
  const handleSaveRename = async (threadId: string) => {
    if (!editingTitle.trim()) {
      setEditingThreadId(null);
      return;
    }

    try {
      const res = await fetch(`/api/nara/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle.trim() }),
      });

      if (res.ok) {
        const updated = await res.json();
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, title: updated.title } : t)),
        );
      }
    } catch (err) {
      console.error("Gagal mengubah nama sesi", err);
    } finally {
      setEditingThreadId(null);
      setEditingTitle("");
    }
  };

  // Pin/Unpin thread
  const handleTogglePin = async (thread: Thread) => {
    try {
      const nextPinned = !thread.pinned;
      const res = await fetch(`/api/nara/threads/${thread.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: nextPinned }),
      });

      if (res.ok) {
        setThreads((prev) => {
          const updated = prev.map((t) => (t.id === thread.id ? { ...t, pinned: nextPinned } : t));
          return updated.sort((a, b) => {
            if (Boolean(a.pinned) !== Boolean(b.pinned)) {
              return a.pinned ? -1 : 1;
            }
            return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
          });
        });
      }
    } catch (err) {
      console.error("Gagal mengubah status pin sesi", err);
    }
  };

  // Delete thread
  const handleDeleteThread = async (threadId: string) => {
    try {
      const res = await fetch(`/api/nara/threads/${threadId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
        if (activeThreadId === threadId) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Gagal menghapus sesi", err);
    } finally {
      setDeletingThreadId(null);
    }
  };

  // Submit prompt with streaming SSE
  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend ?? input).trim();
    if (!prompt && attachments.length === 0) return;
    if (isStreaming) return;

    setErrorBanner(null);
    setIsStreaming(true);
    setStreamingReasoning("");
    setStreamingText("");
    setPendingApproval(null);

    const userMessage: MessageItem = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: prompt || "Lampiran dikirim",
      attachments: attachments.length > 0 ? [...attachments] : null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    const sentAttachments = [...attachments];
    setAttachments([]);

    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch("/api/nara/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          threadId: activeThreadId ?? undefined,
          message: prompt,
          attachments: sentAttachments,
          modelPreset,
          allowAllForSession,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal memproses pesan.");
      }

      if (!res.body) {
        throw new Error("Respons streaming kosong.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.type === "init" && data.threadId) {
              if (!activeThreadId) {
                setActiveThreadId(data.threadId);
                const smartTitle = data.title || prompt.split(/\s+/).slice(0, 3).join(" ") || "Percakapan Baru";
                setThreads((prev) => [
                  {
                    id: data.threadId,
                    title: smartTitle,
                    modelPreset,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                  ...prev,
                ]);
              }
            } else if (data.type === "reasoning" && data.delta) {
              setStreamingReasoning((prev) => prev + data.delta);
            } else if (data.type === "text" && data.delta) {
              setStreamingText((prev) => prev + data.delta);
            } else if (data.type === "tool_approval_request") {
              setPendingApproval({
                callId: data.callId,
                toolName: data.toolName,
                args: data.args,
                explanation: data.explanation,
              });
            } else if (data.type === "error") {
              setErrorBanner(data.message);
            } else if (data.type === "done") {
              setMessages((prev) => [
                ...prev,
                {
                  id: data.messageId || `asst-${Date.now()}`,
                  role: "assistant",
                  content: streamingText,
                  reasoning: streamingReasoning || undefined,
                  citations: data.citations,
                  createdAt: new Date().toISOString(),
                },
              ]);
            }
          } catch (parseErr) {
            console.warn("Gagal parsing SSE chunk", parseErr, jsonStr);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses jawaban.";
        setErrorBanner(msg);
      }
    } finally {
      setIsStreaming(false);
      setStreamingReasoning("");
      setStreamingText("");
    }
  };

  // Stop generation
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  // Handle Tool Approval / Rejection (HITL)
  const handleToolDecision = async (approved: boolean, allowAll = false) => {
    if (!pendingApproval || !activeThreadId) return;

    setConfirmingLoading(true);
    try {
      const res = await fetch("/api/nara/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThreadId,
          callId: pendingApproval.callId,
          toolName: pendingApproval.toolName,
          args: pendingApproval.args,
          approved,
          allowAllForSession: allowAll,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses konfirmasi.");
      }

      if (allowAll) {
        setAllowAllForSession(true);
      }

      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else if (!approved) {
        setMessages((prev) => [
          ...prev,
          {
            id: `rej-${Date.now()}`,
            role: "assistant",
            content: `Tindakan ${pendingApproval.toolName} dibatalkan.`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
      setPendingApproval(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal memproses persetujuan.";
      setErrorBanner(msg);
    } finally {
      setConfirmingLoading(false);
    }
  };

  // Filtered threads for search dialog
  const searchMatchingThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Filtered and sorted library files
  const filteredLibraryFiles = libraryFiles
    .filter((f) => {
      const matchesSearch = f.fileName.toLowerCase().includes(librarySearch.toLowerCase());
      if (!matchesSearch) return false;
      if (libraryFilter === "images") {
        return f.mime.startsWith("image/");
      }
      if (libraryFilter === "docs") {
        return f.mime === "application/pdf" || f.mime.includes("sheet") || f.mime.includes("document");
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return librarySort === "desc" ? dateB - dateA : dateA - dateB;
    });

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas">
      {/* 1. SIDEBAR SESI PERCAKAPAN (ChatGPT Style) */}
      <aside
        className={cn(
          "relative flex h-full flex-col border-r border-rule bg-paper transition-all duration-300 ease-in-out shrink-0",
          sidebarOpen ? "w-64 md:w-72" : "w-0 -translate-x-full overflow-hidden border-r-0 md:w-0",
        )}
      >
        {/* Sidebar Header (Exactly h-14 to match Main Header line!) */}
        <div className="flex h-14 items-center justify-between px-3.5 border-b border-rule shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-terra" />
            <span className="font-display font-semibold text-sm text-ink tracking-tight">Nara AI</span>
          </div>

          <div className="flex items-center gap-1">
            {/* Search Icon Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchModalOpen(true)}
              className="size-8 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
              aria-label="Cari percakapan"
              title="Cari percakapan (Ctrl+K)"
            >
              <Search className="size-4" />
            </Button>

            {/* Collapse Sidebar Button */}
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

        {/* Sidebar Action Menu: Percakapan baru & Pustaka (Library) */}
        <div className="p-2.5 space-y-1">
          <button
            type="button"
            onClick={handleNewChat}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs font-medium text-ink transition-colors hover:bg-canvas",
              currentView === "chat" && !activeThreadId && "bg-canvas font-semibold shadow-2xs",
            )}
          >
            <SquarePen className="size-4 text-ink-soft" />
            <span>Percakapan baru</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView("library")}
            className={cn(
              "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-xs font-medium text-ink transition-colors hover:bg-canvas",
              currentView === "library" && "bg-canvas font-semibold shadow-2xs",
            )}
          >
            <Library className="size-4 text-ink-soft" />
            <span>Pustaka</span>
          </button>
        </div>

        {/* Chats Section Header */}
        <div className="px-3.5 pt-2 pb-1 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
          Chats
        </div>

        {/* Threads List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
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
                        onClick={() => handleSelectThread(t.id)}
                        className="flex-1 truncate text-left flex items-center gap-1.5"
                      >
                        {t.pinned && <Pin className="size-3 text-terra shrink-0 fill-current" />}
                        <span className="truncate">{t.title}</span>
                      </button>

                      {/* Dropdown Menu (More Options) */}
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

                          <DropdownMenuItem onClick={() => handleTogglePin(t)}>
                            <Pin className={cn("size-3.5 mr-2 text-ink-soft", t.pinned && "fill-current text-terra")} />
                            <span>{t.pinned ? "Lepas sematan" : "Sematkan chat"}</span>
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setDeletingThreadId(t.id)}
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

        {/* Sidebar Footer (User info clean like ChatGPT, NO "HITL: SMART" jargon) */}
        <div className="border-t border-rule p-3 bg-paper flex items-center gap-2.5 text-xs text-ink shrink-0">
          <div className="flex size-7 items-center justify-center rounded-full bg-terra text-white text-xs font-semibold">
            {userEmail ? userEmail.charAt(0).toUpperCase() : <User className="size-3.5" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">{userEmail || "Akun Pengguna"}</p>
          </div>
        </div>
      </aside>

      {/* SEARCH MODAL */}
      {searchModalOpen && (
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
                onClick={() => setSearchModalOpen(false)}
                className="rounded-lg p-1 text-ink-soft hover:bg-canvas hover:text-ink"
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
                        handleSelectThread(t.id);
                        setSearchModalOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-ink hover:bg-canvas transition-colors text-left"
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
      )}

      {/* Delete Confirmation Modal */}
      {deletingThreadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-rule bg-paper p-5 shadow-xl">
            <h4 className="font-display text-sm font-semibold text-ink">Hapus Percakapan Ini?</h4>
            <p className="mt-1 text-xs text-ink-soft leading-relaxed">
              Semua pesan dan riwayat interaksi di dalam percakapan ini akan dihapus secara permanen.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-rule"
                onClick={() => setDeletingThreadId(null)}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleDeleteThread(deletingThreadId)}
              >
                Hapus
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. KONTEN UTAMA: BISA BERUPA PUSTAKA (LIBRARY) ATAU CHAT */}
      {currentView === "library" ? (
        /* =================== VIEW PUSTAKA (LIBRARY) =================== */
        <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden min-w-0 bg-canvas">
          {/* Header Pustaka (Exactly h-14 to match Sidebar Header line!) */}
          <div className="flex h-14 items-center justify-between border-b border-rule bg-paper/60 px-4 md:px-8 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-3">
              {!sidebarOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(true)}
                  className="size-8 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
                  aria-label="Buka sidebar"
                >
                  <SidebarOpen className="size-4" />
                </Button>
              )}
              <h1 className="font-display text-lg md:text-xl font-bold text-ink">Pustaka</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Search Bar */}
              <div className="relative w-48 md:w-64">
                <Search className="absolute left-3 top-2.5 size-3.5 text-ink-soft" />
                <input
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                  placeholder="Cari..."
                  className="h-8 w-full rounded-full border border-rule bg-paper pl-8 pr-3 text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-1 focus:ring-terra"
                />
              </div>

              {/* Upload Button */}
              <input
                ref={libraryUploadInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFileUpload(e.target.files, false);
                }}
              />
              <Button
                onClick={() => libraryUploadInputRef.current?.click()}
                disabled={uploading}
                size="sm"
                className="h-8 gap-1.5 rounded-full bg-terra text-white text-xs px-3 shadow-2xs hover:bg-terra/90"
              >
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                <span>Unggah Berkas</span>
              </Button>
            </div>
          </div>

          {/* Controls Bar: Filter Pills, Sort & Layout Toggle */}
          <div className="flex items-center justify-between px-4 md:px-8 py-3.5 border-b border-rule/70 bg-paper/30 shrink-0">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLibraryFilter("all")}
                className={cn(
                  "h-7 rounded-full px-3 text-xs font-medium transition-colors",
                  libraryFilter === "all"
                    ? "bg-ink text-paper font-semibold"
                    : "text-ink-soft hover:bg-canvas hover:text-ink",
                )}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setLibraryFilter("images")}
                className={cn(
                  "h-7 rounded-full px-3 text-xs font-medium transition-colors",
                  libraryFilter === "images"
                    ? "bg-ink text-paper font-semibold"
                    : "text-ink-soft hover:bg-canvas hover:text-ink",
                )}
              >
                Gambar
              </button>
              <button
                type="button"
                onClick={() => setLibraryFilter("docs")}
                className={cn(
                  "h-7 rounded-full px-3 text-xs font-medium transition-colors",
                  libraryFilter === "docs"
                    ? "bg-ink text-paper font-semibold"
                    : "text-ink-soft hover:bg-canvas hover:text-ink",
                )}
              >
                Dokumen
              </button>
            </div>

            {/* Sort and Layout Controls */}
            <div className="flex items-center gap-2 text-ink-soft">
              <button
                type="button"
                onClick={() => setLibrarySort((s) => (s === "desc" ? "asc" : "desc"))}
                className="flex items-center gap-1 h-7 px-2 rounded-lg text-xs hover:bg-canvas hover:text-ink transition-colors"
                title="Urutkan tanggal"
              >
                <ArrowUpDown className="size-3.5" />
                <span className="hidden sm:inline">{librarySort === "desc" ? "Terbaru" : "Terlama"}</span>
              </button>

              <div className="h-4 w-px bg-rule/70" />

              <button
                type="button"
                onClick={() => setLibraryLayout("list")}
                className={cn(
                  "p-1.5 rounded-lg hover:bg-canvas transition-colors",
                  libraryLayout === "list" ? "text-ink bg-canvas shadow-2xs" : "text-ink-soft",
                )}
                aria-label="Tampilan daftar"
              >
                <LayoutList className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setLibraryLayout("grid")}
                className={cn(
                  "p-1.5 rounded-lg hover:bg-canvas transition-colors",
                  libraryLayout === "grid" ? "text-ink bg-canvas shadow-2xs" : "text-ink-soft",
                )}
                aria-label="Tampilan kisi"
              >
                <LayoutGrid className="size-3.5" />
              </button>
            </div>
          </div>

          {/* Files List / Grid View */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            {libraryLoading ? (
              <div className="flex items-center justify-center p-16 text-xs text-ink-soft gap-2">
                <Loader2 className="size-4 animate-spin text-terra" />
                <span>Memuat dokumen...</span>
              </div>
            ) : filteredLibraryFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-center">
                <FileText className="size-12 text-ink-soft/40 mb-3" />
                <p className="font-display text-base font-semibold text-ink">Tidak ada berkas yang cocok</p>
                <p className="text-xs text-ink-soft mt-1 max-w-sm">
                  {librarySearch ? "Coba ganti kata kunci pencarian Anda." : "Unggah nota atau faktur transaksi pertama Anda."}
                </p>
              </div>
            ) : libraryLayout === "list" ? (
              /* Table / List View */
              <div className="w-full max-w-5xl mx-auto rounded-2xl border border-rule bg-paper overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-rule bg-canvas/60 text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
                      <th className="px-4 py-3">Nama</th>
                      <th className="px-4 py-3">Diubah</th>
                      <th className="px-4 py-3">Ukuran</th>
                      <th className="px-4 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule/60">
                    {filteredLibraryFiles.map((file) => {
                      const isPdf = file.mime === "application/pdf";
                      const isImage = file.mime.startsWith("image/");
                      const isSheet = file.mime.includes("sheet") || file.fileName.endsWith(".xlsx");
                      const sizeFormatted = `${(file.sizeBytes / 1024).toFixed(0)} KB`;
                      const dateFormatted = new Date(file.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                      });

                      return (
                        <tr key={file.id} className="hover:bg-canvas/40 transition-colors group">
                          <td className="px-4 py-3 flex items-center gap-3">
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-canvas border border-rule">
                              {isPdf ? (
                                <FileText className="size-4 text-terra" />
                              ) : isImage ? (
                                <ImageIcon className="size-4 text-blue-600" />
                              ) : (
                                <FileSpreadsheet className="size-4 text-emerald-600" />
                              )}
                            </div>
                            <span className="font-medium text-ink truncate max-w-md" title={file.fileName}>
                              {file.fileName}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{dateFormatted}</td>
                          <td className="px-4 py-3 text-ink-soft whitespace-nowrap">{sizeFormatted}</td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Create new chat with this file attached
                                handleNewChat();
                                setAttachments([
                                  {
                                    id: file.id,
                                    fileName: file.fileName,
                                    mime: file.mime,
                                    sizeBytes: file.sizeBytes,
                                    storageKey: file.storageKey,
                                  },
                                ]);
                              }}
                              className="h-7 text-[11px] text-terra hover:text-terra hover:bg-canvas rounded-lg px-2.5"
                            >
                              Tanyakan di Chat
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Grid View */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
                {filteredLibraryFiles.map((file) => {
                  const isPdf = file.mime === "application/pdf";
                  const isImage = file.mime.startsWith("image/");
                  const sizeFormatted = `${(file.sizeBytes / 1024).toFixed(0)} KB`;
                  const dateFormatted = new Date(file.createdAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                  });

                  return (
                    <div
                      key={file.id}
                      className="flex flex-col justify-between rounded-2xl border border-rule bg-paper p-3.5 shadow-xs hover:border-terra/60 transition-all group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-canvas border border-rule">
                          {isPdf ? (
                            <FileText className="size-4 text-terra" />
                          ) : isImage ? (
                            <ImageIcon className="size-4 text-blue-600" />
                          ) : (
                            <FileSpreadsheet className="size-4 text-emerald-600" />
                          )}
                        </div>
                        <span className="text-[10px] text-ink-soft">{dateFormatted}</span>
                      </div>

                      <div className="mt-3 min-w-0">
                        <p className="text-xs font-semibold text-ink truncate" title={file.fileName}>
                          {file.fileName}
                        </p>
                        <p className="text-[10px] text-ink-soft mt-0.5">{sizeFormatted}</p>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-rule/50 flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            handleNewChat();
                            setAttachments([
                              {
                                id: file.id,
                                fileName: file.fileName,
                                mime: file.mime,
                                sizeBytes: file.sizeBytes,
                                storageKey: file.storageKey,
                              },
                            ]);
                          }}
                          className="h-6 text-[10px] text-terra hover:text-terra hover:bg-canvas px-2"
                        >
                          Chat
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      ) : (
        /* =================== VIEW PERCAKAPAN (CHAT) =================== */
        <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
          {/* Main Header (Exactly h-14 to match Sidebar Header line!) */}
          <div className="flex h-14 items-center justify-between border-b border-rule bg-paper/60 px-4 md:px-6 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {!sidebarOpen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(true)}
                  className="size-8 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
                  aria-label="Buka sidebar"
                >
                  <SidebarOpen className="size-4" />
                </Button>
              )}
              <MessageSquare className="size-4 text-terra shrink-0" />
              <span className="font-display text-xs md:text-sm font-semibold text-ink truncate max-w-md">
                {threads.find((t) => t.id === activeThreadId)?.title || "Percakapan Baru"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNewChat}
                  className="h-7 text-[11px] gap-1 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
                >
                  <RotateCcw className="size-3" />
                  <span>Mulai Baru</span>
                </Button>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {errorBanner && (
            <div className="flex items-center justify-between bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs text-destructive shrink-0">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorBanner}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-destructive"
                onClick={() => setErrorBanner(null)}
              >
                <X className="size-3" />
              </Button>
            </div>
          )}

          {/* Conversation Feed */}
          <Conversation autoScroll={isStreaming}>
            <ConversationContent>
              {messages.length === 0 && !isStreaming ? (
                <ConversationEmptyState
                  icon={<Sparkles className="size-10 text-terra" />}
                  title="Ada yang bisa Nara bantu hari ini?"
                  description="Konsultasikan pembukuan, minta ringkasan laporan keuangan, atau catat transaksi langsung dari foto nota."
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-left mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setInput("Catat transaksi pembelian perlengkapan kantor Rp 350.000 tunai");
                      }}
                      className="flex items-start gap-3 rounded-2xl border border-rule bg-paper p-4 text-xs shadow-2xs transition-all hover:border-terra/70 hover:shadow-xs"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700">
                        <Receipt className="size-4" />
                      </div>
                      <div>
                        <div className="font-display font-semibold text-ink text-sm">Catat Pengeluaran</div>
                        <div className="mt-0.5 text-[11px] text-ink-soft leading-relaxed">Beli ATK, bensin, atau konsumsi operasional</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setInput("Tampilkan ringkasan laporan laba rugi bulan ini");
                        handleSendMessage("Tampilkan ringkasan laporan laba rugi bulan ini");
                      }}
                      className="flex items-start gap-3 rounded-2xl border border-rule bg-paper p-4 text-xs shadow-2xs transition-all hover:border-terra/70 hover:shadow-xs"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                        <FileSpreadsheet className="size-4" />
                      </div>
                      <div>
                        <div className="font-display font-semibold text-ink text-sm">Laporan Laba Rugi</div>
                        <div className="mt-0.5 text-[11px] text-ink-soft leading-relaxed">Lihat pendapatan dan total beban berjalan</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setInput("Berapa saldo kas dan bank saat ini?");
                        handleSendMessage("Berapa saldo kas dan bank saat ini?");
                      }}
                      className="flex items-start gap-3 rounded-2xl border border-rule bg-paper p-4 text-xs shadow-2xs transition-all hover:border-terra/70 hover:shadow-xs"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700">
                        <FileCheck className="size-4" />
                      </div>
                      <div>
                        <div className="font-display font-semibold text-ink text-sm">Cek Saldo Kas & Bank</div>
                        <div className="mt-0.5 text-[11px] text-ink-soft leading-relaxed">Posisi likuiditas kas & rekening bank live</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setInput("Jalankan diagnosa kesehatan pembukuan dan cek temuan anomali");
                        handleSendMessage("Jalankan diagnosa kesehatan pembukuan dan cek temuan anomali");
                      }}
                      className="flex items-start gap-3 rounded-2xl border border-rule bg-paper p-4 text-xs shadow-2xs transition-all hover:border-terra/70 hover:shadow-xs"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-700">
                        <Shield className="size-4" />
                      </div>
                      <div>
                        <div className="font-display font-semibold text-ink text-sm">Diagnosa Kesehatan</div>
                        <div className="mt-0.5 text-[11px] text-ink-soft leading-relaxed">Audit anomali saldo & jurnal tidak seimbang</div>
                      </div>
                    </button>
                  </div>
                </ConversationEmptyState>
              ) : (
                messages.map((m) => (
                  <Message key={m.id} from={m.role}>
                    <MessageContent from={m.role}>
                      {/* User attachments in rich Grid display */}
                      {m.attachments && m.attachments.length > 0 && (
                        <Attachments variant="grid" className="mb-3">
                          {m.attachments.map((att) => (
                            <AttachmentItem key={att.id} attachment={att} variant="grid" />
                          ))}
                        </Attachments>
                      )}

                      {/* Reasoning Accordion (Chain of Thought) */}
                      {m.role === "assistant" && m.reasoning && (
                        <Reasoning defaultOpen={false}>
                          <ReasoningTrigger>Proses Berpikir (Chain of Thought)</ReasoningTrigger>
                          <ReasoningContent>{m.reasoning}</ReasoningContent>
                        </Reasoning>
                      )}

                      {/* Tool Invocations Badge / Details */}
                      {m.toolInvocations && m.toolInvocations.length > 0 && (
                        <div className="my-2 flex flex-wrap gap-1.5">
                          {m.toolInvocations.map((ti, i) => (
                            <Badge
                              key={i}
                              variant="outline"
                              className={cn(
                                "text-[10px] font-mono rounded-md px-2 py-0.5",
                                ti.status === "approved" || ti.status === "auto"
                                ? "border-emerald-600/30 text-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30"
                                : "border-rule text-ink-soft bg-canvas/60",
                              )}
                            >
                              ✓ {ti.toolName} ({ti.status})
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Text Message Response */}
                      <MessageResponse>{m.content}</MessageResponse>

                      {/* Citations */}
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-rule/60 pt-2.5 text-[10px] text-ink-soft">
                          <span className="font-semibold text-ink">Sumber Referensi:</span>
                          {m.citations.map((c, i) => (
                            <span key={i} className="rounded bg-canvas px-1.5 py-0.5 font-mono border border-rule/50">
                              [{c.kind} {c.section ?? c.ref}]
                            </span>
                          ))}
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                ))
              )}

              {/* LIVE STREAMING BUBBLE */}
              {isStreaming && (
                <Message from="assistant">
                  <MessageContent from="assistant">
                    {streamingReasoning && (
                      <Reasoning isStreaming={!streamingText}>
                        <ReasoningTrigger>
                          {!streamingText ? "Sedang menimbang aturan akuntansi..." : "Proses Berpikir"}
                        </ReasoningTrigger>
                        <ReasoningContent>{streamingReasoning}</ReasoningContent>
                      </Reasoning>
                    )}

                    {streamingText ? (
                      <MessageResponse>{streamingText}</MessageResponse>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-ink-soft py-1">
                        <Loader2 className="size-3.5 animate-spin text-terra" />
                        <span>Nara sedang menyusun jawaban...</span>
                      </div>
                    )}
                  </MessageContent>
                </Message>
              )}

              {/* INTERACTIVE CONFIRMATION CARD */}
              {pendingApproval && (
                <div className="my-3 max-w-xl mx-auto w-full">
                  <Confirmation status="pending">
                    <ConfirmationTitle>
                      Konfirmasi Aksi: {pendingApproval.toolName.replace(/_/g, " ").toUpperCase()}
                    </ConfirmationTitle>
                    <ConfirmationRequest>
                      <p className="font-sans text-xs text-ink">{pendingApproval.explanation}</p>
                      <div className="rounded-xl bg-canvas p-3 font-mono text-[11px] leading-relaxed border border-rule text-ink">
                        {JSON.stringify(pendingApproval.args, null, 2)}
                      </div>
                    </ConfirmationRequest>
                    <ConfirmationActions>
                      <ConfirmationAction
                        variant="default"
                        className="bg-emerald-700 hover:bg-emerald-800 text-white"
                        disabled={confirmingLoading}
                        onClick={() => handleToolDecision(true, false)}
                      >
                        {confirmingLoading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Check className="size-3 mr-1" />}
                        Setujui & Jalankan
                      </ConfirmationAction>

                      <ConfirmationAction
                        variant="outline"
                        className="border-rule text-ink hover:bg-canvas"
                        disabled={confirmingLoading}
                        onClick={() => handleToolDecision(true, true)}
                      >
                        Selalu Izinkan di Sesi Ini
                      </ConfirmationAction>

                      <ConfirmationAction
                        variant="destructive"
                        disabled={confirmingLoading}
                        onClick={() => handleToolDecision(false, false)}
                      >
                        <X className="size-3 mr-1" />
                        Tolak
                      </ConfirmationAction>
                    </ConfirmationActions>
                  </Confirmation>
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {/* 3. BILAH INPUT BAWAH */}
          <div className="border-t border-rule bg-paper/80 p-3 md:p-5 backdrop-blur-md shrink-0">
            <div className="mx-auto max-w-4xl lg:max-w-5xl">
              <PromptInput
                onSubmit={() => handleSendMessage()}
                onDropFiles={(files) => handleFileUpload(files, true)}
              >
                {/* Attachment Chips inside Prompt Input Header */}
                {attachments.length > 0 && (
                  <PromptInputHeader>
                    <Attachments variant="inline">
                      {attachments.map((att) => (
                        <AttachmentItem
                          key={att.id}
                          attachment={att}
                          variant="inline"
                          onRemove={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                        />
                      ))}
                    </Attachments>
                  </PromptInputHeader>
                )}

                {uploading && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-rule bg-canvas px-3 py-1 text-xs text-ink-soft mb-2">
                    <Loader2 className="size-3.5 animate-spin text-terra" />
                    <span>Mengunggah berkas...</span>
                  </div>
                )}

                <PromptInputBody>
                  <PromptInputTextarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Tanyakan hal akuntansi, minta laporan, atau ketik transaksi..."
                    disabled={isStreaming}
                  />
                </PromptInputBody>

                <PromptInputFooter>
                  <PromptInputTools>
                    {/* Tombol (+) untuk lampirkan berkas dengan Tooltip */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) handleFileUpload(e.target.files, true);
                      }}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-full border border-rule/70 bg-canvas/60 text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading || isStreaming}
                          aria-label="Lampirkan dokumen"
                        >
                          <Plus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Lampirkan berkas (Gambar, PDF)</TooltipContent>
                    </Tooltip>

                    {/* Tool Izin Transaksi (Friendly HITL Switcher) */}
                    <HitlTool
                      allowAll={allowAllForSession}
                      onToggle={() => setAllowAllForSession((v) => !v)}
                      disabled={isStreaming}
                    />

                    {/* Model Chooser */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <ModelSelector
                            value={modelPreset}
                            onValueChange={setModelPreset}
                            disabled={isStreaming}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">Pilih Model AI (Nara Kilat / Nara Analis)</TooltipContent>
                    </Tooltip>
                  </PromptInputTools>

                  {/* Tombol Submit dengan icon Enter & Tooltip bawaan */}
                  <PromptInputSubmit
                    isStreaming={isStreaming}
                    onStop={handleStopStreaming}
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() && attachments.length === 0}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
