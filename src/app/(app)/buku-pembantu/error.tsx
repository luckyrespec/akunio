"use client";

import { Button } from "@/components/ui/button";

export default function BukuPembantuError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rule bg-paper p-8 text-center shadow-xs">
      <p className="font-display text-base font-medium text-ink">Gagal memuat buku pembantu</p>
      <p className="mt-1 text-xs text-ink-soft">
        Terjadi gangguan saat mengambil data. Coba muat ulang halaman ini.
      </p>
      <Button size="sm" onClick={reset} className="mt-4 bg-terra text-white hover:bg-terra/90 text-xs">
        Muat ulang
      </Button>
    </div>
  );
}
