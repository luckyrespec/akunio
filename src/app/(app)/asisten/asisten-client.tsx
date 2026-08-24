"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { createCorrectionDraftAction } from "@/server/actions/advisor.actions";

interface Thread {
  id: string;
  title: string;
  createdAt: string | Date;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Array<{ kind: string; ref: string; excerpt: string; section?: string }> | null;
  suggestedDraft?: unknown;
}

export default function AsistenClient({ initialThreads }: { initialThreads: Thread[] }) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/advisor/chat?threadId=${selectedId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});
  }, [selectedId]);

  async function send() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    // Optimistic user message
    const tempUser: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      citations: null,
    };
    setMessages((m) => [...m, tempUser]);
    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal");
      if (!selectedId && data.threadId) {
        setSelectedId(data.threadId);
        setThreads((t) => [{ id: data.threadId, title: text.slice(0, 30), createdAt: new Date().toISOString() }, ...t]);
      }
      const assistant: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        citations: data.citations,
        suggestedDraft: data.suggestedDraft,
      };
      setMessages((m) => [...m, assistant]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: e instanceof Error ? e.message : "Terjadi kesalahan.",
          citations: null,
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Thread list */}
      <div className="w-56 shrink-0 rounded-xl border border-rule bg-paper p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-widest text-ink-soft">Percakapan</h2>
          <Button size="sm" variant="ghost" onClick={() => { setSelectedId(null); setMessages([]); }}>
            Baru
          </Button>
        </div>
        <div className="mt-3 space-y-1">
          {threads.length === 0 && <p className="text-xs text-ink-soft">Belum ada percakapan.</p>}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedId(t.id)}
              className={`w-full truncate rounded-md px-3 py-2 text-left text-sm ${selectedId === t.id ? "bg-canvas font-medium text-terra" : "hover:bg-canvas"}`}
            >
              {t.title}
            </button>
          ))}
        </div>
      </div>

      {/* Chat pane */}
      <div className="flex flex-1 flex-col rounded-xl border border-rule bg-paper">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="py-12 text-center text-sm text-ink-soft">
              Tanya kondisi kas, laba, atau aturan IFRS… Contoh: “berapa saldo kas?”
            </p>
          )}
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-xl px-4 py-3 text-sm ${
                    m.role === "user" ? "bg-terra text-white" : "bg-canvas"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.citations.map((c, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className={
                            c.kind === "ifrs"
                              ? "border-terra/30 bg-terra/10 text-terra"
                              : "border-debit/30 bg-debit/10 text-debit"
                          }
                          title={c.excerpt}
                        >
                          {c.kind === "ifrs" ? `IFRS ${c.section ?? ""}`.trim() : `Jurnal ${c.ref.slice(0, 8)}`}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {Boolean(m.suggestedDraft) && (
                    <Button
                      size="sm"
                      className="mt-2 bg-terra hover:bg-terra/90"
                      onClick={async () => {
                        const res = await createCorrectionDraftAction({
                          threadId: selectedId ?? "",
                          draft: m.suggestedDraft,
                        });
                        if (res.ok && res.draftId) {
                          window.location.href = `/jurnal/ai/${res.draftId}`;
                        }
                      }}
                    >
                      Buat draft koreksi
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-rule p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Tanya advisor... (Cmd+Enter untuk kirim)"
              disabled={sending}
              className="flex-1"
            />
            <Button onClick={send} disabled={sending || !input.trim()} className="bg-terra hover:bg-terra/90">
              {sending ? "..." : "Kirim"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
