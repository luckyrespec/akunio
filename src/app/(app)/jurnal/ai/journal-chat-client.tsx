"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Send, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { journalAiChatAction } from "@/server/actions/journal-ai.actions";
import { Money } from "@/core/money/money";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  draft?: {
    id?: string;
    memo: string;
    lines: Array<{ accountCode: string; debitText: string; creditText: string; confidence: number; reason: string }>;
    overallConfidence: number;
    explanation: string;
  };
  draftId?: string;
}

export function JournalChatClient({
  quotaUsed,
  quotaLimit,
}: {
  quotaUsed: number;
  quotaLimit: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send() {
    if ((!input.trim() && !file) || sending) return;
    const text = input.trim() || (file ? "Buat jurnal dari dokumen terlampir" : "");
    const currentFile = file;
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text + (currentFile ? ` [file: ${currentFile.name}]` : ""),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setSending(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.set("message", text);
      fd.set("history", JSON.stringify(history));
      if (currentFile) fd.set("file", currentFile);

      const res = await journalAiChatAction(fd);
      if (!res.ok) throw new Error(res.error ?? "Gagal");

      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.answer ?? "",
        draft: res.draft as ChatMessage["draft"],
        draftId: res.draftId,
      };
      setMessages((m) => [...m, assistant]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: e instanceof Error ? e.message : "Error", draft: undefined },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] flex-col rounded-xl border border-rule bg-paper">
      <div className="border-b border-rule px-4 py-2.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-soft">Chat Copilot Jurnal</p>
          <Badge variant="outline" className="text-[10px]">
            {quotaUsed}/{quotaLimit} draft bulan ini
          </Badge>
        </div>
        <p className="mt-1 text-xs text-ink-soft">
          Tulis deskripsi transaksi atau unggah faktur — asisten akan buatkan draft via function calling. Draft tetap perlu persetujuan sebelum diposting.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm text-ink-soft">Mulai percakapan — contoh:</p>
            <p className="mt-2 text-sm italic text-ink">“bayar sewa kantor 3 bulan 15 juta via BCA”</p>
            <p className="mt-1 text-xs text-ink-soft">atau unggah foto faktur dengan tombol klip</p>
          </div>
        )}
        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-xl px-4 py-3 text-sm ${
                  m.role === "user" ? "bg-terra text-white" : "bg-canvas"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.draft && (
                  <div className="mt-3 rounded-lg border border-rule bg-paper p-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-ink-soft">Draft Jurnal</p>
                    <p className="mt-1 text-sm font-medium">{m.draft.memo}</p>
                    <div className="mt-2 space-y-1">
                      {m.draft.lines.map((l, i) => (
                        <div key={i} className="flex justify-between gap-2 text-xs">
                          <span className="font-mono">{l.accountCode}</span>
                          <span className="flex-1 text-ink-soft">{l.reason}</span>
                          <span className={l.debitText ? "text-debit" : "text-credit"}>
                            {l.debitText || l.creditText}
                          </span>
                        </div>
                      ))}
                    </div>
                    {m.draftId && (
                      <Link href={`/jurnal/ai/${m.draftId}`}>
                        <Button size="sm" className="mt-3 w-full bg-terra hover:bg-terra/90">
                          Lihat & Posting Draft
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-rule p-3">
        {file && (
          <div className="mb-2 flex items-center gap-2 rounded-md bg-canvas px-3 py-2 text-xs">
            <Paperclip className="size-3" /> {file.name}
            <button onClick={() => setFile(null)} className="ml-auto">
              <X className="size-3" />
            </button>
          </div>
        )}
        {error && <p className="mb-2 text-xs text-credit">{error}</p>}
        <div className="flex gap-2">
          <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-rule bg-paper hover:bg-canvas">
            <Paperclip className="size-4" />
            <Input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Tulis transaksi..."
            disabled={sending}
            className="flex-1"
          />
          <Button onClick={send} disabled={sending || (!input.trim() && !file)} className="bg-terra hover:bg-terra/90">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
