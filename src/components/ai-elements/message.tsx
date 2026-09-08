"use client";

import * as React from "react";
import { Streamdown } from "streamdown";
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
          "relative max-w-[88%] md:max-w-[80%] rounded-2xl px-5 py-3.5 shadow-xs transition-colors",
          from === "user"
            ? "bg-ink text-white shadow-xs dark:bg-terra dark:text-white"
            : "border border-rule bg-paper text-ink",
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

export interface MessageResponseProps extends React.HTMLAttributes<HTMLDivElement> {
  /** True saat teks masih di-stream (animasi progresif aktif). */
  isAnimating?: boolean;
}

export const MessageResponse = React.forwardRef<HTMLDivElement, MessageResponseProps>(
  ({ className, children, isAnimating = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("max-w-none break-words leading-relaxed text-ink text-sm", className)}
        {...props}
      >
        {typeof children === "string" ? (
          <Streamdown mode={isAnimating ? undefined : "static"} isAnimating={isAnimating}>
            {children}
          </Streamdown>
        ) : (
          children
        )}
      </div>
    );
  },
);
MessageResponse.displayName = "MessageResponse";
