"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ kind: string; excerpt: string }> | null;
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: text, citations: null }]);
    try {
      const res = await fetch("/api/advisor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal");
      if (!threadId && data.threadId) setThreadId(data.threadId);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: data.answer, citations: data.citations },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: e instanceof Error ? e.message : "Error", citations: null },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-terra text-white shadow-lg transition-transform hover:scale-105"
        aria-label="Buka asisten"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-6 z-40 flex h-[420px] w-[380px] flex-col rounded-xl border border-rule bg-paper shadow-xl">
          <div className="border-b border-rule px-4 py-3">
            <h3 className="font-display text-sm font-medium">Asisten Cepat</h3>
            <p className="text-xs text-ink-soft">Tanya saldo, laba, atau aturan IFRS</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="py-8 text-center text-xs text-ink-soft">
                Tanya sesuatu… contoh: “berapa saldo kas bulan ini?”
              </p>
            )}
            <div className="space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${m.role === "user" ? "bg-terra text-white" : "bg-canvas"}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.citations && m.citations.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.citations.slice(0, 3).map((c, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">
                            {c.kind}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-rule p-2">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Tanya..."
                disabled={sending}
                className="h-8 text-xs"
              />
              <Button size="sm" onClick={send} disabled={sending || !input.trim()} className="bg-terra hover:bg-terra/90">
                Kirim
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
