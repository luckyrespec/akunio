"use client";

import * as React from "react";
import {
  Sparkles,
  Plus,
  Search,
  Paperclip,
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
  ArrowUpRight,
  Shield,
  Clock,
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
  PromptInputTextarea,
  PromptInputActions,
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
  const [allowAllForSession, setAllowAllForSession] = React.useState(false);
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
    setAllowAllForSession(false);
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
    <div className="flex h-[calc(100vh-4.25rem)] w-full overflow-hidden bg-background">
      {/* 1. SIDEBAR SESI PERCAKAPAN (ChatGPT Style) */}
      <aside
        className={cn(
          "relative flex flex-col border-r border-border/80 bg-card/60 backdrop-blur-xs transition-all duration-300 ease-in-out",
          sidebarOpen ? "w-72 md:w-80" : "w-0 -translate-x-full overflow-hidden border-r-0 md:w-0",
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-border/60">
          <Button
            onClick={handleNewChat}
            variant="outline"
            className="flex-1 justify-start gap-2 h-9 text-xs font-medium rounded-xl border-border/80 bg-background/80 hover:bg-muted"
          >
            <Plus className="size-4 text-primary" />
            <span>Percakapan Baru</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="ml-1.5 size-8 text-muted-foreground hover:text-foreground"
            aria-label="Tutup sidebar"
          >
            <SidebarClose className="size-4" />
          </Button>
        </div>

        {/* Search Threads */}
        <div className="px-3.5 py-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari percakapan..."
              className="h-8 pl-8 text-xs rounded-lg border-border/60 bg-muted/40"
            />
          </div>
        </div>

        {/* Threads List */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {filteredThreads.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
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
                      ? "bg-accent font-medium text-accent-foreground shadow-2xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
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
                        className="h-7 text-xs"
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
                        className="size-7 text-muted-foreground"
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
                          className="size-6 text-muted-foreground hover:text-foreground"
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
                          className="size-6 text-muted-foreground hover:text-destructive"
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
        <div className="border-t border-border/60 p-3 bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Shield className="size-3.5 text-primary" />
            <span>HITL: {initialHitlPolicy.toUpperCase()}</span>
          </div>
          {allowAllForSession && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/40 text-amber-600">
              Auto-Allow
            </Badge>
          )}
        </div>
      </aside>

      {/* Delete Confirmation Modal */}
      {deletingThreadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h4 className="text-sm font-semibold text-foreground">Hapus Percakapan Ini?</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Semua pesan dan riwayat interaksi di dalam percakapan ini akan dihapus secara permanen.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
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
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Top bar header when sidebar is collapsed */}
        <div className="flex h-12 items-center justify-between border-b border-border/70 px-4">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Buka sidebar"
              >
                <SidebarOpen className="size-4" />
              </Button>
            )}
            <h2 className="text-sm font-medium text-foreground truncate max-w-md">
              {threads.find((t) => t.id === activeThreadId)?.title || "Percakapan Baru"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <ModelSelector
              value={modelPreset}
              onValueChange={setModelPreset}
              disabled={isStreaming}
            />
          </div>
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div className="flex items-center justify-between bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4" />
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
                icon={<Sparkles className="size-10 text-primary/80" />}
                title="Ada yang bisa Nara bantu hari ini?"
                description="Konsultasikan pembukuan, minta ringkasan laporan keuangan, atau catat transaksi langsung dari foto nota."
              >
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-left mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setInput("Catat transaksi pembelian perlengkapan kantor Rp 350.000 tunai");
                    }}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-xs shadow-2xs transition-all hover:border-primary/50 hover:bg-accent/40"
                  >
                    <Receipt className="mt-0.5 size-4 text-amber-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Catat Pengeluaran</div>
                      <div className="text-[11px] text-muted-foreground">Beli ATK, bensin, atau konsumsi operasional</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInput("Tampilkan ringkasan laporan laba rugi bulan ini");
                      handleSendMessage("Tampilkan ringkasan laporan laba rugi bulan ini");
                    }}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-xs shadow-2xs transition-all hover:border-primary/50 hover:bg-accent/40"
                  >
                    <FileSpreadsheet className="mt-0.5 size-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Laporan Laba Rugi</div>
                      <div className="text-[11px] text-muted-foreground">Lihat pendapatan dan total beban berjalan</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInput("Berapa saldo kas dan bank saat ini?");
                      handleSendMessage("Berapa saldo kas dan bank saat ini?");
                    }}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-xs shadow-2xs transition-all hover:border-primary/50 hover:bg-accent/40"
                  >
                    <FileCheck className="mt-0.5 size-4 text-blue-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Cek Saldo Kas & Bank</div>
                      <div className="text-[11px] text-muted-foreground">Posisi likuiditas kas & rekening bank live</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInput("Jalankan diagnosa kesehatan pembukuan dan cek temuan anomali");
                      handleSendMessage("Jalankan diagnosa kesehatan pembukuan dan cek temuan anomali");
                    }}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card p-3 text-xs shadow-2xs transition-all hover:border-primary/50 hover:bg-accent/40"
                  >
                    <Shield className="mt-0.5 size-4 text-purple-500 shrink-0" />
                    <div>
                      <div className="font-semibold text-foreground">Diagnosa Kesehatan</div>
                      <div className="text-[11px] text-muted-foreground">Audit anomali saldo & jurnal tidak seimbang</div>
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
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {m.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center gap-1.5 rounded-lg bg-primary-foreground/15 px-2 py-1 text-xs text-primary-foreground"
                          >
                            <Paperclip className="size-3" />
                            <span className="truncate max-w-[120px] font-medium">{att.fileName}</span>
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
                      <div className="my-1.5 flex flex-wrap gap-1.5">
                        {m.toolInvocations.map((ti, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className={cn(
                              "text-[10px] font-mono",
                              ti.status === "approved" || ti.status === "auto"
                                ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                                : "border-muted-foreground/30 text-muted-foreground",
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
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
                        <span className="font-semibold">Sumber:</span>
                        {m.citations.map((c, i) => (
                          <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono">
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
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                      <Loader2 className="size-3.5 animate-spin" />
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
                    <p className="font-sans text-xs">{pendingApproval.explanation}</p>
                    <div className="rounded-lg bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed border border-border/60">
                      {JSON.stringify(pendingApproval.args, null, 2)}
                    </div>
                  </ConfirmationRequest>
                  <ConfirmationActions>
                    <ConfirmationAction
                      variant="default"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={confirmingLoading}
                      onClick={() => handleToolDecision(true, false)}
                    >
                      {confirmingLoading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Check className="size-3 mr-1" />}
                      Setujui & Jalankan
                    </ConfirmationAction>

                    <ConfirmationAction
                      variant="outline"
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

        {/* 3. BILAH INPUT BAWAH (Sticky Prompt Input) */}
        <div className="border-t border-border/70 bg-card/50 p-4 backdrop-blur-xs">
          <div className="mx-auto max-w-3xl">
            {/* Attachment Chips Preview */}
            <Attachments>
              {attachments.map((att) => (
                <AttachmentItem
                  key={att.id}
                  attachment={att}
                  onRemove={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                />
              ))}
              {uploading && (
                <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Mengunggah berkas...</span>
                </div>
              )}
            </Attachments>

            {/* Prompt Input Component */}
            <PromptInput onSubmit={() => handleSendMessage()}>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tanyakan hal akuntansi, minta laporan, atau ketik transaksi..."
                disabled={isStreaming}
              />

              <PromptInputActions>
                <div className="flex items-center gap-1">
                  {/* Hidden File Input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFileUpload(e.target.files);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || isStreaming}
                    aria-label="Lampirkan dokumen atau nota"
                  >
                    <Paperclip className="size-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <PromptInputSubmit
                    isStreaming={isStreaming}
                    onStop={handleStopStreaming}
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() && attachments.length === 0}
                  />
                </div>
              </PromptInputActions>
            </PromptInput>
          </div>
        </div>
      </main>
    </div>
  );
}
