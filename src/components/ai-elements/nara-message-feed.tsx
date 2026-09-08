"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, FileText, Image as ImageIcon, FileSpreadsheet, RotateCcw, BookOpen } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { ThinkingTrace } from "@/components/ai-elements/thinking-trace";
import { postingStampFor } from "@/components/ai-elements/journal-stamp";
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
            {/* Thinking trace: chain-of-thought + pemakaian tool dalam satu dropdown */}
            {(m.reasoning || (m.toolInvocations && m.toolInvocations.length > 0)) && (
              <div className="w-full max-w-[88%] md:max-w-[80%] mb-1">
                <ThinkingTrace
                  reasoning={m.reasoning}
                  tools={(m.toolInvocations ?? []).map((ti) => ({
                    toolName: ti.toolName,
                    status: ti.status,
                    result: ti.result,
                    error: typeof ti.error === "string" ? ti.error : null,
                  }))}
                  renderToolExtra={(name, result) => postingStampFor(name, result) ?? null}
                />
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
                    <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-rule/60 pt-2.5 text-[11px] text-ink-soft">
                      <span className="font-semibold text-ink">Sumber Referensi:</span>
                      {m.citations.map((c, i) => {
                        const section = c.section ?? "";
                        const babMatch = /SAK-EMKM-Bab(\d+)/i.exec(section);

                        if (babMatch) {
                          const babNum = babMatch[1];
                          // Ekstrak range paragraf jika ada di excerpt atau content (cth: "Paragraf 2.3-2.4" atau "Paragraf 2.2")
                          const pMatch = /\(Paragraf\s+([^\)]+)\)/i.exec(c.excerpt ?? "");
                          const pText = pMatch ? ` §${pMatch[1]}` : "";
                          const label = `SAK EMKM Bab ${babNum}${pText}`;

                          return (
                            <Link
                              key={i}
                              href={`/aturan?bab=${babNum}`}
                              title={c.excerpt ? `${c.excerpt.slice(0, 140)}...` : `Buka SAK EMKM Bab ${babNum}`}
                              className="inline-flex items-center gap-1 rounded-md bg-canvas hover:bg-paper-raised px-2 py-0.5 font-medium border border-rule/70 text-terra hover:text-terra-hover hover:border-terra/40 transition-colors shadow-2xs cursor-pointer group"
                            >
                              <BookOpen className="size-3 text-terra/70 group-hover:text-terra" />
                              <span>{label}</span>
                            </Link>
                          );
                        }

                        if (c.kind === "ifrs") {
                          return (
                            <Link
                              key={i}
                              href="/aturan"
                              title={c.excerpt ? `${c.excerpt.slice(0, 140)}...` : "Buka Standar SAK EMKM"}
                              className="inline-flex items-center gap-1 rounded-md bg-canvas hover:bg-paper-raised px-2 py-0.5 font-medium border border-rule/70 text-terra hover:text-terra-hover transition-colors shadow-2xs cursor-pointer group"
                            >
                              <BookOpen className="size-3 text-terra/70 group-hover:text-terra" />
                              <span>Standar SAK EMKM</span>
                            </Link>
                          );
                        }

                        const label = c.kind === "JOURNAL" ? `Jurnal #${c.ref.slice(0, 8)}` : `[${c.kind}]`;
                        return (
                          <span
                            key={i}
                            className="rounded bg-canvas px-1.5 py-0.5 font-mono border border-rule/50 text-[10px]"
                            title={c.excerpt}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Badge ingatan lintas sesi */}
                  {typeof m.memoryUsed === "number" && m.memoryUsed > 0 && (
                    <div
                      data-testid="assistant-memory-badge"
                      className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-terra/30 bg-terra/5 px-1.5 py-0.5 text-[10px] font-medium text-terra"
                      title="Akunio menggunakan ingatan tersimpan Anda untuk jawaban ini"
                    >
                      <span>menggunakan {m.memoryUsed} ingatan</span>
                    </div>
                  )}
                </MessageContent>
              </Message>
            )}
          </React.Fragment>
        ))
      )}

      {/* LIVE THINKING TRACE (chain-of-thought + tool berjalan, satu dropdown) */}
      {isStreaming && (streamingReasoning.trim().length > 0 || streamingTools.length > 0) && (
        <div className="w-full max-w-[88%] md:max-w-[80%] mb-1">
          <ThinkingTrace
            reasoning={streamingReasoning}
            tools={streamingTools.map((st) => ({
              toolName: st.toolName,
              status: st.status,
              result: st.result,
              error: st.error ?? null,
            }))}
            isStreaming
            renderToolExtra={(name, result) => postingStampFor(name, result) ?? null}
          />
        </div>
      )}

      {/* LIVE STREAMING BUBBLE */}
      {isStreaming && (
        <Message from="assistant">
          <MessageContent from="assistant">

            {streamingText ? (
              <MessageResponse isAnimating>
                {streamingText}
                <span className="inline-block w-1.5 h-3.5 bg-terra/70 ml-1 animate-pulse align-middle rounded-xs" />
              </MessageResponse>
            ) : (
              <div className="flex items-center gap-2 py-2 px-1 text-xs text-ink-soft select-none">
                <span className="font-medium text-ink/75">Akunio sedang berpikir</span>
                <span className="inline-flex items-center gap-1.5 py-2 px-1" role="status" aria-label="Akunio sedang berpikir">
                  <span className="size-1.5 rounded-full bg-terra animate-pulse" />
                </span>
              </div>
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
