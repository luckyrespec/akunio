"use client";

import * as React from "react";
import {
  Sparkles,
  Plus,
  X,
  SidebarOpen,
  Receipt,
  FileSpreadsheet,
  AlertCircle,
  RotateCcw,
  MessageSquare,
  FileText,
  Shield,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { ModelSelector, type ModelPreset } from "@/components/ai-elements/model-selector";
import { HitlTool } from "@/components/ai-elements/hitl-tool";
import { useNaraStreamChat } from "@/hooks/use-nara-stream-chat";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import { NaraHitlApprovalCard } from "@/components/ai-elements/nara-hitl-approval-card";
import { NaraMessageFeed } from "@/components/ai-elements/nara-message-feed";
import { AsistenSidebar } from "./_components/asisten-sidebar";
import { AsistenSearchModal, type ThreadItem } from "./_components/asisten-search-modal";
import { AsistenDeleteModal } from "./_components/asisten-delete-modal";
import { AsistenLibraryView, type LibraryFile } from "./_components/asisten-library-view";

export default function AsistenClient({
  initialThreads,
  initialHitlPolicy = "smart",
  userEmail,
}: {
  initialThreads: ThreadItem[];
  initialHitlPolicy?: "smart" | "strict" | "autonomous";
  userEmail?: string;
}) {
  const [threads, setThreads] = React.useState<ThreadItem[]>(initialThreads);
  const [activeThreadId, setActiveThreadId] = React.useState<string | null>(
    initialThreads[0]?.id ?? null,
  );
  const [currentView, setCurrentView] = React.useState<"chat" | "library">("chat");
  const [modelPreset, setModelPreset] = React.useState<ModelPreset>("fast");
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [searchModalOpen, setSearchModalOpen] = React.useState(false);
  const [deletingThreadId, setDeletingThreadId] = React.useState<string | null>(null);

  // Library view state
  const [libraryFiles, setLibraryFiles] = React.useState<LibraryFile[]>([]);
  const [libraryLoading, setLibraryLoading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
    modelPreset,
    initialHitlPolicy,
    onThreadCreated: (threadId, title) => {
      setThreads((prev) => [
        {
          id: threadId,
          title,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ...prev,
      ]);
    },
  });

  // Testability marker: effects run only after hydration commits, so e2e
  // can wait for this instead of racing keystrokes against hydration.
  React.useEffect(() => {
    document.body.dataset.asistenReady = "1";
    return () => {
      delete document.body.dataset.asistenReady;
    };
  }, []);

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
        const loaded = data.messages ?? [];
        setMessages(loaded);
        // Pulihkan kartu persetujuan milik thread ini bila ada yang belum diputuskan.
        restorePendingFromMessages(activeThreadId, loaded);
      } catch (err) {
        console.error("Gagal memuat pesan sesi", err);
      }
    }

    loadThread();
  }, [activeThreadId, currentView, setMessages, restorePendingFromMessages]);

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
      console.error("Gagal memuat pustaka dokumen", err);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (currentView === "library") {
      fetchLibraryFiles();
    }
  }, [currentView, fetchLibraryFiles]);

  const handleLibraryUpload = async (files: FileList | File[]) => {
    const validFiles = Array.from(files);
    if (validFiles.length === 0) return;

    setErrorBanner(null);
    try {
      const fd = new FormData();
      for (const f of validFiles) fd.append("files", f);

      const res = await fetch("/api/nara/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengunggah berkas.");
      }

      fetchLibraryFiles();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Gagal mengunggah berkas.");
    }
  };

  const handleNewChat = () => {
    setCurrentView("chat");
    setActiveThreadId(null);
    setMessages([]);
    setInput("");
    setAttachments([]);
    setAllowAllForSession(initialHitlPolicy === "autonomous");
    setErrorBanner(null);
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/nara/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });

      if (res.ok) {
        const updated = await res.json();
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, title: updated.title } : t)),
        );
      }
    } catch (err) {
      console.error("Gagal mengubah nama sesi", err);
    }
  };

  const handleTogglePin = async (thread: ThreadItem) => {
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
            return (
              new Date(b.updatedAt || b.createdAt).getTime() -
              new Date(a.updatedAt || a.createdAt).getTime()
            );
          });
        });
      }
    } catch (err) {
      console.error("Gagal mengubah status pin sesi", err);
    }
  };

  const handleDeleteThread = async () => {
    if (!deletingThreadId) return;
    try {
      const res = await fetch(`/api/nara/threads/${deletingThreadId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== deletingThreadId));
        if (activeThreadId === deletingThreadId) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Gagal menghapus sesi", err);
    } finally {
      setDeletingThreadId(null);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas">
      {/* 1. SIDEBAR */}
      <AsistenSidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentView={currentView}
        setCurrentView={setCurrentView}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={(id) => setActiveThreadId(id)}
        onNewChat={handleNewChat}
        onOpenSearch={() => setSearchModalOpen(true)}
        onRenameThread={handleRenameThread}
        onTogglePin={handleTogglePin}
        onDeleteRequest={(id) => setDeletingThreadId(id)}
        userEmail={userEmail}
      />

      {/* 2. MODALS */}
      <AsistenSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        threads={threads}
        onSelectThread={(id) => {
          setCurrentView("chat");
          setActiveThreadId(id);
        }}
      />

      <AsistenDeleteModal
        isOpen={Boolean(deletingThreadId)}
        onClose={() => setDeletingThreadId(null)}
        onConfirm={handleDeleteThread}
      />

      {/* 3. KONTEN UTAMA: PUSTAKA ATAU CHAT */}
      {currentView === "library" ? (
        <AsistenLibraryView
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          libraryFiles={libraryFiles}
          libraryLoading={libraryLoading}
          onUploadFiles={handleLibraryUpload}
          uploading={uploading}
          onAskFileInChat={(file) => {
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
        />
      ) : (
        <main className="relative flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
          {/* Main Header */}
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
              <span className="text-xs md:text-sm font-semibold text-ink truncate max-w-md">
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
          <Conversation autoScroll={isStreaming} onDropFiles={handleAttachFiles}>
            <ConversationContent>
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
                  handleSendMessage(val);
                }}
                emptyState={
                  <ConversationEmptyState
                    icon={<Sparkles className="size-10 text-terra" />}
                    title="Mulai pencatatan atau konsultasi"
                    description="Tanyakan posisi keuangan, minta ringkasan laba rugi, atau catat transaksi dari nota pengeluaran."
                  >
                    <Suggestions className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-left mt-4 w-full">
                      <Suggestion
                        icon={<Receipt className="size-4 text-amber-700" />}
                        label="Catat Pengeluaran"
                        description="Beli ATK, bensin, atau konsumsi operasional"
                        suggestion="Catat transaksi pembelian perlengkapan kantor Rp 350.000 tunai"
                        onClick={(prompt) => {
                          setInput(prompt);
                        }}
                      />

                      <Suggestion
                        icon={<FileSpreadsheet className="size-4 text-emerald-700" />}
                        label="Laporan Laba Rugi"
                        description="Periksa pendapatan dan rincian beban berjalan"
                        suggestion="Tampilkan ringkasan laporan laba rugi bulan ini"
                        onClick={(prompt) => {
                          setInput(prompt);
                          handleSendMessage(prompt);
                        }}
                      />

                      <Suggestion
                        icon={<FileText className="size-4 text-blue-700" />}
                        label="Posisi Kas & Laba"
                        description="Cek saldo kas, bank, dan laba tahun berjalan"
                        suggestion="Berapa saldo kas dan performa laba tahun berjalan?"
                        onClick={(prompt) => {
                          setInput(prompt);
                          handleSendMessage(prompt);
                        }}
                      />

                      <Suggestion
                        icon={<Shield className="size-4 text-purple-700" />}
                        label="Cek Kesehatan Jurnal"
                        description="Deteksi anomali akun gantung atau saldo minus"
                        suggestion="Cek kepatuhan dan diagnosa kesehatan pembukuan."
                        onClick={(prompt) => {
                          setInput(prompt);
                          handleSendMessage(prompt);
                        }}
                      />
                    </Suggestions>
                  </ConversationEmptyState>
                }
              />

              {/* Interactive Approval Card */}
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

          {/* Prompt Input Bar */}
          <div className="border-t border-rule bg-paper/80 p-3 md:p-5 backdrop-blur-md shrink-0">
            <div className="mx-auto max-w-4xl lg:max-w-5xl">
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
                  <div className="flex items-center gap-1.5 rounded-xl border border-rule bg-canvas px-3 py-1 text-xs text-ink-soft mb-2">
                    <Loader2 className="size-3.5 animate-spin text-terra" />
                    <span>Menyiapkan lampiran & mengirim...</span>
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

                    <HitlTool
                      allowAll={allowAllForSession}
                      onToggle={() => setAllowAllForSession((v) => !v)}
                      disabled={isStreaming}
                    />

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
                      <TooltipContent side="top">Pilih Mode (Cepat / Analis)</TooltipContent>
                    </Tooltip>
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
          </div>
        </main>
      )}
    </div>
  );
}
