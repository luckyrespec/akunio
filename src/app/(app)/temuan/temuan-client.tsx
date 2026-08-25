"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Reveal, Stagger, staggerItem } from "@/components/motion";
import { motion } from "motion/react";
import { resolveFindingAction, dismissFindingAction, proposeCorrectionAction } from "./actions";
import { useRouter } from "next/navigation";

type Finding = {
  id: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: string;
  evidence: Record<string, unknown> | null;
  createdAt: string | Date;
};

function severityStyle(s: string) {
  if (s === "HIGH") return "bg-terra/10 text-terra border-terra/30";
  if (s === "MEDIUM") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-canvas text-ink-soft border-rule";
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    abnormalBalances: "Saldo Abnormal",
    duplicates: "Duplikat",
    missingReceipts: "Bukti Hilang",
    oddDates: "Tanggal Janggal",
    ratioAnomalies: "Anomali Rasio",
    pending_scan: "Menunggu Pindai",
  };
  return map[t] ?? t;
}

export function TemuanClient({ findings }: { findings: Finding[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Finding | null>(null);
  const [pending, startTransition] = useTransition();

  function action(fn: () => Promise<{ ok: boolean; draftId?: string }>, onSuccess?: (r: { draftId?: string }) => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok && onSuccess) onSuccess(r);
      else if (r.ok) router.refresh();
    });
  }

  if (findings.length === 0) {
    return (
      <Reveal>
        <div className="matte-card flex flex-col items-center justify-center rounded-xl border border-rule bg-paper px-6 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-canvas text-terra">✓</div>
          <p className="mt-3 font-display text-sm font-medium">Tidak ada temuan — pembukuan rapi.</p>
          <p className="mt-1 max-w-sm text-xs text-ink-soft">Doctor akan memindai setiap jurnal baru dan setiap malam. Temuan akan muncul di sini dengan bukti dan usulan koreksi.</p>
        </div>
      </Reveal>
    );
  }

  return (
    <>
      <Stagger className="space-y-2">
        {findings.map((f) => (
          <motion.div key={f.id} variants={staggerItem}>
            <div
              className="matte-card group flex cursor-pointer items-center justify-between rounded-xl border border-rule bg-paper p-4 transition-colors hover:bg-canvas/60"
              onClick={() => setSelected(f)}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2">
                  <span className="font-medium">{typeLabel(f.type)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${severityStyle(f.severity)}`}>{f.severity}</span>
                  <span className="text-xs text-ink-soft">{new Date(f.createdAt).toLocaleDateString("id-ID")}</span>
                </p>
                <p className="mt-1 truncate text-xs text-ink-soft">
                  {f.evidence ? JSON.stringify(f.evidence).slice(0, 120) : "—"}
                </p>
              </div>
              <span className="ml-3 shrink-0 text-xs text-terra group-hover:underline">Lihat bukti →</span>
            </div>
          </motion.div>
        ))}
      </Stagger>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg border-rule bg-paper">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  {typeLabel(selected.type)}
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${severityStyle(selected.severity)}`}>{selected.severity}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-widest text-ink-soft">Bukti</p>
                  <div className="mt-2 space-y-2 rounded-lg bg-canvas p-3 text-sm">
                    {selected.evidence && Object.entries(selected.evidence).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <span className="text-ink-soft">{k}</span>
                        <span className="font-mono text-xs">{String(v)}</span>
                      </div>
                    ))}
                    {selected.evidence && (selected.evidence as { entryId?: string }).entryId && (
                      <Link href={`/jurnal?highlight=${(selected.evidence as { entryId: string }).entryId}`} className="mt-2 inline-block text-xs text-terra underline">
                        Lihat jurnal terkait →
                      </Link>
                    )}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="border-terra/30 bg-terra/10 text-terra">IFRS SME 10.3</Badge>
                      <Badge variant="outline">tenant_chunks excerpt</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-terra hover:bg-terra/90"
                    disabled={pending}
                    onClick={() => action(() => proposeCorrectionAction(selected.id), (r) => {
                      if (r.draftId) window.location.href = `/jurnal/ai/${r.draftId}`;
                    })}
                  >
                    Buat draft koreksi
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => action(() => resolveFindingAction(selected.id))}>
                    Tandai selesai
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => action(() => dismissFindingAction(selected.id))}>
                    Abaikan
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
