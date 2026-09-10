"use client";

import * as React from "react";
import { Download, UploadCloud } from "lucide-react";

export interface CsvImportOutcome {
  ok: boolean;
  count?: number;
  skipped?: Array<{ index: number; reason: string }>;
  errors?: Array<{ index: number; message: string }>;
  error?: string;
}

export function CsvImportCard({
  title,
  desc,
  templateCsv,
  templateName,
  testId,
  onImport,
}: {
  title: string;
  desc: string;
  templateCsv: string;
  templateName: string;
  testId: string;
  onImport: (text: string) => Promise<CsvImportOutcome>;
}) {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<CsvImportOutcome | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const text = await file.text();
      setResult(await onImport(text));
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Gagal membaca file." });
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div data-testid={testId} className="rounded-xl border border-rule bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-[11px] text-ink-soft">{desc}</p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rule px-3 text-xs font-medium text-ink hover:bg-canvas"
        >
          <Download className="size-3.5" /> Unduh Template
        </button>
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rule bg-canvas/30 px-3 py-3 text-xs text-ink-soft transition-colors hover:bg-canvas hover:text-ink">
        <UploadCloud className="size-4 text-terra" />
        <span className="text-[11px]">{loading ? "Mengimpor..." : "Klik untuk pilih file .csv"}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={loading}
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
      </label>
      {result && (
        <div className="mt-2 text-xs" role="status">
          {!result.ok && <p className="font-medium text-red-600">{result.error ?? "Impor gagal."}</p>}
          {result.ok && (
            <p className="font-medium text-emerald-700">
              {result.count ?? 0} baris terimpor
              {(result.skipped?.length ?? 0) > 0 && `, ${result.skipped!.length} dilewati`}
              {(result.errors?.length ?? 0) > 0 && `, ${result.errors!.length} gagal`}
            </p>
          )}
          {(result.errors ?? []).slice(0, 10).map((e, i) => (
            <p key={i} className="text-ink-soft">
              Baris {e.index + 2}: {e.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
