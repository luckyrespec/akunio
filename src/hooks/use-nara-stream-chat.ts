import * as React from "react";
import type { Attachment } from "@/components/ai-elements/attachments";
import type { ModelPreset } from "@/components/ai-elements/model-selector";

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

export interface StreamingToolItem {
  toolName: string;
  status: "running" | "completed" | "error" | "awaiting-approval";
  args?: unknown;
  result?: unknown;
  error?: string;
}

export interface MessageItem {
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
    args?: unknown;
    result?: unknown;
    error?: string;
  }> | null;
  citations?: Array<{ kind: string; ref: string; excerpt: string; section?: string }> | null;
  memoryUsed?: number | null;
  createdAt?: string | Date;
}

export interface PendingApproval {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  explanation: string;
  /** Thread asal permintaan — keputusan (setuju/tolak) selalu dikirim ke thread ini. */
  threadId?: string | null;
}

const LOCAL_THREAD_KEY = "__local__";
function pendingKey(threadId: string | null | undefined): string {
  return threadId ?? LOCAL_THREAD_KEY;
}

type StoredInvocation = {
  callId?: string;
  toolName: string;
  status: string;
  args?: unknown;
};

/**
 * Cari permintaan persetujuan yang belum diputuskan dari riwayat pesan DB.
 * Invokasi yang callId-nya sudah ada keputusan (approved/rejected/failed)
 * di pesan berikutnya dianggap selesai dan diabaikan.
 */
export function findPendingInMessages(
  messages: Array<{ toolInvocations?: StoredInvocation[] | null }>,
): PendingApproval | null {
  const pending = new Map<string, { toolName: string; args: Record<string, unknown>; order: number }>();
  let order = 0;
  for (const m of messages) {
    for (const inv of m.toolInvocations ?? []) {
      order += 1;
      if (!inv.callId) continue;
      if (inv.status === "pending_approval") {
        pending.set(inv.callId, {
          toolName: inv.toolName,
          args: (inv.args as Record<string, unknown>) ?? {},
          order,
        });
      } else if (inv.status === "approved" || inv.status === "rejected" || inv.status === "failed") {
        pending.delete(inv.callId);
      }
    }
  }
  let best: { callId: string; toolName: string; args: Record<string, unknown>; order: number } | null = null;
  for (const [callId, v] of pending) {
    if (!best || v.order > best.order) best = { callId, ...v };
  }
  if (!best) return null;
  return {
    callId: best.callId,
    toolName: best.toolName,
    args: best.args,
    explanation: `Akunio membutuhkan konfirmasi Anda untuk menjalankan '${best.toolName}'.`,
  };
}

interface UseNaraStreamChatOptions {
  activeThreadId: string | null;
  setActiveThreadId?: (threadId: string) => void;
  modelPreset?: ModelPreset;
  initialHitlPolicy?: "smart" | "strict" | "autonomous";
  onThreadCreated?: (threadId: string, title: string) => void;
}

