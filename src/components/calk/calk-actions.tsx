"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Sparkles, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CalkActionsProps {
  periodName: string;
}

export function CalkActions({ periodName }: CalkActionsProps) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const handleDownloadDocx = () => {
    setIsDownloading(true);
    try {
      const url = `/api/reports/calk/docx?period=${encodeURIComponent(periodName)}`;
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `CALK_${periodName}.docx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Gagal mengunduh dokumen CALK:", error);
    } finally {
      setTimeout(() => setIsDownloading(false), 1500);
    }
  };

  const handleRefreshAi = () => {
    setIsRefreshing(true);
    const url = new URL(window.location.href);
    url.searchParams.set("refresh", "1");
    router.replace(url.pathname + url.search);
    setTimeout(() => {
      // Hapus refresh parameter agar navigasi/refresh manual berikutnya tetap menggunakan cache
      url.searchParams.delete("refresh");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      setIsRefreshing(false);
    }, 1200);
  };

  return (
    <div className="space-y-2.5">
      <Button
        type="button"
        disabled={isDownloading}
        onClick={handleDownloadDocx}
        className="w-full h-10 px-4 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
      >
        {isDownloading ? (
          <Loader2 className="size-4 animate-spin text-white" />
        ) : (
          <FileText className="size-4 text-white" />
        )}
        <span>Unduh Dokumen (.DOCX)</span>
      </Button>

      <Button
        type="button"
        variant="outline"
        disabled={isRefreshing}
        onClick={handleRefreshAi}
        className="w-full h-9 px-4 text-xs font-semibold rounded-xl border-rule bg-canvas hover:bg-canvas/80 text-ink shadow-2xs transition-all flex items-center justify-center gap-2"
      >
        {isRefreshing ? (
          <Loader2 className="size-3.5 animate-spin text-terra" />
        ) : (
          <Sparkles className="size-3.5 text-terra" />
        )}
        <span>Perbarui Narasi Akunio</span>
      </Button>
    </div>
  );
}
