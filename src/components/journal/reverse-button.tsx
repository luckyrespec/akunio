"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reverseEntryAction } from "@/server/actions/journal.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function ReverseButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateISO, setDateISO] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-ink-soft hover:text-credit">
          Balikan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm bg-paper border-rule">
        <DialogHeader>
          <DialogTitle className="font-display">Buat Jurnal Balikan</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor={`rev-date-${entryId}`}>Tanggal balikan</Label>
          <Input id={`rev-date-${entryId}`} type="date" value={dateISO}
                 onChange={(e) => setDateISO(e.target.value)} />
          {error && <p className="text-sm text-credit">{error}</p>}
        </div>
        <DialogFooter>
          <Button disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await reverseEntryAction(entryId, dateISO);
                      if (!res.ok) { setError(res.error ?? "Gagal."); return; }
                      setOpen(false);
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
