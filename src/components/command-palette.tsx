"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { FileText, Library, LayoutDashboard, Package, Receipt, Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { searchGlobalAction, type GlobalSearchResult } from "@/server/actions/search.actions";
import { Input } from "@/components/ui/input";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 500);
  const [results, setResults] = useState<GlobalSearchResult>({ pages: [], journals: [], accounts: [], invoices: [], assets: [] });
  const [pending, startTransition] = useTransition();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults({ pages: [], journals: [], accounts: [], invoices: [], assets: [] });
      return;
    }
    startTransition(async () => {
      const r = await searchGlobalAction(debouncedQuery);
      setResults(r);
    });
  }, [debouncedQuery]);

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const flatItems: Array<{ id: string; href: string }> = [
    ...results.pages.map((p) => ({ id: `page-${p.href}`, href: p.href })),
    ...results.journals.map((j) => ({ id: `journal-${j.id}`, href: `/jurnal/${j.id}` })),
    ...results.accounts.map((a) => ({ id: `account-${a.id}`, href: `/buku-besar/${a.id}` })),
    ...results.invoices.map((inv) => ({ id: `invoice-${inv.id}`, href: `/faktur/${inv.id}` })),
    ...results.assets.map((as) => ({ id: `asset-${as.id}`, href: `/aset/${as.id}` })),
  ];

  useEffect(() => {
    setActiveIndex(0);
  }, [query, results.pages.length, results.journals.length, results.accounts.length, results.invoices.length, results.assets.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-palette-id="${flatItems[activeIndex]?.id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatItems]);

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const target = flatItems[activeIndex];
      if (target) {
        e.preventDefault();
        navigate(target.href);
      }
    }
  }

  const hasResults =
    results.pages.length +
      results.journals.length +
      results.accounts.length +
      results.invoices.length +
      results.assets.length >
    0;

  function paletteItemClass(id: string) {
    return `flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm transition-colors focus-ring ${
      flatItems[activeIndex]?.id === id ? "bg-canvas" : "hover:bg-canvas"
    }`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[8%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden border-rule bg-paper p-0 shadow-[0_8px_40px_rgb(35_42_51/0.12)] sm:max-w-[900px]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Pencarian</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 border-b border-rule px-5 py-4">
          <Search className="size-5 shrink-0 text-ink-soft" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded={hasResults}
            aria-controls="palette-listbox"
            aria-activedescendant={flatItems[activeIndex]?.id}
            placeholder="Cari halaman, jurnal, akun, faktur, aset, nominal…"
            className="h-9 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0"
          />
          <span className="hidden rounded border border-rule bg-canvas px-1.5 py-0.5 text-[11px] leading-none text-ink-soft sm:inline">ESC</span>
        </div>

        <div ref={listRef} id="palette-listbox" role="listbox" aria-label="Hasil pencarian" className="max-h-[480px] overflow-y-auto p-3">
          {!hasResults && !pending && query.trim().length >= 2 && (
            <p className="px-4 py-10 text-center text-sm text-ink-soft">Tidak ada hasil untuk “{query}”.</p>
          )}
          {!hasResults && query.trim().length < 2 && (
            <p className="px-4 py-8 text-center text-sm text-ink-soft">Ketik minimal 2 huruf — coba “Jurnal”, “Kas”, nomor JE, nominal, nama aset, atau nama pelanggan.</p>
          )}

          {results.pages.length > 0 && (
            <Group title="Halaman" icon={LayoutDashboard}>
              {results.pages.map((p) => (
                <button
                  key={p.href}
                  data-palette-id={`page-${p.href}`}
                  role="option"
                  aria-selected={flatItems[activeIndex]?.id === `page-${p.href}`}
                  onClick={() => navigate(p.href)}
                  onMouseMove={() => setActiveIndex(flatItems.findIndex((f) => f.id === `page-${p.href}`))}
                  className={paletteItemClass(`page-${p.href}`)}
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
                  data-palette-id={`journal-${j.id}`}
                  role="option"
                  aria-selected={flatItems[activeIndex]?.id === `journal-${j.id}`}
                  onClick={() => navigate(`/jurnal/${j.id}`)}
                  onMouseMove={() => setActiveIndex(flatItems.findIndex((f) => f.id === `journal-${j.id}`))}
                  className={paletteItemClass(`journal-${j.id}`)}
                >
                  <span className="font-medium">{j.number}</span>
                  <span className="truncate text-ink-soft">{j.memo}</span>
                  <span className="tnum ml-auto shrink-0 font-medium text-ink">{j.totalText}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{j.entryDate}</span>
                </button>
              ))}
            </Group>
          )}

          {results.accounts.length > 0 && (
            <Group title="Akun" icon={Library}>
              {results.accounts.map((a) => (
                <button
                  key={a.id}
                  data-palette-id={`account-${a.id}`}
                  role="option"
                  aria-selected={flatItems[activeIndex]?.id === `account-${a.id}`}
                  onClick={() => navigate(`/buku-besar/${a.id}`)}
                  onMouseMove={() => setActiveIndex(flatItems.findIndex((f) => f.id === `account-${a.id}`))}
                  className={paletteItemClass(`account-${a.id}`)}
                >
                  <span className="font-mono text-xs">{a.code}</span> {a.name}
                </button>
              ))}
            </Group>
          )}

          {results.invoices.length > 0 && (
            <Group title="Faktur" icon={Receipt}>
              {results.invoices.map((inv) => (
                <button
                  key={inv.id}
                  data-palette-id={`invoice-${inv.id}`}
                  role="option"
                  aria-selected={flatItems[activeIndex]?.id === `invoice-${inv.id}`}
                  onClick={() => navigate(`/faktur/${inv.id}`)}
                  onMouseMove={() => setActiveIndex(flatItems.findIndex((f) => f.id === `invoice-${inv.id}`))}
                  className={paletteItemClass(`invoice-${inv.id}`)}
                >
                  <span className="font-mono text-xs font-medium">{inv.invoiceNumber}</span>
                  <span className="truncate text-ink-soft">{inv.contactName}</span>
                  <span className="tnum ml-auto shrink-0 font-medium text-ink">{inv.totalText}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{inv.status}</span>
                </button>
              ))}
            </Group>
          )}

          {results.assets.length > 0 && (
            <Group title="Aset" icon={Package}>
              {results.assets.map((as) => (
                <button
                  key={as.id}
                  data-palette-id={`asset-${as.id}`}
                  role="option"
                  aria-selected={flatItems[activeIndex]?.id === `asset-${as.id}`}
                  onClick={() => navigate(`/aset/${as.id}`)}
                  onMouseMove={() => setActiveIndex(flatItems.findIndex((f) => f.id === `asset-${as.id}`))}
                  className={paletteItemClass(`asset-${as.id}`)}
                >
                  <span className="font-mono text-xs">{as.code}</span>
                  <span className="truncate">{as.name}</span>
                  <span className="tnum ml-auto shrink-0 font-medium text-ink">{as.costText}</span>
                  <span className="shrink-0 text-xs text-ink-soft">{as.status}</span>
                </button>
              ))}
            </Group>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-rule bg-canvas px-5 py-2.5 text-[11px] text-ink-soft">
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
    <div className="pb-3">
      <p className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-medium uppercase tracking-widest text-ink-soft">
        <Icon className="size-3" /> {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
