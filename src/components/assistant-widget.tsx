"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  X,
  Plus,
  Maximize2,
  ChevronDown,
  Loader2,
  AlertCircle,
  Check,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import {
  Queue,
  QueueSection,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemIndicator,
  QueueItemAttachment,
  QueueItemContent,
  QueueItemDescription,
  QueueItemActions,
} from "@/components/ai-elements/queue";
import { HitlTool } from "@/components/ai-elements/hitl-tool";
import { getActivePageContext, type PageContext } from "@/lib/assistant-context";
import { cn } from "@/lib/utils";

interface ThreadSummary {
  id: string;
  title: string;
  updatedAt?: string | Date;
}

export interface BatchItemData {
  id: string;
  fileName: string;
  vendor: string;
  date: string;
  total: string;
  confidence: number;
  status: "ready" | "needs_review";
  category: string;
  itemsDetected?: string[];
}

interface MessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string | null;
  attachments?: Attachment[] | null;
  suggestions?: string[] | null;
  batchQueue?: BatchItemData[] | null;
  toolInvocations?: Array<{
    callId?: string;
    toolName: string;
    status: string;
    args?: Record<string, unknown>;
    result?: unknown;
    error?: string;
  }> | null;
  citations?: Array<{ kind: string; ref: string; excerpt: string; section?: string }> | null;
}

interface PendingApproval {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  explanation: string;
}

