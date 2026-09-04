"use client";

import * as React from "react";
import { FileText, Image as ImageIcon, X, FileSpreadsheet, Download, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Attachment {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes?: number;
  url?: string;
  previewUrl?: string;
  storageKey?: string;
  status?: "uploading" | "done" | "error";
}

export interface AttachmentsProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "inline" | "grid";
}

export function Attachments({
  className,
  variant = "inline",
  children,
  ...props
}: AttachmentsProps) {
  if (React.Children.count(children) === 0) return null;

  return (
    <div
      className={cn(
        variant === "grid"
          ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 my-2.5"
          : "flex flex-wrap items-center gap-2 pb-1.5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface AttachmentItemProps extends React.HTMLAttributes<HTMLDivElement> {
  attachment: Attachment;
  variant?: "inline" | "grid";
  onRemove?: () => void;
}

export function AttachmentItem({
  attachment,
  variant = "inline",
  onRemove,
  className,
  ...props
}: AttachmentItemProps) {
  const isImage = attachment.mime.startsWith("image/");
  const isPdf = attachment.mime === "application/pdf";
  const isSheet = attachment.mime.includes("sheet") || attachment.fileName.endsWith(".xlsx") || attachment.fileName.endsWith(".csv");
  const sizeFormatted = attachment.sizeBytes
    ? `${(attachment.sizeBytes / 1024).toFixed(0)} KB`
    : "";

  // 1. GRID VARIANT (Used inside chat messages for rich appeal)
  if (variant === "grid") {
    return (
      <div
        className={cn(
          "group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-rule bg-paper shadow-2xs transition-[border-color,box-shadow] hover:border-terra/60 hover:shadow-xs",
          isImage ? "h-36 sm:h-40" : "h-24 sm:h-28 p-3",
          className,
        )}
        {...props}
      >
        {isImage && (attachment.previewUrl || attachment.url) ? (
          <div className="relative size-full overflow-hidden bg-canvas/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachment.previewUrl || attachment.url}
              alt={attachment.fileName}
              className="size-full object-cover transition-transform duration-300 [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-90" />
            <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
              <p className="truncate text-xs font-semibold leading-tight">{attachment.fileName}</p>
              {sizeFormatted && <p className="text-[10px] text-white/80">{sizeFormatted}</p>}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col justify-between">
            <div className="flex items-start gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas border border-rule">
                {isPdf ? (
                  <FileText className="size-4 text-terra" />
                ) : isSheet ? (
                  <FileSpreadsheet className="size-4 text-emerald-600" />
                ) : (
                  <FileText className="size-4 text-ink-soft" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-ink" title={attachment.fileName}>
                  {attachment.fileName}
                </p>
                <p className="text-[10px] text-ink-soft mt-0.5">{sizeFormatted || (isPdf ? "Dokumen PDF" : "Berkas")}</p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-ink-soft pt-2 border-t border-rule/50">
              <span className="uppercase font-mono tracking-wider font-semibold text-terra">
                {attachment.fileName.split(".").pop() || "FILE"}
              </span>
              <span className="text-[10px] text-emerald-600 font-medium">Terlampir</span>
            </div>
          </div>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-2 top-2 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs transition-transform [@media(hover:hover)_and_(pointer:fine)]:hover:scale-110 active:scale-[0.98]"
            aria-label="Hapus lampiran"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    );
  }

  // 2. INLINE VARIANT (Used inside PromptInputHeader preview before sending)
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-xl border border-rule bg-canvas/80 px-2.5 py-1.5 text-xs text-ink shadow-2xs transition-colors hover:bg-canvas hover:border-terra/40",
        className,
      )}
      {...props}
    >
      <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-paper text-ink-soft border border-rule/50 overflow-hidden">
        {isImage && (attachment.previewUrl || attachment.url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.previewUrl || attachment.url} alt="" className="size-full object-cover" />
        ) : isPdf ? (
          <FileText className="size-3.5 text-terra" />
        ) : isSheet ? (
          <FileSpreadsheet className="size-3.5 text-emerald-600" />
        ) : (
          <ImageIcon className="size-3.5 text-blue-600" />
        )}
      </div>

      <div className="flex max-w-[150px] flex-col overflow-hidden">
        <span className="truncate font-medium text-ink text-[11px] leading-tight">{attachment.fileName}</span>
        {sizeFormatted && <span className="text-[9px] text-ink-soft leading-none mt-0.5">{sizeFormatted}</span>}
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 flex size-4 items-center justify-center rounded-full text-ink-soft hover:bg-paper hover:text-ink transition-colors"
          aria-label="Hapus lampiran"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
