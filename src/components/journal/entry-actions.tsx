"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, MoreHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReverseDialog } from "./reverse-button";

export interface EntryActionData {
  id: string;
  number: string;
  canReverse: boolean;
}

export function EntryActions({ entry }: { entry: EntryActionData }) {
  const router = useRouter();
  const [reverseOpen, setReverseOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(entry.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 text-ink-soft hover:text-ink" aria-label={`Aksi ${entry.number}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44 border-rule bg-paper">
          <DropdownMenuItem onSelect={() => router.push(`/jurnal/${entry.id}`)}>
            <Eye className="size-4 text-ink-soft" /> Lihat Detail
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyNumber}>
            {copied
              ? <Check className="size-4 text-debit" />
              : <Copy className="size-4 text-ink-soft" />}
            {copied ? "Nomor disalin!" : "Salin Nomor"}
          </DropdownMenuItem>
          {entry.canReverse && (
            <DropdownMenuItem onSelect={() => setReverseOpen(true)}>
              <Undo2 className="size-4 text-ink-soft" /> Buat Balikan
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {entry.canReverse && (
        <ReverseDialog
          entryId={entry.id}
          entryNumber={entry.number}
          open={reverseOpen}
          onOpenChange={setReverseOpen}
        />
      )}
    </>
  );
}
