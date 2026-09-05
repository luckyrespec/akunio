"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reverseEntryAction } from "@/server/actions/journal.actions";
import { todayISO } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function ReverseDialog({
  entryId,
  entryNumber,
  open,
  onOpenChange,
}: {
  entryId: string;
  entryNumber?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [dateISO, setDateISO] = useState(() => todayISO());
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm bg-paper border-rule">
        <DialogHeader>
          <DialogTitle className="font-display">
            Buat Jurnal Balikan{entryNumber ? ` ${entryNumber}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor={`rev-date-${entryId}`}>Tanggal balikan</Label>
          <Input id={`rev-date-${entryId}`} type="date" value={dateISO}
                 onChange={(e) => setDateISO(e.target.value)} />
          {error && <p className="text-sm text-credit">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await reverseEntryAction(entryId, dateISO);
                      if (!res.ok) { setError(res.error ?? "Gagal."); return; }
                      onOpenChange(false);
                      router.refresh();
                    })
                  }
                  className="bg-terra hover:bg-terra/90">
            {pending ? "Memproses..." : "Posting Balikan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseButton({ entryId }: { entryId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" className="text-ink-soft hover:text-credit" onClick={() => setOpen(true)}>
        Balikan
      </Button>
      <ReverseDialog entryId={entryId} open={open} onOpenChange={setOpen} />
    </>
  );
}
