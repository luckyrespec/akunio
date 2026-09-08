"use client";

import * as React from "react";
import { ThreeDots } from "react-loader-spinner";
import { FileText, Image as ImageIcon, FileSpreadsheet } from "lucide-react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { MessageCopyButton } from "@/components/ai-elements/message-copy-button";
import { ThinkingTrace } from "@/components/ai-elements/thinking-trace";
import { CitationSheetProvider } from "@/components/ai-elements/citation-sheet";
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
    <CitationSheetProvider>
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

                  {/* Sitasi kini inline di teks jawaban (chip SAK/jurnal). */}
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

                  {/* Aksi pesan: salin isi */}
                  {m.content && m.content.trim().length > 0 && (
                    <div
                      className={
                        m.role === "user" ? "mt-1 flex justify-end" : "mt-1 flex justify-start"
                      }
                    >
                      <MessageCopyButton text={m.content} />
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
              <span
                className="inline-flex items-center gap-1.5 py-2 px-1 text-terra"
                role="status"
                aria-label="Akunio sedang berpikir"
              >
                <ThreeDots
                  visible
                  height="24"
                  width="44"
                  radius="4"
                  color="currentColor"
                  ariaLabel="Akunio sedang berpikir"
                />
              </span>
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
    </CitationSheetProvider>
  );
}
