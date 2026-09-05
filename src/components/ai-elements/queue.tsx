"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, Clock, ChevronDown } from "lucide-react";

export interface QueueProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export function Queue({ className, children, ...props }: QueueProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-ink/15 bg-paper p-3 text-ink",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface QueueSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

export function QueueSection({
  defaultOpen = true,
  className,
  children,
  ...props
}: QueueSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        if (child.type === QueueSectionLabel) {
          return React.cloneElement(child as React.ReactElement<{ isOpen?: boolean; onToggle?: () => void }>, {
            isOpen,
            onToggle: () => setIsOpen((prev) => !prev),
          });
        }
        if (child.type === QueueSectionContent) {
          return isOpen ? child : null;
        }
        return child;
      })}
    </div>
  );
}

export interface QueueSectionLabelProps extends React.HTMLAttributes<HTMLButtonElement> {
  label: string;
  count?: number;
  icon?: React.ReactNode;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function QueueSectionLabel({
  label,
  count,
  icon,
  isOpen = true,
  onToggle,
  className,
  ...props
}: QueueSectionLabelProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between text-xs font-semibold text-ink/80 hover:text-ink",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        {count !== undefined && (
          <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[11px] font-medium text-ink/80">
            {count}
          </span>
        )}
        <span>{label}</span>
      </div>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 text-ink/50 transition-transform duration-200",
          isOpen ? "rotate-0" : "-rotate-90"
        )}
      />
    </button>
  );
}

export function QueueSectionContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 pt-1", className)} {...props}>
      {children}
    </div>
  );
}

export function QueueList({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cn("flex flex-col divide-y divide-ink/10", className)} {...props}>
      {children}
    </ul>
  );
}

export function QueueItem({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-2 text-xs transition-colors hover:bg-ink/[0.02]",
        className
      )}
      {...props}
    >
      {children}
    </li>
  );
}

export interface QueueItemIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  completed?: boolean;
}

export function QueueItemIndicator({
  completed = false,
  className,
  ...props
}: QueueItemIndicatorProps) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px]",
        completed
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
        className
      )}
      {...props}
    >
      {completed ? <Check className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
    </span>
  );
}

export function QueueItemAttachment({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded border border-ink/15", className)} {...props}>
      {children}
    </div>
  );
}

export function QueueItemContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)} {...props}>
      {children}
    </div>
  );
}

export function QueueItemDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-[11px] text-ink/60", className)} {...props}>
      {children}
    </p>
  );
}

export function QueueItemActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-1 shrink-0", className)} {...props}>
      {children}
    </div>
  );
}
