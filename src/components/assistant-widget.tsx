"use client";

import { useRef, useState } from "react";
import { MessageCircle, X, Paperclip, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ kind: string; excerpt: string; section?: string }> | null;
  draft?: unknown;
  draftId?: string;
}

const ASSISTANT_NAME = process.env.NEXT_PUBLIC_ASSISTANT_NAME ?? "Nara";

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send() {
    if ((!input.trim() && !file) || sending) return;
    const text = input.trim() || (file ? "Buat jurnal dari dokumen terlampir" : "");
    const currentFile = file;
    setInput("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setSending(true);
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", content: text + (currentFile ? ` [${currentFile.name}]` : ""), citations: null }]);
    try {
      let res: Response;
      if (currentFile) {
        const fd = new FormData();
        if (threadId) fd.set("threadId", threadId);
        fd.set("message", text);
        fd.set("file", currentFile);
        res = await fetch("/api/nara/chat", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/nara/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId, message: text }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal");
      if (!threadId && data.threadId) setThreadId(data.threadId);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", content: data.answer, citations: data.citations, draft: data.draft ?? data.suggestedDraft, draftId: data.draftId },
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
        <div className="fixed bottom-20 right-6 z-40 flex h-[520px] w-[380px] flex-col rounded-xl border border-rule bg-paper shadow-xl">
          <div className="border-b border-rule px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-terra text-white"><Sparkles className="size-3" /></span>
              <h3 className="font-display text-sm font-medium">{ASSISTANT_NAME}</h3>
              <span className="text-[10px] uppercase tracking-widest text-ink-soft">Asisten Keuangan</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">Tanya saldo, buat jurnal, cek laporan — semua via chat</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="py-8 text-center text-xs text-ink-soft">
                Hai, saya {ASSISTANT_NAME}! Tanya “berapa saldo kas?” atau “buatkan jurnal bayar sewa 2jt via bank” — saya eksekusi via tool tapi tetap minta review Anda.
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
                          <Badge key={i} variant="outline" className="text-[10px]" title={(c as { excerpt?: string }).excerpt}>
                            {c.kind === "ifrs" ? `IFRS ${c.section ?? ""}`.trim() : c.kind}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {Boolean(m.draft) && (
                      <div className="mt-2 rounded-md border border-rule bg-paper p-2">
                        <p className="text-[10px] font-medium uppercase tracking-widest text-ink-soft">Draft siap review</p>
                        <p className="mt-1 text-xs font-medium">{(m.draft as { memo?: string }).memo ?? "Draft jurnal"}</p>
                        {(m.draft as { lines?: Array<{ accountCode: string; debitText: string; creditText: string }> }).lines?.slice(0, 3).map((l, i) => (
                          <div key={i} className="mt-1 flex justify-between gap-2 font-mono text-[11px]">
                            <span>{l.accountCode}</span><span className={l.debitText ? "text-debit" : "text-credit"}>{l.debitText || l.creditText}</span>
                          </div>
                        ))}
                        {m.draftId && (
                          <Link href={`/jurnal/ai/${m.draftId}`}>
                            <Button size="sm" className="mt-2 h-6 w-full bg-terra text-[10px] hover:bg-terra/90">Lihat & Review Draft</Button>
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-rule p-2">
            {file && (
              <div className="mb-2 flex items-center gap-2 rounded-md bg-canvas px-3 py-2 text-xs">
                <Paperclip className="size-3" /> {file.name}
                <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="ml-auto"><X className="size-3" /></button>
              </div>
            )}
            <div className="flex gap-2">
              <label className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-rule bg-paper hover:bg-canvas">
                <Paperclip className="size-3.5" />
                <Input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
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
                placeholder="Tulis transaksi atau tanya..."
                disabled={sending}
                className="h-8 flex-1 text-xs"
              />
              <Button size="sm" onClick={send} disabled={sending || (!input.trim() && !file)} className="bg-terra hover:bg-terra/90">
                Kirim
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
