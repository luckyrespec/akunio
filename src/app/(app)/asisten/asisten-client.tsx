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
  Shield,
  RotateCcw,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export default function AsistenClient({
  initialThreads,
  initialHitlPolicy = "smart",
}: {
  initialThreads: Thread[];
  initialHitlPolicy?: "smart" | "strict" | "autonomous";
}) {
  const [threads, setThreads] = React.useState<Thread[]>(initialThreads);
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(
    initialThreads[0]?.id ?? null,
  );
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
  const [searchQuery, setSearchQuery] = React.useState("");
  const [editingThreadId, setEditingThreadId] = React.useState<string | null>(null);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [deletingThreadId, setDeletingThreadId] = React.useState<string | null>(null);
  const [confirmingLoading, setConfirmingLoading] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Load active thread messages
  React.useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
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
  }, [activeThreadId]);

  // Handle file uploads to /api/nara/upload
  const handleFileUpload = async (files: FileList | File[]) => {
    const validFiles = Array.from(files);
    if (validFiles.length === 0) return;

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

      if (Array.isArray(data.files)) {
        setAttachments((prev) => [...prev, ...data.files]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal mengunggah berkas.";
      setErrorBanner(msg);
    } finally {
      setUploading(false);
    }
  };

  // Create new chat session
  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setPendingApproval(null);
    setAllowAllForSession(initialHitlPolicy === "autonomous");
    setErrorBanner(null);
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
                setThreads((prev) => [
                  {
                    id: data.threadId,
                    title: prompt.slice(0, 30) || "Percakapan baru",
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

  // Filter threads by search query
  const filteredThreads = threads.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas">
      {/* 1. SIDEBAR SESI PERCAKAPAN (Paper & Ink Matte Theme) */}
      <aside
        className={cn(
          "relative flex h-full flex-col border-r border-rule bg-paper transition-all duration-300 ease-in-out shrink-0",
          sidebarOpen ? "w-72 md:w-80" : "w-0 -translate-x-full overflow-hidden border-r-0 md:w-0",
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-rule">
          <Button
            onClick={handleNewChat}
            variant="outline"
            className="flex-1 justify-start gap-2 h-9 text-xs font-medium rounded-xl border-rule bg-canvas/70 hover:bg-canvas text-ink shadow-2xs transition-colors"
          >
            <Plus className="size-4 text-terra" />
            <span>Percakapan Baru</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="ml-1.5 size-8 text-ink-soft hover:text-ink hover:bg-canvas rounded-lg"
            aria-label="Tutup sidebar"
          >
            <SidebarClose className="size-4" />
          </Button>
        </div>

        {/* Search Threads */}
        <div className="px-3.5 py-2.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-ink-soft" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari percakapan..."
              className="h-8 pl-8 text-xs rounded-xl border-rule bg-canvas/50 text-ink placeholder:text-ink-soft/60 focus-visible:ring-terra/30"
            />
          </div>
        </div>

        {/* Threads List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-1 space-y-1">
          {filteredThreads.length === 0 ? (
            <div className="p-4 text-center text-xs text-ink-soft">
              {searchQuery ? "Tidak ada percakapan yang cocok." : "Belum ada riwayat percakapan."}
            </div>
          ) : (
            filteredThreads.map((t) => {
              const isActive = t.id === activeThreadId;
              const isEditing = t.id === editingThreadId;

              return (
                <div
                  key={t.id}
                  className={cn(
                    "group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs transition-all",
                    isActive
                      ? "bg-canvas border border-rule/90 font-medium text-ink shadow-2xs"
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
                        onClick={() => setActiveThreadId(t.id)}
                        className="flex-1 truncate text-left"
                      >
                        {t.title}
                      </button>

                      {/* Action buttons (Rename & Delete) */}
                      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingThreadId(t.id);
                            setEditingTitle(t.title);
                          }}
                          className="size-6 text-ink-soft hover:text-ink hover:bg-canvas rounded"
                          aria-label="Edit judul sesi"
                        >
                          <Edit2 className="size-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingThreadId(t.id);
                          }}
                          className="size-6 text-ink-soft hover:text-destructive hover:bg-canvas rounded"
                          aria-label="Hapus sesi"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-rule p-3 bg-paper flex items-center justify-between text-[11px] text-ink-soft">
          <div className="flex items-center gap-1.5">
            <Shield className="size-3.5 text-terra" />
            <span>HITL: {initialHitlPolicy.toUpperCase()}</span>
          </div>
          {allowAllForSession && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-600/40 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
              Auto-Allow
            </Badge>
          )}
        </div>
      </aside>

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

      {/* 2. AREA PERCAKAPAN UTAMA (Canvas & Messages) */}
      <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
        {/* Subtle Chat Header */}
        <div className="flex h-12 items-center justify-between border-b border-rule bg-paper/60 px-4 md:px-6 backdrop-blur-sm shrink-0">
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
                    {/* User attachments preview */}
                    {m.role === "user" && m.attachments && m.attachments.length > 0 && (
                      <div className="mb-2.5 flex flex-wrap gap-1.5">
                        {m.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-1.5 rounded-lg bg-white/20 px-2.5 py-1 text-xs text-white"
                          >
                            <span className="truncate max-w-[140px] font-medium">{att.fileName}</span>
                          </div>
                        ))}
                      </div>
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

            {/* INTERACTIVE HITL CONFIRMATION CARD */}
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

        {/* 3. BILAH INPUT BAWAH (Sticky Prompt Input - Full Width Container) */}
        <div className="border-t border-rule bg-paper/80 p-3 md:p-5 backdrop-blur-md shrink-0">
          <div className="mx-auto max-w-4xl lg:max-w-5xl">
            {/* Prompt Input Component (Header, Body, Footer with Tools) */}
            <PromptInput onSubmit={() => handleSendMessage()}>
              {/* Attachment Chips inside Prompt Input Header */}
              {attachments.length > 0 && (
                <PromptInputHeader>
                  <Attachments>
                    {attachments.map((att) => (
                      <AttachmentItem
                        key={att.id}
                        attachment={att}
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
                  {/* 1. Tombol (+) untuk lampirkan dokumen / gambar */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleFileUpload(e.target.files);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-full border border-rule/70 bg-canvas/60 text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || isStreaming}
                    title="Lampirkan nota atau faktur (PDF / Gambar)"
                    aria-label="Lampirkan dokumen"
                  >
                    <Plus className="size-4" />
                  </Button>

                  {/* 2. Tool Human-in-the-Loop pengganti search dengan hover explanation & click toggle */}
                  <HitlTool
                    allowAll={allowAllForSession}
                    onToggle={() => setAllowAllForSession((v) => !v)}
                    disabled={isStreaming}
                  />

                  {/* 3. Model Chooser menyatu di dalam prompt box */}
                  <ModelSelector
                    value={modelPreset}
                    onValueChange={setModelPreset}
                    disabled={isStreaming}
                  />
                </PromptInputTools>

                {/* 4. Tombol Submit / Stop */}
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
    </div>
  );
}
