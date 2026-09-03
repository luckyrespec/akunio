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
        "my-3 rounded-xl border p-4 shadow-xs transition-all",
        status === "pending" && "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/20",
        status === "approved" && "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20",
        status === "rejected" && "border-rose-500/30 bg-rose-500/5 dark:bg-rose-950/20",
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
      className={cn("flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground", className)}
      {...props}
    >
      <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
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
    <div className={cn("mt-2 text-xs text-foreground/90 space-y-2", className)} {...props}>
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
        "flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300",
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
        "flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-300",
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
      className={cn("mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3", className)}
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
  return <Button ref={ref} size={size} className={cn("text-xs h-8 px-3", className)} {...props} />;
});
ConfirmationAction.displayName = "ConfirmationAction";
