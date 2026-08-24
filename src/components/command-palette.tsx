"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Library, LayoutDashboard, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { searchGlobalAction, type GlobalSearchResult } from "@/server/actions/search.actions";
import { Input } from "@/components/ui/input";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult>({ pages: [], journals: [], accounts: [] });
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults({ pages: [], journals: [], accounts: [] });
      return;
    }
    const t = setTimeout(() => {
      startTransition(async () => {
        const r = await searchGlobalAction(query);
        setResults(r);
      });
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const hasResults = results.pages.length + results.journals.length + results.accounts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[22%] max-w-[560px] gap-0 overflow-hidden border-rule bg-paper p-0 shadow-[0_8px_40px_rgb(35_42_51/0.12)]">
        <DialogHeader className="sr-only">
          <DialogTitle>Pencarian</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-rule px-4 py-3">
          <Search className="size-4 shrink-0 text-ink-soft" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari halaman, jurnal, akun…"
            className="h-7 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span className="hidden rounded border border-rule bg-canvas px-1.5 py-0.5 text-[10px] leading-none text-ink-soft sm:inline">ESC</span>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          {!hasResults && !pending && query.trim().length >= 2 && (
            <p className="px-3 py-8 text-center text-sm text-ink-soft">Tidak ada hasil untuk “{query}”.</p>
          )}
          {!hasResults && query.trim().length < 2 && (
            <p className="px-3 py-6 text-center text-xs text-ink-soft">Ketik minimal 2 huruf — coba “Jurnal”, “Kas”, atau nomor JE.</p>
          )}

          {results.pages.length > 0 && (
            <Group title="Halaman" icon={LayoutDashboard}>
              {results.pages.map((p) => (
                <button
                  key={p.href}
                  onClick={() => navigate(p.href)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-canvas"
                >
                  <span className="text-ink-soft">↗</span> {p.label}
                  <span className="ml-auto text-xs text-ink-soft">{p.href}</span>
                </button>
              ))}
            </Group>
          )}

          {results.journals.length > 0 && (
            <Group title="Jurnal" icon={FileText}>
              {results.journals.map((j) => (
                <button
                  key={j.id}
                  onClick={() => navigate(`/jurnal?highlight=${j.number}`)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-canvas"
                >
                  <span className="font-medium">{j.number}</span>
                  <span className="truncate text-ink-soft">{j.memo}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-soft">{j.entryDate}</span>
                </button>
              ))}
            </Group>
          )}

          {results.accounts.length > 0 && (
            <Group title="Akun" icon={Library}>
              {results.accounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/buku-besar?account=${a.id}`)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-canvas"
                >
                  <span className="font-mono text-xs">{a.code}</span> {a.name}
                </button>
              ))}
            </Group>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-rule bg-canvas px-3 py-2 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3" /> Enter untuk buka · ↑↓ navigasi
          </span>
          <span>⌘K untuk buka/tutup</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Group({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="pb-2">
      <p className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-widest text-ink-soft">
        <Icon className="size-3" /> {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
