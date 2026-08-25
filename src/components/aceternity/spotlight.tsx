import { cn } from "@/lib/utils";

export function Spotlight({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-40 left-0 z-0 h-[560px] w-full opacity-[0.07] dark:opacity-[0.12]",
        className,
      )}
      viewBox="0 0 1200 560"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
    >
      <ellipse cx="600" cy="120" rx="420" ry="220" fill="var(--color-terra)" />
      <ellipse cx="600" cy="120" rx="260" ry="140" fill="var(--color-terra)" opacity="0.6" />
    </svg>
  );
}
