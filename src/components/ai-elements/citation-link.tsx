"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpen, Building2, Landmark, Package, Receipt, ScrollText, Users } from "lucide-react";
import { parseCitationHref } from "@/components/ai-elements/citation-refs";
import { useCitationSheet } from "@/components/ai-elements/citation-sheet";
import { useItemSheet } from "@/components/ai-elements/item-sheet";
import { useEntitySheet } from "@/components/ai-elements/entity-sheet";
import { cn } from "@/lib/utils";

const CHIP =
  "inline-flex items-center gap-1 rounded-md border border-terra/30 bg-terra/5 px-1.5 py-0.5 align-baseline text-[11px] font-medium text-terra transition-colors hover:border-terra/50 hover:bg-terra/10";

/**
 * Override tag <a> Streamdown untuk sitasi inline Akunio.
 * - "sak:11:11.1" → chip pembuka drawer SAK (atau fallback link /aturan).
 * - "jurnal:JE-…" → chip pembuka drawer rincian jurnal.
 * - "item:BRG-001" → chip pembuka drawer rincian barang.
 * - "akun:5900" → chip pembuka drawer rincian akun COA.
 * - "aset:AST-001" → chip pembuka drawer rincian aset tetap.
 * - "kontak:<id>" → chip pembuka drawer rincian kontak.
 * - "faktur:INV-2026-0001" → chip pembuka drawer rincian faktur.
 * - lainnya → anchor biasa.
 */
export function CitationLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  const sheet = useCitationSheet();
  const itemSheet = useItemSheet();
  const entitySheet = useEntitySheet();
  const ref = parseCitationHref(href ?? "");
  const label =
    typeof children === "string" ? children.replace(/§\s*/g, "paragraf ") : (children ?? "Rujukan");

  if (ref.kind === "sak") {
    if (sheet) {
      return (
        <button
          type="button"
          onClick={() => sheet.openSak(ref.bab, ref.paragraph)}
          className={cn(CHIP, "cursor-pointer")}
          title={`Buka SAK EMKM Bab ${ref.bab}${ref.paragraph ? ` paragraf ${ref.paragraph}` : ""}`}
        >
          <BookOpen className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <a href={`/aturan?bab=${encodeURIComponent(ref.bab)}`} className={CHIP}>
        <BookOpen className="size-3" />
        <span>{label}</span>
      </a>
    );
  }

  if (ref.kind === "jurnal") {
    if (entitySheet) {
      return (
        <button
          type="button"
          onClick={() => entitySheet.openJournal(ref.number)}
          className={cn(CHIP, "cursor-pointer")}
          title={`Buka rincian jurnal ${ref.number}`}
        >
          <ScrollText className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <Link href={`/jurnal?q=${encodeURIComponent(ref.number)}`} className={CHIP} title={ref.number}>
        <ScrollText className="size-3" />
        <span>{label}</span>
      </Link>
    );
  }

  if (ref.kind === "akun") {
    if (entitySheet) {
      return (
        <button
          type="button"
          onClick={() => entitySheet.openAccount(ref.code)}
          className={cn(CHIP, "cursor-pointer")}
          title={`Buka rincian akun ${ref.code}`}
        >
          <Landmark className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <Link href="/pengaturan" className={CHIP}>
        <Landmark className="size-3" />
        <span>{label}</span>
      </Link>
    );
  }

  if (ref.kind === "aset") {
    if (entitySheet) {
      return (
        <button
          type="button"
          onClick={() => entitySheet.openAsset(ref.code)}
          className={cn(CHIP, "cursor-pointer")}
          title={`Buka rincian aset ${ref.code}`}
        >
          <Building2 className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <Link href="/aset" className={CHIP}>
        <Building2 className="size-3" />
        <span>{label}</span>
      </Link>
    );
  }

  if (ref.kind === "kontak") {
    if (entitySheet) {
      return (
        <button
          type="button"
          onClick={() => entitySheet.openContact(ref.id)}
          className={cn(CHIP, "cursor-pointer")}
          title="Buka rincian kontak"
        >
          <Users className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <Link href="/kontak" className={CHIP}>
        <Users className="size-3" />
        <span>{label}</span>
      </Link>
    );
  }

  if (ref.kind === "faktur") {
    if (entitySheet) {
      return (
        <button
          type="button"
          onClick={() => entitySheet.openInvoice(ref.number)}
          className={cn(CHIP, "cursor-pointer")}
          title={`Buka rincian faktur ${ref.number}`}
        >
          <Receipt className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <Link href="/faktur" className={CHIP}>
        <Receipt className="size-3" />
        <span>{label}</span>
      </Link>
    );
  }
  if (ref.kind === "item") {
    if (itemSheet) {
      return (
        <button
          type="button"
          onClick={() => itemSheet.openItem(ref.code)}
          className={cn(CHIP, "cursor-pointer")}
          title={`Buka rincian barang ${ref.code}`}
        >
          <Package className="size-3" />
          <span>{label}</span>
        </button>
      );
    }
    return (
      <Link href="/persediaan/daftar" className={CHIP}>
        <Package className="size-3" />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <a href={ref.href} target="_blank" rel="noreferrer" className="text-terra underline underline-offset-2">
      {label}
    </a>
  );
}
