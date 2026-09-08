"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import {
  friendlyToolLabel,
  thinkingTriggerLabel,
  toolStatusText,
  type TraceStatus,
} from "@/components/ai-elements/tool-labels";
import { cn } from "@/lib/utils";

export interface ThinkingTraceTool {
  toolName: string;
  status?: string;
  result?: unknown;
  error?: string | null;
}

function normalizeStatus(status?: string): TraceStatus {
  if (status === "running" || status === "awaiting-approval" || status === "error") return status;
  return "completed";
}

function StatusIcon({ status }: { status: TraceStatus }) {
  if (status === "running") return <Loader2 className="size-3 animate-spin text-terra" />;
  if (status === "error") return <X className="size-3 text-destructive" />;
  return <Check className="size-3 text-emerald-600" />;
}

export function ThinkingTrace({
  reasoning,
  tools,
  isStreaming = false,
  durationMs,
  defaultOpen,
  renderToolExtra,
}: {
  reasoning?: string | null;
  tools: ThinkingTraceTool[];
  isStreaming?: boolean;
  durationMs?: number;
  defaultOpen?: boolean;
  renderToolExtra?: (toolName: string, result: unknown) => React.ReactNode | null;
}) {
  const open = defaultOpen ?? isStreaming;
  return (
    <Reasoning
      isStreaming={isStreaming}
      defaultOpen={open}
      duration={durationMs !== undefined ? durationMs / 1000 : undefined}
    >
      <ReasoningTrigger>{thinkingTriggerLabel(isStreaming, tools.length)}</ReasoningTrigger>
      <ReasoningContent>
        {reasoning && reasoning.trim().length > 0 && (
          <p className="mb-2 whitespace-pre-wrap">{reasoning}</p>
        )}
        {tools.length > 0 && (
          <ul className="space-y-1.5">
            {tools.map((t, i) => {
              const status = normalizeStatus(t.status);
              return (
                <li key={`${t.toolName}-${i}`} className="flex flex-col gap-1 font-sans">
                  <span className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                    <StatusIcon status={status} />
                    <span className="font-medium text-ink/85">{friendlyToolLabel(t.toolName)}</span>
                    <span className={cn(status === "error" && "text-destructive")}>
                      · {toolStatusText(status)}
                    </span>
                  </span>
                  {t.error ? (
                    <span className="text-[11px] text-destructive">{t.error}</span>
                  ) : t.result !== undefined && t.result !== null && renderToolExtra ? (
                    renderToolExtra(t.toolName, t.result)
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </ReasoningContent>
    </Reasoning>
  );
}
