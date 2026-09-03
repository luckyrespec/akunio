"use client";

import * as React from "react";
import { Sparkles, FileText, Image as ImageIcon, FileSpreadsheet, RotateCcw } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";
import {
  Queue,
  QueueSection,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  QueueItemDescription,
} from "@/components/ai-elements/queue";
import type { MessageItem, StreamingToolItem, BatchItemData } from "@/hooks/use-nara-stream-chat";

interface NaraMessageFeedProps {
  messages: MessageItem[];
  isStreaming: boolean;
  streamingText: string;
  streamingReasoning: string;
  streamingTools: StreamingToolItem[];
  streamingQueue: BatchItemData[] | null;
  streamingSuggestions: string[];
  onSelectSuggestion: (text: string) => void;
  emptyState?: React.ReactNode;
}

export function NaraMessageFeed({
  messages,
  isStreaming,
  streamingText,
  streamingReasoning,
  streamingTools,
  streamingQueue,
  streamingSuggestions,
  onSelectSuggestion,
  emptyState,
}: NaraMessageFeedProps) {
  return (
    <>
      {messages.length === 0 && !isStreaming ? (
        emptyState ?? null
      ) : (
        messages.map((m) => (
          <React.Fragment key={m.id}>
            {/* Tool Invocations rendered as standalone full-width widgets */}
            {m.toolInvocations && m.toolInvocations.length > 0 && (
              <div className="w-full max-w-[88%] md:max-w-[80%] space-y-2 mb-1">
                {m.toolInvocations.map((ti, i) => {
                  const toolState =
                    ti.status === "running"
                      ? "running"
                      : ti.status === "error"
                        ? "error"
                        : "completed";
                  return (
                    <Tool key={i} defaultOpen={false} state={toolState}>
                      <ToolHeader
                        title={ti.toolName}
                        type={`tool-${ti.toolName}`}
                        state={toolState}
                      />
                      <ToolContent>
                        {ti.args && typeof ti.args === "object" && Object.keys(ti.args as object).length > 0 ? (
                          <ToolInput input={ti.args} />
                        ) : null}
                        {ti.result ? (
                          <ToolOutput output={ti.result as React.ReactNode} />
                        ) : ti.error ? (
                          <ToolOutput errorText={ti.error} />
                        ) : null}
                      </ToolContent>
                    </Tool>
                  );
                })}
              </div>
            )}

            {/* Standalone Message Bubble */}
            {(m.content || (m.attachments && m.attachments.length > 0) || m.reasoning) && (
              <Message from={m.role}>
                <MessageContent from={m.role}>
                  {m.role === "user" ? (
                    <>
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {m.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="flex items-center gap-1.5 rounded-xl border border-rule/80 bg-paper/90 px-2.5 py-1 text-xs text-ink shadow-2xs"
                            >
                              {att.previewUrl ? (
                                <img
                                  src={att.previewUrl}
                                  alt={att.fileName}
                                  className="size-5 rounded object-cover"
                                />
                              ) : att.mime.startsWith("image/") ? (
                                <ImageIcon className="size-3.5 text-blue-600" />
                              ) : att.mime === "application/pdf" ? (
                                <FileText className="size-3.5 text-terra" />
                              ) : (
                                <FileSpreadsheet className="size-3.5 text-emerald-600" />
                              )}
                              <span className="max-w-[140px] truncate font-medium text-[11px]">
                                {att.fileName}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </>
                  ) : (
                    <>
                      {m.reasoning && (
                        <Reasoning isStreaming={false}>
                          <ReasoningTrigger>Alur Pemikiran</ReasoningTrigger>
                          <ReasoningContent>{m.reasoning}</ReasoningContent>
                        </Reasoning>
                      )}

                      {m.content && <MessageResponse>{m.content}</MessageResponse>}
                    </>
                  )}

                  {/* Batch Queue */}
                  {m.batchQueue && m.batchQueue.length > 0 && (
                    <Queue className="my-2 border border-ink/15">
                      <QueueSection defaultOpen={true}>
                        <QueueSectionLabel
                          label="Antrean Dokumen Terproses"
                          count={m.batchQueue.length}
                        />
                        <QueueSectionContent>
                          <QueueList>
                            {m.batchQueue.map((item) => (
                              <QueueItem key={item.id}>
                                <QueueItemIndicator completed={item.status === "ready"} />
                                <QueueItemContent>
                                  <div className="font-semibold text-xs">{item.vendor}</div>
                                  <QueueItemDescription>
                                    {item.date} • {item.total} ({item.category})
                                  </QueueItemDescription>
                                </QueueItemContent>
                              </QueueItem>
                            ))}
                          </QueueList>
                        </QueueSectionContent>
                      </QueueSection>
                    </Queue>
                  )}

                  {/* Suggestions */}
                  {m.suggestions && m.suggestions.length > 0 && (
                    <Suggestions className="pt-2">
                      {m.suggestions.map((s) => (
                        <Suggestion
                          key={s}
                          suggestion={s}
                          onClick={(val) => onSelectSuggestion(val)}
                        />
                      ))}
                    </Suggestions>
                  )}

                  {/* Citations */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-rule/60 pt-2.5 text-[10px] text-ink-soft">
                      <span className="font-semibold text-ink">Sumber Referensi:</span>
                      {m.citations.map((c, i) => (
                        <span key={i} className="rounded bg-canvas px-1.5 py-0.5 font-mono border border-rule/50">
                          [{c.kind} {c.section ?? c.ref}]
                        </span>
                      ))}
                    </div>
                  )}
                </MessageContent>
              </Message>
            )}
          </React.Fragment>
        ))
      )}

      {/* LIVE STREAMING TOOLS (Standalone outside message bubble) */}
      {isStreaming && streamingTools.length > 0 && (
        <div className="w-full max-w-[88%] md:max-w-[80%] space-y-2 mb-1">
          {streamingTools.map((st, i) => (
            <Tool
              key={i}
              defaultOpen={st.status === "awaiting-approval"}
              state={st.status}
            >
              <ToolHeader
                title={st.toolName}
                type={`tool-${st.toolName}`}
                state={st.status}
              />
              <ToolContent>
                {st.args && typeof st.args === "object" && Object.keys(st.args as object).length > 0 ? (
                  <ToolInput input={st.args} />
                ) : null}
                {st.result ? (
                  <ToolOutput output={st.result as React.ReactNode} />
                ) : st.error ? (
                  <ToolOutput errorText={st.error} />
                ) : null}
              </ToolContent>
            </Tool>
          ))}
        </div>
      )}

      {/* LIVE STREAMING BUBBLE */}
      {isStreaming && (
        <Message from="assistant">
          <MessageContent from="assistant">

            {streamingText ? (
              <MessageResponse>
                {streamingText}
                <span className="inline-block w-1.5 h-3.5 bg-terra/70 ml-1 animate-pulse align-middle rounded-xs" />
              </MessageResponse>
            ) : (
              <div className="flex items-center gap-2 py-2 px-1 text-xs text-ink-soft select-none">
                <span className="font-medium text-ink/75">Nara sedang berpikir</span>
                <span className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-terra animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-1.5 rounded-full bg-terra animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-1.5 rounded-full bg-terra animate-bounce" />
                </span>
              </div>
            )}

            {streamingReasoning && streamingText && (
              <Reasoning isStreaming={false}>
                <ReasoningTrigger>Alur Pemikiran</ReasoningTrigger>
                <ReasoningContent>{streamingReasoning}</ReasoningContent>
              </Reasoning>
            )}

            {streamingQueue && streamingQueue.length > 0 && (
              <Queue className="my-2 border border-ink/15">
                <QueueSection defaultOpen={true}>
                  <QueueSectionLabel label="Antrean Dokumen Terproses" count={streamingQueue.length} />
                  <QueueSectionContent>
                    <QueueList>
                      {streamingQueue.map((item) => (
                        <QueueItem key={item.id}>
                          <QueueItemIndicator completed={item.status === "ready"} />
                          <QueueItemContent>
                            <div className="font-semibold text-xs">{item.vendor}</div>
                            <QueueItemDescription>{item.date} • {item.total}</QueueItemDescription>
                          </QueueItemContent>
                        </QueueItem>
                      ))}
                    </QueueList>
                  </QueueSectionContent>
                </QueueSection>
              </Queue>
            )}

            {streamingSuggestions.length > 0 && (
              <Suggestions className="pt-2">
                {streamingSuggestions.map((s) => (
                  <Suggestion
                    key={s}
                    suggestion={s}
                    onClick={(val) => onSelectSuggestion(val)}
                  />
                ))}
              </Suggestions>
            )}
          </MessageContent>
        </Message>
      )}
    </>
  );
}