export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [threads, setThreads] = React.useState<ThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingReasoning, setStreamingReasoning] = React.useState("");
  const [streamingText, setStreamingText] = React.useState("");
  const [streamingSuggestions, setStreamingSuggestions] = React.useState<string[]>([]);
  const [streamingQueue, setStreamingQueue] = React.useState<BatchItemData[] | null>(null);
  const [allowAllForSession, setAllowAllForSession] = React.useState(false);
  const [pendingApproval, setPendingApproval] = React.useState<PendingApproval | null>(null);
  const [confirmingLoading, setConfirmingLoading] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);
  const [pageContext, setPageContext] = React.useState<PageContext>({
    pathname: "",
    title: "",
    label: "Aplikasi",
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Update page context when pathname changes or widget opens
  React.useEffect(() => {
    if (open) {
      setPageContext(getActivePageContext());
    }
  }, [open, pathname]);

  // Global shortcut Ctrl+J / Cmd+J to toggle assistant
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Fetch threads list when opened
  React.useEffect(() => {
    if (!open) return;
    async function loadThreads() {
      try {
        const res = await fetch("/api/nara/threads");
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads ?? []);
          if (!activeThreadId && data.threads?.length > 0) {
            setActiveThreadId(data.threads[0].id);
          }
        }
      } catch (e) {
        console.error("Gagal memuat daftar sesi", e);
      }
    }
    loadThreads();
  }, [open, activeThreadId]);

  // Load messages for active thread
  React.useEffect(() => {
    if (!activeThreadId || !open) {
      if (!activeThreadId) setMessages([]);
      return;
    }
    async function loadThread() {
      try {
        const res = await fetch(`/api/nara/threads/${activeThreadId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages ?? []);
        }
      } catch (e) {
        console.error("Gagal memuat percakapan", e);
      }
    }
    loadThread();
  }, [activeThreadId, open]);

  // Proactive Daily Briefing on first daily open
  React.useEffect(() => {
    if (!open) return;
    try {
      const todayISO = new Date().toISOString().slice(0, 10);
      const lastBriefing = localStorage.getItem("neraca:last_briefing_date");
      if (lastBriefing !== todayISO && messages.length === 0 && !isStreaming) {
        localStorage.setItem("neraca:last_briefing_date", todayISO);
        handleSendMessage("☀️ Berikan ringkasan briefing keuangan hari ini.");
      }
    } catch {}
  }, [open, messages.length, isStreaming]);

  const pendingFilesRef = React.useRef<Map<string, File>>(new Map());

  // Attach files locally with instant preview (Deferred Upload - zero orphaned files)
  const handleAttachFiles = React.useCallback((files: FileList | File[]) => {
    const validFiles = Array.from(files);
    if (validFiles.length === 0) return;

    const newAttachments: Attachment[] = [];

    for (const f of validFiles) {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingFilesRef.current.set(localId, f);
      newAttachments.push({
        id: localId,
        fileName: f.name,
        mime: f.type || "application/octet-stream",
        sizeBytes: f.size,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        status: "done",
      });
    }

    setAttachments((prev) => {
      const existingKeys = new Set(prev.map((p) => `${p.fileName}-${p.sizeBytes}`));
      const nonDuplicate = newAttachments.filter((n) => !existingKeys.has(`${n.fileName}-${n.sizeBytes}`));
      return [...prev, ...nonDuplicate];
    });
  }, []);

  // Remove attachment locally (revokes memory URL, zero orphaned server storage)
  const handleRemoveAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
    pendingFilesRef.current.delete(id);
  }, []);

  // Start new chat
  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setPendingApproval(null);
    setErrorBanner(null);
    pendingFilesRef.current.clear();
  };

  // Send message via streaming SSE with injected pageContext (Uploads pending files just-in-time)
  const handleSendMessage = async (textToSend?: string) => {
    const prompt = (textToSend ?? input).trim();
    if (!prompt && attachments.length === 0) return;
    if (isStreaming || uploading) return;

    setErrorBanner(null);

    // 1. Just-in-time upload of any pending local attachments
    let readyAttachments: Attachment[] = [];
    const localAttachments = attachments.filter((a) => a.id.startsWith("local-"));
    const alreadyUploaded = attachments.filter((a) => !a.id.startsWith("local-"));

    const filesToUpload: File[] = [];
    for (const a of localAttachments) {
      const f = pendingFilesRef.current.get(a.id);
      if (f) filesToUpload.push(f);
    }

    if (filesToUpload.length > 0) {
      setUploading(true);
      try {
        const fd = new FormData();
        for (const f of filesToUpload) fd.append("files", f);
        const upRes = await fetch("/api/nara/upload", { method: "POST", body: fd });
        const upData = await upRes.json();
        if (!upRes.ok) throw new Error(upData.error || "Gagal mengunggah berkas.");
        if (Array.isArray(upData.files)) {
          readyAttachments = [
            ...alreadyUploaded,
            ...upData.files.map((cf: Attachment) => {
              const localMatch = localAttachments.find((l) => l.fileName === cf.fileName);
              return {
                ...cf,
                previewUrl: localMatch?.previewUrl,
              };
            }),
          ];
        }
      } catch (uploadErr) {
        setUploading(false);
        setErrorBanner(uploadErr instanceof Error ? uploadErr.message : "Gagal mengunggah berkas.");
        return;
      } finally {
        setUploading(false);
      }
    } else {
      readyAttachments = [...alreadyUploaded];
    }

    pendingFilesRef.current.clear();

    setIsStreaming(true);
    setStreamingReasoning("");
    setStreamingText("");
    setPendingApproval(null);

    const userMessage: MessageItem = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: prompt || "Lampiran dikirim",
      attachments: readyAttachments.length > 0 ? [...readyAttachments] : null,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setAttachments([]);

    abortControllerRef.current = new AbortController();

    try {
      const currentContext = getActivePageContext();
      const res = await fetch("/api/nara/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          threadId: activeThreadId ?? undefined,
          message: prompt,
          attachments: readyAttachments,
          modelPreset: "fast",
          allowAllForSession,
          pageContext: {
            pathname: currentContext.pathname,
            title: currentContext.title,
            summary: currentContext.summary,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal memproses pesan.");
      }
      if (!res.body) throw new Error("Respons streaming kosong.");

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
                  { id: data.threadId, title: data.title || prompt.slice(0, 24) },
                  ...prev,
                ]);
              }
            } else if (data.type === "reasoning" && data.delta) {
              setStreamingReasoning((prev) => prev + data.delta);
            } else if (data.type === "text" && data.delta) {
              setStreamingText((prev) => prev + data.delta);
            } else if (data.type === "suggestions" && Array.isArray(data.suggestions)) {
              setStreamingSuggestions(data.suggestions);
            } else if (data.type === "queue_update" && Array.isArray(data.items)) {
              setStreamingQueue(data.items);
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
                  suggestions: streamingSuggestions.length > 0 ? streamingSuggestions : undefined,
                  batchQueue: streamingQueue || undefined,
                  citations: data.citations,
                },
              ]);
            }
          } catch {}
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setErrorBanner(e instanceof Error ? e.message : "Terjadi kesalahan.");
      }
    } finally {
      setIsStreaming(false);
      setStreamingReasoning("");
      setStreamingText("");
      setStreamingSuggestions([]);
      setStreamingQueue(null);
    }
  };

  // Stop streaming
  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  // Handle Tool Approval in Side Sheet
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
      if (!res.ok) throw new Error(data.error || "Gagal konfirmasi.");
      if (allowAll) setAllowAllForSession(true);
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      } else if (!approved) {
        setMessages((prev) => [
          ...prev,
          {
            id: `rej-${Date.now()}`,
            role: "assistant",
            content: `Tindakan ${pendingApproval.toolName} dibatalkan.`,
          },
        ]);
      }
      setPendingApproval(null);
    } catch (e) {
      setErrorBanner(e instanceof Error ? e.message : "Gagal memproses.");
    } finally {
      setConfirmingLoading(false);
    }
  };

  // If currently on /asisten page, don't show the quick-access sheet widget to prevent redundancy
  if (pathname.startsWith("/asisten")) {
    return null;
  }

  const activeThreadTitle =
    threads.find((t) => t.id === activeThreadId)?.title || "Percakapan Baru";

  return (
    <>
      {/* 1. FLOATING QUICK ACCESS TRIGGER (Bottom-Right) */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-terra/40 bg-paper py-2 pl-3.5 pr-4 text-xs font-semibold text-ink shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-105 hover:border-terra hover:shadow-xl active:scale-95 group",
          open && "ring-2 ring-terra/30",
        )}
        aria-label="Buka Asisten Nara (Ctrl+J)"
        title="Buka Asisten Nara (Ctrl+J)"
      >
        <div className="relative flex size-6 items-center justify-center rounded-full bg-terra text-white shadow-2xs">
          <Sparkles className="size-3.5" />
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-paper" />
        </div>
        <span className="font-display">Nara Copilot</span>
        <span className="hidden sm:inline-block rounded bg-canvas px-1.5 py-0.5 text-[10px] font-mono font-normal text-ink-soft border border-rule/60">
          Ctrl+J
        </span>
      </button>

      {/* Backdrop on mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 2. RIGHT SIDE-SHEET COPILOT PANEL */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-full sm:w-[420px] md:w-[460px] max-w-full flex-col border-l border-rule bg-paper shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full pointer-events-none",
        )}
      >
        {/* Panel Header */}
        <div className="flex h-14 items-center justify-between px-4 border-b border-rule bg-paper/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-7 items-center justify-center rounded-lg bg-terra text-white shrink-0">
              <Sparkles className="size-3.5" />
            </div>

            {/* Session Switcher Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 max-w-[200px] text-xs font-semibold text-ink hover:text-terra transition-colors truncate text-left"
                >
                  <span className="truncate">{activeThreadTitle}</span>
                  <ChevronDown className="size-3 text-ink-soft shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={handleNewChat}>
                  <Plus className="size-3.5 mr-2 text-terra" />
                  <span>Percakapan Baru</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {threads.length === 0 ? (
                  <div className="p-2 text-center text-[11px] text-ink-soft">
                    Belum ada riwayat percakapan.
                  </div>
                ) : (
                  threads.slice(0, 8).map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => setActiveThreadId(t.id)}
                      className={cn(t.id === activeThreadId && "font-semibold bg-canvas")}
                    >
                      <span className="truncate">{t.title}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1">
            {/* Open Full Workspace in /asisten */}
            <Link
              href={activeThreadId ? `/asisten` : "/asisten"}
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
              title="Buka tampilan penuh di halaman Asisten"
              aria-label="Buka layar penuh"
            >
              <Maximize2 className="size-4" />
            </Link>

            {/* Close Sheet Button */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
              aria-label="Tutup panel asisten"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Active Context Ribbon (DOM & Page Awareness) */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-rule/60 bg-canvas/60 text-[11px] text-ink-soft shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-semibold text-ink shrink-0">Konteks:</span>
            <span className="truncate text-ink font-medium">{pageContext.label}</span>
            {pageContext.summary && (
              <span className="text-[10px] text-ink-soft truncate">({pageContext.summary})</span>
            )}
          </div>
          <span className="text-[10px] text-ink-soft shrink-0">Live DOM</span>
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div className="flex items-center justify-between bg-destructive/10 border-b border-destructive/20 px-3 py-1.5 text-xs text-destructive shrink-0">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              <span className="text-[11px]">{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="p-1 text-destructive"
            >
              <X className="size-3" />
            </button>
          </div>
        )}

        {/* Conversation Body (ai-elements with Full Dropzone) */}
        <Conversation autoScroll={isStreaming} onDropFiles={handleAttachFiles} className="bg-canvas">
          <ConversationContent className="p-3 space-y-3">
            {messages.length === 0 && !isStreaming ? (
              <ConversationEmptyState
                icon={<Sparkles className="size-8 text-terra" />}
                title="Halo, ada yang bisa Nara bantu?"
                description={`Tanyakan apa saja seputar data di halaman ${pageContext.label}, minta ringkasan, atau instruksikan pencatatan transaksi.`}
              >
                <div className="grid grid-cols-1 gap-2 text-left mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInput(`Jelaskan ringkasan data yang ada di halaman ${pageContext.label}`);
                      handleSendMessage(`Jelaskan ringkasan data yang ada di halaman ${pageContext.label}`);
                    }}
                    className="rounded-xl border border-rule bg-paper p-2.5 text-xs shadow-2xs hover:border-terra/60 transition-all text-left"
                  >
                    <span className="font-semibold text-ink block">Jelaskan Halaman Ini</span>
                    <span className="text-[10px] text-ink-soft">Analisis angka & tabel yang sedang aktif</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInput("Catat transaksi pengeluaran operasional");
                    }}
                    className="rounded-xl border border-rule bg-paper p-2.5 text-xs shadow-2xs hover:border-terra/60 transition-all text-left"
                  >
                    <span className="font-semibold text-ink block">Catat Transaksi Cepat</span>
                    <span className="text-[10px] text-ink-soft">Ketik rincian atau lampirkan foto struk</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1.5 mt-3 text-left w-full">
                  <span className="text-[11px] font-medium text-ink/70">Saran Cepat untuk {pageContext.label}:</span>
                  <Suggestions className="justify-start">
                    {(pageContext.pathname.includes("/jurnal")
                      ? ["Buat jurnal bensin 150rb", "Tampilkan draft belum diposting", "Cari jurnal bulan ini"]
                      : pageContext.pathname.includes("/laporan")
                      ? ["Laporan Laba Rugi bulan ini", "Kenapa laba naik?", "Drill-down beban operasional", "Export laporan PDF"]
                      : pageContext.pathname.includes("/buku-besar")
                      ? ["Periksa mutasi kas", "Cari transaksi > 1 juta", "Cek saldo normal akun"]
                      : ["☀️ Briefing Hari Ini", "Cek kesehatan pembukuan", "Lihat ringkasan kas & bank"]
                    ).map((s) => (
                      <Suggestion
                        key={s}
                        suggestion={s}
                        onClick={(val) => {
                          setInput(val);
                          handleSendMessage(val);
                        }}
                      />
                    ))}
                  </Suggestions>
                </div>
              </ConversationEmptyState>
            ) : (
              messages.map((m) => (
                <Message key={m.id} from={m.role}>
                  <MessageContent from={m.role}>
                    {/* User attachments in rich Grid display */}
                    {m.attachments && m.attachments.length > 0 && (
                      <Attachments variant="grid" className="mb-2.5">
                        {m.attachments.map((att) => (
                          <AttachmentItem key={att.id} attachment={att} variant="grid" />
                        ))}
                      </Attachments>
                    )}

                    {/* Reasoning Accordion */}
                    {m.role === "assistant" && m.reasoning && (
                      <Reasoning defaultOpen={false}>
                        <ReasoningTrigger>Proses Berpikir (Chain of Thought)</ReasoningTrigger>
                        <ReasoningContent>{m.reasoning}</ReasoningContent>
                      </Reasoning>
                    )}

                    {/* Tool Invocations Badge */}
                    {m.toolInvocations && m.toolInvocations.length > 0 && (
                      <div className="my-1.5 flex flex-wrap gap-1">
                        {m.toolInvocations.map((ti, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-[9px] font-mono rounded px-1.5 py-0.2 border-rule text-ink-soft bg-canvas"
                          >
                            ✓ {ti.toolName}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Content */}
                    <MessageResponse>{m.content}</MessageResponse>

                    {/* Batch Document Queue Display */}
                    {m.batchQueue && m.batchQueue.length > 0 && (
                      <Queue className="my-2 border border-ink/15">
                        <QueueSection defaultOpen={true}>
                          <QueueSectionLabel
                            label="Antrean Dokumen Terproses"
                            count={m.batchQueue.length}
                          />
                          <QueueSectionContent>
                            <QueueList>
                              {m.batchQueue.map((item) => (
                                <QueueItem key={item.id}>
                                  <QueueItemIndicator completed={item.status === "ready"} />
                                  <QueueItemContent>
                                    <div className="font-semibold text-xs">{item.vendor}</div>
                                    <QueueItemDescription>
                                      {item.date} • {item.total} ({item.category})
                                    </QueueItemDescription>
                                  </QueueItemContent>
                                </QueueItem>
                              ))}
                            </QueueList>
                          </QueueSectionContent>
                        </QueueSection>
                      </Queue>
                    )}

                    {/* Dynamic Suggestions Chips */}
                    {m.suggestions && m.suggestions.length > 0 && (
                      <Suggestions className="pt-2">
                        {m.suggestions.map((s) => (
                          <Suggestion
                            key={s}
                            suggestion={s}
                            onClick={(val) => {
                              setInput(val);
                              handleSendMessage(val);
                            }}
                          />
                        ))}
                      </Suggestions>
                    )}
                  </MessageContent>
                </Message>
              ))
            )}

            {/* Live Streaming Bubble */}
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

                  {streamingQueue && streamingQueue.length > 0 && (
                    <Queue className="my-2 border border-ink/15">
                      <QueueSection defaultOpen={true}>
                        <QueueSectionLabel label="Antrean Dokumen Terproses" count={streamingQueue.length} />
                        <QueueSectionContent>
                          <QueueList>
                            {streamingQueue.map((item) => (
                              <QueueItem key={item.id}>
                                <QueueItemIndicator completed={item.status === "ready"} />
                                <QueueItemContent>
                                  <div className="font-semibold text-xs">{item.vendor}</div>
                                  <QueueItemDescription>{item.date} • {item.total}</QueueItemDescription>
                                </QueueItemContent>
                              </QueueItem>
                            ))}
                          </QueueList>
                        </QueueSectionContent>
                      </QueueSection>
                    </Queue>
                  )}

                  {streamingSuggestions.length > 0 && (
                    <Suggestions className="pt-2">
                      {streamingSuggestions.map((s) => (
                        <Suggestion
                          key={s}
                          suggestion={s}
                          onClick={(val) => {
                            setInput(val);
                            handleSendMessage(val);
                          }}
                        />
                      ))}
                    </Suggestions>
                  )}
                </MessageContent>
              </Message>
            )}

            {/* Inline Confirmation Card for Mutating Action */}
            {pendingApproval && (
              <div className="my-2 w-full">
                <Confirmation status="pending">
                  <ConfirmationTitle>
                    Konfirmasi: {pendingApproval.toolName.replace(/_/g, " ").toUpperCase()}
                  </ConfirmationTitle>
                  <ConfirmationRequest>
                    <p className="font-sans text-xs text-ink">{pendingApproval.explanation}</p>
                    <div className="rounded-xl bg-canvas p-2.5 font-mono text-[10px] leading-relaxed border border-rule text-ink mt-1">
                      {JSON.stringify(pendingApproval.args, null, 2)}
                    </div>
                  </ConfirmationRequest>
                  <ConfirmationActions>
                    <ConfirmationAction
                      variant="default"
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-7"
                      disabled={confirmingLoading}
                      onClick={() => handleToolDecision(true, false)}
                    >
                      {confirmingLoading ? <Loader2 className="size-3 animate-spin mr-1" /> : <Check className="size-3 mr-1" />}
                      Setujui
                    </ConfirmationAction>

                    <ConfirmationAction
                      variant="destructive"
                      className="text-xs h-7"
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

        {/* Panel Footer: PromptInput (ai-elements) */}
        <div className="border-t border-rule bg-paper p-3 shrink-0">
          <PromptInput
            onSubmit={() => handleSendMessage()}
            onDropFiles={(files) => handleAttachFiles(files)}
          >
            {/* Attachment preview chips */}
            {attachments.length > 0 && (
              <PromptInputHeader>
                <Attachments variant="inline">
                  {attachments.map((att) => (
                    <AttachmentItem
                      key={att.id}
                      attachment={att}
                      variant="inline"
                      onRemove={() => handleRemoveAttachment(att.id)}
                    />
                  ))}
                </Attachments>
              </PromptInputHeader>
            )}

            {uploading && (
              <div className="flex items-center gap-1.5 rounded-lg border border-rule bg-canvas px-2.5 py-1 text-xs text-ink-soft mb-2">
                <Loader2 className="size-3 animate-spin text-terra" />
                <span>Menyiapkan lampiran...</span>
              </div>
            )}

            <PromptInputBody>
              <PromptInputTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tanyakan data halaman ini atau ketik transaksi..."
                disabled={isStreaming}
              />
            </PromptInputBody>

            <PromptInputFooter>
              <PromptInputTools>
                {/* Upload Button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleAttachFiles(e.target.files);
                  }}
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-full border border-rule/70 bg-canvas/60 text-ink-soft hover:text-ink hover:bg-canvas"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || isStreaming}
                      aria-label="Lampirkan berkas"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Lampirkan berkas (Gambar, PDF)</TooltipContent>
                </Tooltip>

                {/* Friendly HITL Tool */}
                <HitlTool
                  allowAll={allowAllForSession}
                  onToggle={() => setAllowAllForSession((v) => !v)}
                  disabled={isStreaming}
                />
              </PromptInputTools>

              {/* Submit Button */}
              <PromptInputSubmit
                isStreaming={isStreaming}
                onStop={handleStopStreaming}
                onClick={() => handleSendMessage()}
                disabled={!input.trim() && attachments.length === 0}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </aside>
    </>
  );
}
