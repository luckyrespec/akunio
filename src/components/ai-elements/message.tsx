"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  from: "user" | "assistant";
}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ from, className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-from={from}
        className={cn(
          "group flex w-full gap-4 text-sm",
          from === "user" ? "justify-end" : "justify-start",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Message.displayName = "Message";

export interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {
  from?: "user" | "assistant";
}

export const MessageContent = React.forwardRef<HTMLDivElement, MessageContentProps>(
  ({ className, children, from, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative max-w-[85%] rounded-2xl px-4 py-3 shadow-xs md:max-w-[75%]",
          from === "user"
            ? "bg-primary text-primary-foreground"
            : "border border-border/70 bg-card text-card-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
MessageContent.displayName = "MessageContent";

export const MessageResponse = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words leading-relaxed",
        "prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
});
MessageResponse.displayName = "MessageResponse";