export function useNaraStreamChat({
  activeThreadId,
  setActiveThreadId,
  modelPreset = "fast",
  initialHitlPolicy = "smart",
  onThreadCreated,
}: UseNaraStreamChatOptions) {
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [input, setInput] = React.useState("");
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingReasoning, setStreamingReasoning] = React.useState("");
  const [streamingText, setStreamingText] = React.useState("");
  const [streamingSuggestions, setStreamingSuggestions] = React.useState<string[]>([]);
  const [streamingTools, setStreamingTools] = React.useState<StreamingToolItem[]>([]);
  const [streamingQueue, setStreamingQueue] = React.useState<BatchItemData[] | null>(null);
  // Persetujuan HITL wajib terikat ke thread asalnya — bukan state global —
  // agar kartu konfirmasi tidak bocor ke session lain saat user berpindah thread.
  const [pendingMap, setPendingMap] = React.useState<Record<string, PendingApproval>>({});
  const pendingApproval = pendingMap[pendingKey(activeThreadId)] ?? null;
  // Thread yang sedang dilihat user (cermin prop) vs thread milik stream yang berjalan.
  const viewThreadRef = React.useRef<string | null>(activeThreadId);
  React.useEffect(() => {
    viewThreadRef.current = activeThreadId;
  }, [activeThreadId]);

  const setPendingForThread = React.useCallback(
    (threadId: string | null, approval: PendingApproval | null) => {
      const key = pendingKey(threadId);
      setPendingMap((prev) => {
        if (!approval) {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return { ...prev, [key]: { ...approval, threadId } };
      });
    },
    [],
  );

  const setPendingApproval = React.useCallback(
    (approval: PendingApproval | null) => {
      setPendingForThread(viewThreadRef.current, approval);
    },
    [setPendingForThread],
  );

  /** Pulihkan kartu persetujuan dari pesan DB (mis. setelah reload) bila thread belum punya yang aktif. */
  const restorePendingFromMessages = React.useCallback(
    (threadId: string | null, loaded: MessageItem[]) => {
      setPendingMap((prev) => {
        if (prev[pendingKey(threadId)]) return prev;
        const found = findPendingInMessages(loaded);
        if (!found) return prev;
        return { ...prev, [pendingKey(threadId)]: { ...found, threadId } };
      });
    },
    [],
  );
  const [allowAllForSession, setAllowAllForSession] = React.useState(
    initialHitlPolicy === "autonomous",
  );
  const [confirmingLoading, setConfirmingLoading] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState<string | null>(null);

  const pendingFilesRef = React.useRef<Map<string, File>>(new Map());
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Attach files locally with instant preview (Deferred zero-orphan upload)
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
      const filtered = newAttachments.filter((n) => !existingKeys.has(`${n.fileName}-${n.sizeBytes}`));
      return [...prev, ...filtered];
    });
  }, []);

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

  const handleStopStreaming = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  }, []);

  const handleSendMessage = React.useCallback(
    async (textToSend?: string) => {
      const prompt = (textToSend ?? input).trim();
      if (!prompt && attachments.length === 0) return;
      if (isStreaming || uploading) return;

      setErrorBanner(null);

      // Just-in-time upload of local attachments
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
      // Giliran baru menggantikan persetujuan pending di thread ini saja.
      setPendingForThread(activeThreadId, null);
      // Thread pemilik stream ini (bisa berubah null -> id baru via event init).
      let streamThreadId: string | null = activeThreadId;

      const userMessage: MessageItem = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: prompt || "Lampiran dikirim",
        attachments: readyAttachments.length > 0 ? [...readyAttachments] : null,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
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
            attachments: readyAttachments,
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
        let accumulatedText = "";
        let accumulatedReasoning = "";
        let accumulatedSuggestions: string[] = [];
        let accumulatedQueue: BatchItemData[] = [];
        const accumulatedTools: StreamingToolItem[] = [];

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
                streamThreadId = data.threadId;
                if (!activeThreadId) {
                  if (setActiveThreadId) setActiveThreadId(data.threadId);
                  const smartTitle = data.title || prompt.split(/\s+/).slice(0, 3).join(" ") || "Percakapan Baru";
                  if (onThreadCreated) onThreadCreated(data.threadId, smartTitle);
                }
              } else if (data.type === "reasoning" && data.delta) {
                accumulatedReasoning += data.delta;
                setStreamingReasoning((prev) => prev + data.delta);
              } else if (data.type === "text" && data.delta) {
                accumulatedText += data.delta;
                setStreamingText((prev) => prev + data.delta);
              } else if (data.type === "tool_call") {
                accumulatedTools.push({
                  toolName: data.tool,
                  status: "running",
                  args: data.args,
                });
                setStreamingTools([...accumulatedTools]);
              } else if (data.type === "tool_result") {
                const t = accumulatedTools.find((x) => x.toolName === data.tool && x.status === "running");
                if (t) {
                  t.status = "completed";
                  t.result = data.result;
                }
                setStreamingTools([...accumulatedTools]);
              } else if (data.type === "tool_approval_request") {
                accumulatedTools.push({
                  toolName: data.toolName,
                  status: "awaiting-approval",
                  args: data.args,
                });
                setStreamingTools([...accumulatedTools]);
                // Ikat ke thread pemilik stream — jangan pernah ke thread yang sedang dilihat.
                setPendingForThread(streamThreadId, {
                  callId: data.callId,
                  toolName: data.toolName,
                  args: data.args,
                  explanation: data.explanation,
                });
              } else if (data.type === "suggestions" && Array.isArray(data.suggestions)) {
                accumulatedSuggestions = data.suggestions;
                setStreamingSuggestions(data.suggestions);
              } else if (data.type === "queue_update" && Array.isArray(data.items)) {
                accumulatedQueue = data.items;
                setStreamingQueue(data.items);
              } else if (data.type === "error") {
                setErrorBanner(data.message);
              } else if (data.type === "done") {
                // Jangan tempel pesan ke tampilan bila user sudah pindah thread —
                // pesan sudah tersimpan di DB di thread yang benar.
                if (streamThreadId !== viewThreadRef.current) continue;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: data.messageId || `asst-${Date.now()}`,
                    role: "assistant",
                    content: accumulatedText,
                    reasoning: accumulatedReasoning || undefined,
                    toolInvocations: accumulatedTools.length > 0 ? accumulatedTools : undefined,
                    suggestions: accumulatedSuggestions.length > 0 ? accumulatedSuggestions : undefined,
                    batchQueue: accumulatedQueue.length > 0 ? accumulatedQueue : undefined,
                    citations: data.citations,
                    memoryUsed: typeof data.memoryUsed === "number" ? data.memoryUsed : undefined,
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
        setStreamingTools([]);
        setStreamingSuggestions([]);
        setStreamingQueue(null);
      }
    },
    [
      input,
      attachments,
      isStreaming,
      uploading,
      activeThreadId,
      modelPreset,
      allowAllForSession,
      setActiveThreadId,
      onThreadCreated,
      setPendingForThread,
    ],
  );

  const handleToolDecision = React.useCallback(
    async (approved: boolean, allowAll = false) => {
      if (!pendingApproval) return;
      // Selalu eksekusi di thread asal permintaan — bukan thread yang sedang dilihat.
      const decisionThreadId = pendingApproval.threadId ?? activeThreadId;
      if (!decisionThreadId) return;

      setConfirmingLoading(true);
      try {
        const res = await fetch("/api/nara/chat/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: decisionThreadId,
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

        // Hanya tempel pesan balasan bila user masih melihat thread yang sama.
        if (decisionThreadId === viewThreadRef.current) {
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
        }
        setPendingForThread(decisionThreadId, null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Gagal memproses persetujuan.";
        setErrorBanner(msg);
      } finally {
        setConfirmingLoading(false);
      }
    },
    [pendingApproval, activeThreadId, setPendingForThread],
  );

  return {
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
    setPendingApproval,
    setPendingForThread,
    restorePendingFromMessages,
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
  };
}
