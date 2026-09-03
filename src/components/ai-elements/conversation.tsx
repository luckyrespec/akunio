"use client";

import * as React from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConversationContextValue {
  isAtBottom: boolean;
  scrollToBottom: () => void;
}

const ConversationContext = React.createContext<ConversationContextValue>({
  isAtBottom: true,
  scrollToBottom: () => {},
});

export function useConversation() {
  return React.useContext(ConversationContext);
}

export interface ConversationProps extends React.HTMLAttributes<HTMLDivElement> {
  autoScroll?: boolean;
}

export const Conversation = React.forwardRef<HTMLDivElement, ConversationProps>(
  ({ className, children, autoScroll = true, ...props }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [isAtBottom, setIsAtBottom] = React.useState(true);

    const handleScroll = React.useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      const threshold = 60;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
      setIsAtBottom(atBottom);
    }, []);

    const scrollToBottom = React.useCallback(() => {
      const el = containerRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }, []);

    React.useEffect(() => {
      if (autoScroll && isAtBottom) {
        const el = containerRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }
    });

    React.useImperativeHandle(ref, () => containerRef.current as HTMLDivElement);

    return (
      <ConversationContext.Provider value={{ isAtBottom, scrollToBottom }}>
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className={cn("relative flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth", className)}
          {...props}
        >
          {children}
        </div>
      </ConversationContext.Provider>
    );
  },
);
Conversation.displayName = "Conversation";

export const ConversationContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("mx-auto max-w-4xl space-y-6", className)} {...props} />
));
ConversationContent.displayName = "ConversationContent";

export const ConversationScrollButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, ...props }, ref) => {
  const { isAtBottom, scrollToBottom } = useConversation();

  if (isAtBottom) return null;

  return (
    <Button
      ref={ref}
      variant="secondary"
      size="icon"
      className={cn(
        "absolute bottom-6 right-6 z-20 size-9 rounded-full shadow-md transition-opacity hover:opacity-100",
        className,
      )}
      onClick={scrollToBottom}
      aria-label="Scroll to bottom"
      {...props}
    >
      <ArrowDown className="size-4" />
    </Button>
  );
});
ConversationScrollButton.displayName = "ConversationScrollButton";

export interface ConversationEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description: string;
}

export function ConversationEmptyState({
  icon,
  title,
  description,
  className,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[400px] flex-col items-center justify-center p-8 text-center",
        className,
      )}
      {...props}
    >
      {icon && <div className="mb-4 text-muted-foreground">{icon}</div>}
      <h3 className="font-serif text-2xl font-normal tracking-tight text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-6 w-full max-w-xl">{children}</div>}
    </div>
  );
}
