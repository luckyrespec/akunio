"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { closePeriodAction, reopenPeriodAction } from "@/server/actions/periods.actions";

export function PeriodActions({ periodId, status }: { periodId: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    const res = await fn();
    if (!res.ok) console.error(res.error);
    router.refresh();
  }

  if (status === "OPEN") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => run(() => closePeriodAction(periodId)))}
        title="Tutup Periode (Kunci Transaksi Baru)"
        className="flex size-7 items-center justify-center rounded-lg border border-rule/80 text-ink-soft hover:text-amber-600 hover:border-amber-500/40 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
      </button>
    );
  }
  if (status === "CLOSED") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => run(() => reopenPeriodAction(periodId)))}
        title="Buka Kembali Periode"
        className="flex size-7 items-center justify-center rounded-lg border border-rule/80 text-ink-soft hover:text-emerald-600 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Unlock className="size-3.5" />}
      </button>
    );
  }
  return (
    <div className="flex size-7 items-center justify-center text-ink-soft/40" title="Periode Terkunci Permanen">
      <Lock className="size-3.5" />
    </div>
  );
}
