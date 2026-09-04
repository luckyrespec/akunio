"use client";

import * as React from "react";
import { Check, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmationProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: "pending" | "approved" | "rejected";
}

export function Confirmation({
  status = "pending",
  className,
  children,
  ...props
}: ConfirmationProps) {
  return (
    <div
      data-status={status}
      className={cn(
        "my-3 rounded-2xl border p-4 shadow-xs transition-colors bg-paper",
        status === "pending" && "border-amber-600/30 bg-amber-500/5",
        status === "approved" && "border-emerald-600/30 bg-emerald-500/5",
        status === "rejected" && "border-rose-600/30 bg-rose-500/5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ConfirmationTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h4
      className={cn("flex items-center gap-2 text-sm font-semibold tracking-tight text-ink font-display", className)}
      {...props}
    >
      <ShieldAlert className="size-4 text-terra" />
      <span>{children}</span>
    </h4>
  );
}

export function ConfirmationRequest({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mt-2 text-xs text-ink/90 space-y-2", className)} {...props}>
      {children}
    </div>
  );
}

export function ConfirmationAccepted({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400",
        className,
      )}
      {...props}
    >
      <Check className="size-4 text-emerald-600" />
      <span>{children ?? "Tindakan disetujui & dieksekusi"}</span>
    </div>
  );
}

export function ConfirmationRejected({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-400",
        className,
      )}
      {...props}
    >
      <X className="size-4 text-rose-600" />
      <span>{children ?? "Tindakan ditolak oleh pengguna"}</span>
    </div>
  );
}

export function ConfirmationActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("mt-4 flex flex-wrap items-center gap-2 border-t border-rule/70 pt-3", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const ConfirmationAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, size = "sm", ...props }, ref) => {
  return <Button ref={ref} size={size} className={cn("text-xs h-8 px-3 rounded-lg shadow-2xs", className)} {...props} />;
});
ConfirmationAction.displayName = "ConfirmationAction";
