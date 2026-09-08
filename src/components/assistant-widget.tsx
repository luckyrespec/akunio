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
  PromptInput,
  PromptInputHeader,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Attachments, AttachmentItem } from "@/components/ai-elements/attachments";
import { HitlTool } from "@/components/ai-elements/hitl-tool";
import { getActivePageContext, type PageContext } from "@/lib/assistant-context";
import { useNaraThreads } from "@/hooks/use-nara-threads";
import { useNaraStreamChat, type BatchItemData, type MessageItem } from "@/hooks/use-nara-stream-chat";
import { NaraHitlApprovalCard } from "@/components/ai-elements/nara-hitl-approval-card";
import { NaraMessageFeed } from "@/components/ai-elements/nara-message-feed";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { cn } from "@/lib/utils";

export type { BatchItemData };

export function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const { threads, activeThreadId, setActiveThreadId, refresh, handleCreated } =
    useNaraThreads();
  const [pageContext, setPageContext] = React.useState<PageContext>({
    pathname: "",
    title: "",
    label: "Aplikasi",
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const promptInputRef = React.useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    setMessages,
    input,
    setInput,
    attachments,
    setAttachments,
    uploading,
    isStreaming,
    streamingReasoning,
    streamingText,
    streamingSuggestions,
    streamingTools,
    streamingQueue,
    pendingApproval,
    allowAllForSession,
    setAllowAllForSession,
    confirmingLoading,
    errorBanner,
    setErrorBanner,
    handleAttachFiles,
    handleRemoveAttachment,
    handleSendMessage,
    handleStopStreaming,
    handleToolDecision,
    restorePendingFromMessages,
  } = useNaraStreamChat({
    activeThreadId,
    setActiveThreadId,
    onThreadCreated: (threadId, title) => {
      handleCreated(threadId, title);
    },
  });

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

  // Dibuka dari dasbor (akunio-briefing-card): isi prompt saja, jangan kirim.
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt ?? "";
      setOpen(true);
      setPageContext(getActivePageContext());
      if (prompt) setInput(prompt);
    };
    window.addEventListener("akunio:open-assistant", onOpen);
    return () => window.removeEventListener("akunio:open-assistant", onOpen);
  }, []);

  // Fetch threads list when opened (satu store dengan /asisten)
  React.useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  // NOTE: quick access diam total — tidak ada auto-kirim briefing.
  // Ringkasan hanya dikirim bila user menekan kirim / memilih chip suggest.

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
          const loaded = data.messages ?? [];
          setMessages(loaded);
          restorePendingFromMessages(activeThreadId, loaded);
        }
      } catch (e) {
        console.error("Gagal memuat percakapan", e);
      }
    }
    loadThread();
  }, [activeThreadId, open, setMessages, restorePendingFromMessages]);

  // Proactive Daily Briefing dimatikan (desain diam total):
  // widget tidak pernah mengirim pesan otomatis saat dibuka.
  // Lihat NOTE di atas.

  const handleNewChat = () => {
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setAllowAllForSession(false);
    setErrorBanner(null);
  };

  if (pathname.startsWith("/asisten")) {
    return null;
  }

  const activeThreadTitle =
    threads.find((t) => t.id === activeThreadId)?.title || "Percakapan Baru";

  return (
    <>
      {/* 1. FLOATING QUICK ACCESS TRIGGER (Bottom-Right) */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className={cn(
              "fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full border border-terra/40 bg-paper py-2 pl-2.5 pr-4 text-xs font-semibold text-ink shadow-lg backdrop-blur-md transition-[transform,box-shadow,border-color] duration-200 ease-out hover:scale-102 hover:border-terra hover:shadow-xl active:scale-[0.98] group",
              open && "ring-2 ring-terra/30",
            )}
            aria-label="Buka Asisten Akunio"
          >
            <div className="relative flex size-6.5 items-center justify-center rounded-lg shadow-2xs overflow-hidden">
              <svg viewBox="0 0 32 32" fill="none" aria-hidden className="size-6.5">
                <rect width="32" height="32" rx="7" fill="var(--color-terra)" />
                <g stroke="var(--color-paper)" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M16 7.5 9.2 24" />
                  <path d="M16 7.5 22.8 24" />
                  <path d="M11.9 17.6h8.2" strokeWidth="2" />
                  <path d="M11 20.4h10" strokeWidth="2" />
                </g>
              </svg>
              <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-paper" />
            </div>
            <span className="font-display tracking-tight text-ink font-semibold">Asisten</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs font-medium">
          Asisten Akunio <kbd className="ml-1.5 rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-soft border border-rule/60">Ctrl+J</kbd>
        </TooltipContent>
      </Tooltip>

      {/* Backdrop on mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs lg:hidden transition-opacity duration-200"
          onClick={() => setOpen(false)}
        />
      )}

      {/* 2. RIGHT SIDE-SHEET COPILOT PANEL */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-full sm:w-[420px] md:w-[460px] max-w-full flex-col border-l border-rule bg-paper shadow-2xl transition-transform duration-300 [transition-timing-function:var(--ease-drawer,cubic-bezier(0.32,0.72,0,1))]",
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
            <Link
              href={activeThreadId ? `/asisten?thread=${activeThreadId}` : "/asisten"}
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
              title="Buka tampilan penuh di halaman Asisten"
              aria-label="Buka layar penuh"
            >
              <Maximize2 className="size-4" />
            </Link>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
              aria-label="Tutup asisten"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Dynamic Context Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-rule/60 bg-canvas/60 text-[11px] text-ink-soft shrink-0">
          <div className="flex items-center gap-1.5 truncate">
            <span>Konteks aktif:</span>
            <Badge variant="outline" className="border-terra/30 bg-paper text-terra text-[11px] font-medium h-5 px-1.5">
              {pageContext.label || pageContext.title || "Halaman Ini"}
            </Badge>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-1 text-[11px] text-ink-soft hover:text-ink transition-colors"
              title="Mulai percakapan baru"
            >
              <RotateCcw className="size-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Error Banner */}
        {errorBanner && (
          <div className="flex items-center justify-between bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs text-destructive shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span className="truncate">{errorBanner}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-destructive shrink-0"
              onClick={() => setErrorBanner(null)}
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        {/* Conversation Feed */}
        <Conversation autoScroll={isStreaming} onDropFiles={handleAttachFiles}>
          <ConversationContent className="p-4 space-y-4">
            <NaraMessageFeed
              messages={messages}
              isStreaming={isStreaming}
              streamingText={streamingText}
              streamingReasoning={streamingReasoning}
              streamingTools={streamingTools}
              streamingQueue={streamingQueue}
              streamingSuggestions={streamingSuggestions}
              onSelectSuggestion={(val) => {
                setInput(val);
                promptInputRef.current?.focus();
              }}
              emptyState={
                <ConversationEmptyState
                  icon={<Sparkles className="size-8 text-terra" />}
                  title="Asisten Pembukuan"
                  description={`Ketik transaksi, tanyakan aturan akuntansi, atau minta ringkasan di ${pageContext.label || "halaman ini"}.`}
                >
                  <Suggestions className="flex flex-col gap-2 mt-4 w-full text-left">
                    {pageContext.pathname.includes("/persediaan") ? (
                      <>
                        <Suggestion
                          label="Ekstrak & Input Barang dari File"
                          description="Unggah CSV/Excel atau beri daftar teks untuk dimasukkan ke katalog"
                          suggestion="Tolong bantu ekstrak dan daftarkan barang-barang ini ke master persediaan:"
                          onClick={(val) => {
                            setInput(val);
                            fileInputRef.current?.click();
                          }}
                        />
                        <Suggestion
                          label="Cek Daftar Stok Persediaan"
                          description="Lihat ringkasan barang dengan stok atau harga modalnya"
                          suggestion="Tampilkan daftar barang persediaan yang ada saat ini."
                          onClick={(val) => {
                            setInput(val);
                            promptInputRef.current?.focus();
                          }}
                        />
                      </>
                    ) : pageContext.pathname.includes("/aturan") ? (
                      <>
                        <Suggestion
                          label="Tanya Aturan Bab Ini"
                          description={pageContext.summary ? `Konsultasikan ${pageContext.summary}` : "Penerapan SAK EMKM terhadap kasus usaha Anda"}
                          suggestion={pageContext.summary ? `Bagaimana contoh penerapan dan pencatatan jurnal untuk ${pageContext.summary} di usaha saya?` : "Bagaimana contoh pencatatan jurnal untuk aturan ini di usaha saya?"}
                          onClick={(val) => {
                            setInput(val);
                            promptInputRef.current?.focus();
                          }}
                        />
                        <Suggestion
                          label="Perbedaan dengan SAK Umum"
                          description="Kemudahan dan simplifikasi untuk UMKM pada aturan ini"
                          suggestion={`Apa perbedaan perlakuan akuntansi pada ${pageContext.summary || "bab ini"} dibandingkan SAK Umum / PSAK?`}
                          onClick={(val) => {
                            setInput(val);
                            promptInputRef.current?.focus();
                          }}
                        />
                        <Suggestion
                          label="Kriteria Pengakuan & Pengukuran"
                          description="Syarat transaksi diakui dan diukur dalam laporan keuangan"
                          suggestion={`Jelaskan syarat pengakuan dan pengukuran transaksi menurut ${pageContext.summary || "standar ini"}.`}
                          onClick={(val) => {
                            setInput(val);
                            promptInputRef.current?.focus();
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <Suggestion
                          label="Briefing Keuangan Hari Ini"
                          description="Ringkasan kas masuk, kas keluar, dan tugas hari ini"
                          suggestion="Berikan ringkasan briefing keuangan hari ini."
                          onClick={(val) => {
                            setInput(val);
                            promptInputRef.current?.focus();
                          }}
                        />

                        <Suggestion
                          label="Saldo Kas & Laba Berjalan"
                          description="Cek posisi saldo bank dan performa laba tahun berjalan"
                          suggestion="Berapa saldo kas/bank dan laba bersih bulan berjalan?"
                          onClick={(val) => {
                            setInput(val);
                            promptInputRef.current?.focus();
                          }}
                        />
                      </>
                    )}
                  </Suggestions>
                </ConversationEmptyState>
              }
            />

            {/* Interactive HITL Approval Card */}
            {pendingApproval && (
              <NaraHitlApprovalCard
                pendingApproval={pendingApproval}
                confirmingLoading={confirmingLoading}
                onDecision={handleToolDecision}
              />
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Input Bar */}
        <div className="p-3 border-t border-rule bg-paper shrink-0">
          <PromptInput
            onSubmit={() => handleSendMessage()}
            onDropFiles={(files) => handleAttachFiles(files)}
          >
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
              <div className="flex items-center gap-1.5 rounded-lg border border-rule bg-canvas px-2.5 py-1 text-[11px] text-ink-soft mb-2">
                <Loader2 className="size-3 animate-spin text-terra" />
                <span>Menyiapkan berkas...</span>
              </div>
            )}

            <PromptInputBody>
              <PromptInputTextarea
                ref={promptInputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Tanyakan hal akuntansi atau ketik perintah..."
                disabled={isStreaming}
                className="text-xs min-h-[40px] max-h-[120px]"
              />
            </PromptInputBody>

            <PromptInputFooter>
              <PromptInputTools>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
                      className="size-7 rounded-full border border-rule/70 bg-canvas text-ink-soft hover:text-ink hover:bg-canvas transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || isStreaming}
                      aria-label="Lampirkan nota, PDF, atau spreadsheet CSV/Excel"
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Lampirkan nota, PDF, atau file CSV/Excel</TooltipContent>
                </Tooltip>

                <HitlTool
                  allowAll={allowAllForSession}
                  onToggle={() => setAllowAllForSession((v) => !v)}
                  disabled={isStreaming}
                />
              </PromptInputTools>

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
