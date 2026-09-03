import type { ReactNode } from "react";
import { Reveal } from "@/components/motion";

export function PageHeader({
  title,
  eyebrow,
  actions,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <Reveal>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-rule/60 pb-5 mb-6">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">{title}</h1>
          {eyebrow && (
            <p className="text-xs sm:text-sm text-ink-soft">{eyebrow}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2.5">
            {actions}
          </div>
        )}
      </div>
    </Reveal>
  );
}
