"use client";

import * as React from "react";
import { FileText, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Attachment {
  id: string;
  fileName: string;
  mime: string;
  sizeBytes?: number;
  url?: string;
  storageKey?: string;
}

export interface AttachmentsProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Attachments({ className, children, ...props }: AttachmentsProps) {
  if (React.Children.count(children) === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 pb-2", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export interface AttachmentItemProps extends React.HTMLAttributes<HTMLDivElement> {
  attachment: Attachment;
  onRemove?: () => void;
}

export function AttachmentItem({
  attachment,
  onRemove,
  className,
  ...props
}: AttachmentItemProps) {
  const isPdf = attachment.mime === "application/pdf";
  const sizeFormatted = attachment.sizeBytes
    ? `${(attachment.sizeBytes / 1024).toFixed(0)} KB`
    : "";

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-2.5 py-1.5 text-xs text-foreground shadow-2xs transition-all hover:bg-muted",
        className,
      )}
      {...props}
    >
      <div className="flex size-6 items-center justify-center rounded bg-background text-muted-foreground">
        {isPdf ? <FileText className="size-3.5 text-rose-500" /> : <ImageIcon className="size-3.5 text-blue-500" />}
      </div>
      <div className="flex max-w-[140px] flex-col overflow-hidden">
        <span className="truncate font-medium">{attachment.fileName}</span>
        {sizeFormatted && <span className="text-[10px] text-muted-foreground">{sizeFormatted}</span>}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label="Hapus file"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
