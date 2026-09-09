"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postAmortizationAction } from "@/server/actions/prepaid.actions";

export function PostAmortButton({ contractId, periodName }: { contractId?: string; periodName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        data-testid="dimuka-post"
        size="sm"
        disabled={pending}
        onClick={() => {
          setResult(null);
          start(async () => {
            const res = await postAmortizationAction({ periodName, contractId });
            if (!res.ok) {
              setResult(res.error);
              return;
            }
            setResult(res.postedCount > 0 ? `Terposting ${res.postedCount} baris.` : "Tidak ada baris terjadwal periode ini.");
            router.refresh();
          });
        }}
        className="bg-terra text-white hover:bg-terra/90 text-xs h-9 rounded-xl gap-1.5 shadow-2xs"
      >
        <Play className="size-3.5" />
        <span>{pending ? "Memposting…" : "Posting bulan ini"}</span>
      </Button>
      {result && <p className="text-xs text-ink-soft">{result}</p>}
    </div>
  );
}
