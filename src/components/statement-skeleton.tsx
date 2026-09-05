import { Loader2 } from "lucide-react";

export function StatementSkeleton({
  title = "Menghitung Saldo Buku Besar...",
}: {
  title?: string;
}) {
  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/* 1. Top Back & Header Skeleton */}
      <div className="space-y-4 pb-4 border-b border-rule/60">
        <div className="h-4 w-40 bg-rule/50 rounded-md animate-pulse" />
        <div className="h-9 w-72 bg-rule/60 rounded-xl animate-pulse" />
        <div className="h-4 w-96 max-w-full bg-rule/40 rounded-md animate-pulse" />
      </div>

      {/* 2. Main 2-Column Layout Skeleton */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Kolom Kiri: Lembar Kertas Formal (Paper Sheet) */}
        <div className="w-full lg:flex-1 min-w-0">
          <div className="rounded-2xl sm:rounded-3xl border-2 border-rule/90 bg-paper p-6 sm:p-10 md:p-14 shadow-md space-y-8">
            {/* Kop Dokumen */}
            <div className="border-b-4 border-double border-ink/30 pb-6 text-center space-y-3">
              <div className="h-5 w-48 mx-auto bg-rule/60 rounded-md animate-pulse" />
              <div className="h-8 w-64 mx-auto bg-rule/80 rounded-xl animate-pulse" />
              <div className="h-4 w-56 mx-auto bg-rule/40 rounded-md animate-pulse" />
            </div>

            {/* Sub-header tabel */}
            <div className="flex items-center justify-between border-b-2 border-ink/30 pb-2">
              <div className="h-3.5 w-36 bg-rule/50 rounded-md animate-pulse" />
              <div className="h-3.5 w-24 bg-rule/50 rounded-md animate-pulse" />
            </div>

            {/* Baris-baris data simulasi kalkulasi */}
            <div className="space-y-3.5 pt-1">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-rule/30">
                  <div className="flex items-center gap-3">
                    <div className="h-3.5 w-12 bg-rule/40 rounded-sm animate-pulse" />
                    <div className="h-4 w-44 bg-rule/60 rounded-md animate-pulse" />
                  </div>
                  <div className="h-4 w-28 bg-rule/70 rounded-md animate-pulse" />
                </div>
              ))}

              <div className="pt-4 flex items-center justify-between border-t-2 border-ink/30">
                <div className="h-5 w-48 bg-rule/80 rounded-md animate-pulse" />
                <div className="h-5 w-36 bg-rule/90 rounded-md animate-pulse" />
              </div>
            </div>

            {/* Subtle Loading Badge */}
            <div className="flex items-center justify-center gap-2 pt-6 text-xs text-ink-soft">
              <Loader2 className="size-4 animate-spin text-terra" />
              <span className="font-medium text-ink-soft">{title}</span>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Sidebar Panel Kontrol Skeleton */}
        <div className="w-full lg:w-80 shrink-0 space-y-4">
          <div className="rounded-2xl border-2 border-rule bg-paper p-5 shadow-xs space-y-4">
            <div className="h-4 w-32 bg-rule/60 rounded-md animate-pulse" />
            <div className="h-10 w-full bg-canvas/70 rounded-xl animate-pulse" />
            <div className="h-9 w-full bg-rule/40 rounded-xl animate-pulse" />
            <div className="h-10 w-full bg-terra/20 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
