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
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">{title}</h1>
        <div className="flex items-center gap-3">
          {actions}
          {eyebrow && (
            <p className="hidden text-xs uppercase tracking-widest text-ink-soft sm:block">{eyebrow}</p>
          )}
        </div>
      </div>
    </Reveal>
  );
}
