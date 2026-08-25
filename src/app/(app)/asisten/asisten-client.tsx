"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Paperclip, X, Sparkles, ChevronDown, ArrowUpRight, Wallet, BarChart3, Search, Receipt, RefreshCw, Loader2 } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

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
  draft?: unknown;
  draftId?: string;
  suggestedDraft?: unknown;
}

const NARA = process.env.NEXT_PUBLIC_ASSISTANT_NAME ?? "Nara";

type Suggestion = { label: string; prompt: string; icon: React.ElementType };

const ICON_MAP: Record<string, React.ElementType> = { Receipt, Wallet, BarChart3, Search };
const STORAGE_KEY = "nara:suggestions:cache:v2";
const STORAGE_TTL = 6 * 60 * 60 * 1000;

export default function AsistenClient({ initialThreads }: { initialThreads: Thread[] }) {
  const [threads, setThreads] = useState<Thread[]>(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(initialThreads[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  // Persist & restore AI suggestions across navigation (6h TTL)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { at: number; data: Array<{ label: string; prompt: string; icon: string }> };
      if (!parsed?.data || !Array.isArray(parsed.data) || Date.now() - parsed.at > STORAGE_TTL) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      const mapped: Suggestion[] = parsed.data.map((s) => ({
        label: s.label,
        prompt: s.prompt,
        icon: ICON_MAP[s.icon] ?? Search,
      }));
      if (mapped.length === 8) {
        setAiSuggestions(mapped);
        setExpanded(true);
      }
    } catch {}
  }, []);

  function persistSuggestions(data: Suggestion[]) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ at: Date.now(), data: data.map((s) => ({ label: s.label, prompt: s.prompt, icon: Object.keys(ICON_MAP).find((k) => ICON_MAP[k] === s.icon) ?? "Search" })) })
      );
    } catch {}
  }

  async function fetchSuggestions() {
    setSuggestionsLoading(true);
    // ensure expanded is true to show skeletons immediately
    setExpanded(true);
    try {
      const res = await fetch(`/api/nara/suggestions`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.suggestions) && data.suggestions.length >= 8) {
        const mapped: Suggestion[] = data.suggestions.map((s: { label: string; prompt: string; icon: string }) => ({
          label: s.label,
          prompt: s.prompt,
          icon: ICON_MAP[s.icon] ?? Search,
        }));
        setAiSuggestions(mapped);
        persistSuggestions(mapped);
        return;
      }
      if (Array.isArray(data.suggestions)) {
        const mapped: Suggestion[] = data.suggestions.map((s: { label: string; prompt: string; icon: string }) => ({
          label: s.label,
          prompt: s.prompt,
          icon: ICON_MAP[s.icon] ?? Search,
        }));
        if (mapped.length) {
          setAiSuggestions(mapped);
          persistSuggestions(mapped);
        }
      }
    } catch {
      // keep button to retry
    } finally {
      setSuggestionsLoading(false);
    }
  }

  function handleToggleSuggestions() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (aiSuggestions) {
      setExpanded(true);
      return;
    }
    fetchSuggestions();
  }

  function handleRefreshSuggestions() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setAiSuggestions(null);
    fetchSuggestions();
  }

  useEffect(() => {
    if (!selectedId) return;
    fetch(`/api/nara/chat?threadId=${selectedId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setMessages(data.map((m: Message & { citations: Message["citations"] }) => ({
          ...m,
          draft: (m as unknown as { draft?: unknown }).draft ?? m.suggestedDraft,
        })));
      })
      .catch(() => {});
  }, [selectedId]);

  async function send() {
    if ((!input.trim() && !file) || sending) return;
    const text = input.trim() || (file ? "Buat jurnal dari dokumen terlampir" : "");
    const currentFile = file;
    setInput("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setSending(true);
    const tempUser: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text + (currentFile ? ` [${currentFile.name}]` : ""),
      citations: null,
    };
    setMessages((m) => [...m, tempUser]);
    try {
      let res: Response;
      if (currentFile) {
        const fd = new FormData();
        if (selectedId) fd.set("threadId", selectedId);
        fd.set("message", text);
        fd.set("file", currentFile);
        res = await fetch("/api/nara/chat", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/nara/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: selectedId, message: text }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal");
      if (!selectedId && data.threadId) {
        setSelectedId(data.threadId);
        setThreads((t) => [{ id: data.threadId, title: text.slice(0, 30) || "Percakapan baru", createdAt: new Date().toISOString() }, ...t]);
      }
      const assistant: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        citations: data.citations,
        draft: data.draft ?? data.suggestedDraft,
        draftId: data.draftId,
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
      <div className="w-64 shrink-0 rounded-xl border border-rule bg-paper p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-terra text-white"><Sparkles className="size-3" /></span>
            <h2 className="text-xs font-medium uppercase tracking-widest text-ink-soft">{NARA}</h2>
          </div>
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
        <div className="border-b border-rule px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-terra text-white">
              <Sparkles className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-medium leading-none">{NARA}</p>
              <p className="text-[11px] text-ink-soft">Tanya apa saja, atau minta buatkan jurnal</p>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-8">
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="text-center"
              >
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-terra text-white shadow-sm">
                  <Sparkles className="size-6" />
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">Hai, saya {NARA}</h3>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                  Mau buat jurnal, cek saldo, atau lihat laporan? Minta saran personal atau tulis pertanyaanmu sendiri.
                </p>
              </motion.div>

              {!expanded ? (
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                  className="mt-8 flex flex-col items-center gap-3"
                >
                  <button
                    onClick={handleToggleSuggestions}
                    disabled={suggestionsLoading}
                    className="inline-flex items-center gap-2 rounded-full bg-terra px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-terra/90 hover:shadow-md disabled:opacity-60"
                  >
                    {suggestionsLoading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Memuat saran personal…
                      </>
                    ) : aiSuggestions ? (
                      <>
                        <Sparkles className="size-4" /> Lihat saran untukmu (8)
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" /> Minta saran dari {NARA} ✨
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-ink-soft">8 saran dipersonalisasi dari jurnal & saldo kamu</p>
                </motion.div>
              ) : (
                <>
                  <motion.div
                    key="ai-grid"
                    initial={shouldReduceMotion ? false : "hidden"}
                    animate="show"
                    variants={{
                      hidden: {},
                      show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
                    }}
                    className="mt-8 grid w-full max-w-[560px] grid-cols-1 gap-2.5 sm:grid-cols-2"
                  >
                    {suggestionsLoading
                      ? Array.from({ length: 8 }).map((_, i) => (
                          <div
                            key={`skeleton-${i}`}
                            className="flex animate-pulse items-center gap-3 rounded-xl border border-rule bg-paper px-3.5 py-3"
                          >
                            <span className="size-8 shrink-0 rounded-full bg-canvas" />
                            <span className="flex-1 space-y-2">
                              <span className="block h-3 w-3/4 rounded bg-canvas" />
                              <span className="block h-2 w-1/2 rounded bg-canvas" />
                            </span>
                          </div>
                        ))
                      : (aiSuggestions ?? []).map((s, idx) => {
                          const Icon = s.icon;
                          return (
                            <motion.button
                              key={`${s.label}-${idx}`}
                              variants={
                                shouldReduceMotion
                                  ? {}
                                  : {
                                      hidden: { opacity: 0, y: 10 },
                                      show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
                                    }
                              }
                              whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                              whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                              onClick={() => {
                                setInput(s.prompt);
                                requestAnimationFrame(() => inputRef.current?.focus());
                              }}
                              className="group flex items-center gap-3 rounded-xl border border-terra/15 bg-terra/[0.06] px-3.5 py-3 text-left shadow-sm transition-colors hover:border-terra/30 hover:bg-terra/10"
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-terra/10 text-terra transition-colors group-hover:bg-terra group-hover:text-white">
                                <Icon className="size-4" />
                              </span>
                              <div className="flex-1">
                                <span className="block text-sm leading-tight font-medium text-ink">{s.label}</span>
                                <span className="mt-0.5 block text-[11px] leading-tight text-ink-soft">✨ untukmu</span>
                              </div>
                              <ArrowUpRight className="size-3.5 shrink-0 text-terra opacity-60 group-hover:opacity-100" />
                            </motion.button>
                          );
                        })}
                  </motion.div>

                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, delay: 0.2 }}
                    className="mt-4 flex items-center gap-2"
                  >
                    <button
                      onClick={handleToggleSuggestions}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper px-4 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
                    >
                      Tutup
                      <ChevronDown className="size-3.5 rotate-180" />
                    </button>
                    <button
                      onClick={handleRefreshSuggestions}
                      disabled={suggestionsLoading}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-canvas hover:text-ink disabled:opacity-60"
                    >
                      <RefreshCw className={`size-3.5 ${suggestionsLoading ? "animate-spin" : ""}`} />
                      Muat ulang
                    </button>
                  </motion.div>
                </>
              )}

              <p className="mt-3 text-[11px] text-ink-soft">Klik saran untuk mengisi — tidak langsung terkirim, kamu bisa edit dulu.</p>
            </div>
          ) : null}
          {messages.length > 0 && (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-xl px-4 py-3 text-sm ${
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
                  {Boolean(m.draft || m.suggestedDraft) && (
                    <div className="mt-3 rounded-lg border border-rule bg-paper p-3 text-xs">
                      <p className="font-medium uppercase tracking-widest text-ink-soft">Draft Jurnal · perlu review</p>
                      <p className="mt-1 text-sm font-medium">{((m.draft ?? m.suggestedDraft) as { memo?: string }).memo ?? "Draft koreksi"}</p>
                      <div className="mt-2 space-y-1">
                        {(((m.draft ?? m.suggestedDraft) as { lines?: Array<{ accountCode: string; debitText: string; creditText: string; reason?: string }> }).lines ?? []).slice(0, 4).map((l, i) => (
                          <div key={i} className="flex justify-between gap-2 font-mono">
                            <span>{l.accountCode}</span>
                            <span className="flex-1 truncate text-ink-soft">{l.reason ?? ""}</span>
                            <span className={l.debitText ? "text-debit" : "text-credit"}>{l.debitText || l.creditText}</span>
                          </div>
                        ))}
                      </div>
                      {m.draftId && (
                        <Link href={`/jurnal/ai/${m.draftId}`}>
                          <Button size="sm" className="mt-3 w-full bg-terra hover:bg-terra/90">Lihat & Posting Draft</Button>
                        </Link>
                      )}
                      {!m.draftId && (
                        <p className="mt-2 text-[11px] text-ink-soft">Draft disiapkan — buka daftar Draft AI untuk review.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
           </div>
          )}
        </div>

        <div className="border-t border-rule p-3">
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-md bg-canvas px-3 py-2 text-xs">
              <Paperclip className="size-3" /> {file.name}
              <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="ml-auto"><X className="size-3" /></button>
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-rule bg-paper hover:bg-canvas">
              <Paperclip className="size-4" />
              <Input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={`Tanya ${NARA}... (Ctrl+Enter kirim)`}
              disabled={sending}
              className="flex-1"
            />
            <Button onClick={send} disabled={sending || (!input.trim() && !file)} className="bg-terra hover:bg-terra/90">
              {sending ? "..." : "Kirim"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
