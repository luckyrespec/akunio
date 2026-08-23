"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { closePeriodAction, reopenPeriodAction } from "@/server/actions/periods.actions";
import { Button } from "@/components/ui/button";

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
      <Button variant="outline" size="sm" disabled={pending}
              onClick={() => start(() => run(() => closePeriodAction(periodId)))}>
        Tutup
      </Button>
    );
  }
  if (status === "CLOSED") {
    return (
      <Button variant="ghost" size="sm" disabled={pending}
              onClick={() => start(() => run(() => reopenPeriodAction(periodId)))}>
        Buka Kembali
      </Button>
    );
  }
  return null; // LOCKED: no UI action in M1
}
