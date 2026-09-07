"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { runSubledgerCheckAction } from "@/server/actions/subledger.actions";

export function RunCheckButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        data-testid="subledger-run-check"
        disabled={pending}
        onClick={() => {
          setResult(null);
          start(async () => {
            const res = await runSubledgerCheckAction();
            if (!res.ok) {
              setResult(res.error);
              return;
            }
            setResult(
              res.findings > 0
                ? `${res.findings} selisih dicatat sebagai temuan.`
                : "Semua cocok, tidak ada selisih.",
            );
            router.refresh();
          });
        }}
      >
        {pending ? "Memeriksa…" : "Jalankan Pemeriksaan"}
      </Button>
      {result && <p className="text-xs text-ink-soft">{result}</p>}
    </div>
  );
}
