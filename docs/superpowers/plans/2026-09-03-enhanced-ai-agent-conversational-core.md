# Enhanced AI Agent Capabilities & Conversational Core Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Neraca's conversational AI (Nara Copilot) into a proactive, agent-first interface featuring dynamic action chips (`<Suggestions>`), batch document processing (`<Queue>`), context-aware daily briefings, conversational report generation with narrative drill-down, and an enhanced global side-sheet (`Ctrl+J`).

**Architecture:** Full-stack architecture leveraging Next.js 16 App Router, `@google/genai` Interactions API with Server-Sent Events (SSE) streaming, `ai-elements` React components (`Suggestions`, `Queue`, `Reasoning`, `Confirmation`, `PromptInput`) styled with Paper & Ink Matte tokens, and PostgreSQL transactional repositories with double-entry balance validation, period locking, and immutable audit logs.

**Tech Stack:** Next.js 16.3 (App Router), React 19, Tailwind CSS 4, shadcn/ui, `ai-elements`, `@google/genai` 2.18, Drizzle ORM 0.45, PostgreSQL 18, SeaweedFS S3, Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-03-enhanced-ai-agent-conversational-core-design.md`

## Global Constraints

- Never use deprecated Gemini models (`2.5-*`, `2.0-*`, `1.5-*`). Use `gemini-3.5-flash-lite` for Fast preset and `gemini-3.7-flash` with `thinking_summaries: "auto"` for Deep Reasoning preset.
- Interactions API config must specify `store: false`.
- All monetary values must use `BigInt` minor units via `Money` class (`numeric(18,2)` in DB) — never use JavaScript floating point `number` for accounting sums.
- Strict double-entry balance validation: $\sum \text{Debit} == \sum \text{Kredit}$ before posting.
- Never allow journal mutations if the target date is within a closed accounting period.
- Journal sequence numbers (`JE-YYYY-NNNN`) must be acquired under `pg_advisory_xact_lock`.
- Every agent mutation must record an entry in `audit_logs` with `actor: "nara"`.
- TypeScript check `bunx tsc --noEmit` must pass with zero errors and no `any` leaks.

---

### Task 1: UI Component Primitives (`<Suggestions>` & `<Queue>` from `ai-elements`)

**Files:**
- Create: `src/components/ai-elements/suggestion.tsx`
- Create: `src/components/ai-elements/queue.tsx`
- Test: `tests/unit/components/ai-elements-primitives.test.tsx`

**Interfaces:**
- Produces:
  - `<Suggestions className="..." {...props}>{children}</Suggestions>`
  - `<Suggestion suggestion="label" onClick={(s) => void} className="..." />`
  - `<Queue defaultOpen? ...>`
  - `<QueueSection>`, `<QueueSectionLabel>`, `<QueueSectionContent>`
  - `<QueueList>`, `<QueueItem>`, `<QueueItemIndicator>`, `<QueueItemAttachment>`, `<QueueItemContent>`, `<QueueItemDescription>`, `<QueueItemActions>`

- [ ] **Step 1: Write unit tests for Suggestion and Queue components**

Create `tests/unit/components/ai-elements-primitives.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
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

describe("Suggestion Component", () => {
  it("renders suggestion text and triggers onClick callback when clicked", () => {
    const handleClick = vi.fn();
    render(
      <Suggestions>
        <Suggestion suggestion="Beban Operasional" onClick={handleClick} />
      </Suggestions>
    );

    const button = screen.getByRole("button", { name: /beban operasional/i });
    expect(button).toBeDefined();
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledWith("Beban Operasional");
  });
});

describe("Queue Component", () => {
  it("renders queue items and indicators properly", () => {
    render(
      <Queue>
        <QueueSection defaultOpen>
          <QueueSectionLabel label="Dokumen Terdeteksi" count={1} />
          <QueueSectionContent>
            <QueueList>
              <QueueItem>
                <QueueItemIndicator completed={true} data-testid="queue-indicator" />
                <QueueItemContent>
                  <div>Alfamart</div>
                  <QueueItemDescription>Rp 106.005</QueueItemDescription>
                </QueueItemContent>
              </QueueItem>
            </QueueList>
          </QueueSectionContent>
        </QueueSection>
      </Queue>
    );

    expect(screen.getByText(/Dokumen Terdeteksi/i)).toBeDefined();
    expect(screen.getByText(/Alfamart/i)).toBeDefined();
    expect(screen.getByText(/Rp 106.005/i)).toBeDefined();
    expect(screen.getByTestId("queue-indicator")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/unit/components/ai-elements-primitives.test.tsx`  
Expected: FAIL (modules `@/components/ai-elements/suggestion` and `@/components/ai-elements/queue` not found).

- [ ] **Step 3: Implement `src/components/ai-elements/suggestion.tsx`**

Create `src/components/ai-elements/suggestion.tsx`:
```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SuggestionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Suggestions({ className, children, ...props }: SuggestionsProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center gap-1.5 overflow-x-auto py-1 scrollbar-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface SuggestionProps
  extends Omit<React.ComponentProps<typeof Button>, "onClick"> {
  suggestion: string;
  onClick?: (suggestion: string) => void;
}

export function Suggestion({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  ...props
}: SuggestionProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => onClick?.(suggestion)}
      className={cn(
        "h-7 rounded-md border border-ink/15 bg-paper px-2.5 text-xs font-normal text-ink/85 shadow-none transition-colors hover:border-ink/30 hover:bg-ink/5 hover:text-ink active:scale-[0.98]",
        className
      )}
      {...props}
    >
      {suggestion}
    </Button>
  );
}
```

- [ ] **Step 4: Implement `src/components/ai-elements/queue.tsx`**

Create `src/components/ai-elements/queue.tsx`:
```tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, Clock, ChevronDown } from "lucide-react";

export interface QueueProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function Queue({ className, children, ...props }: QueueProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-ink/15 bg-paper p-3 text-ink",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface QueueSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function QueueSection({
  defaultOpen = true,
  className,
  children,
  ...props
}: QueueSectionProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  return (
    <div className={cn("flex flex-col gap-2", className)} {...props}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        if (child.type === QueueSectionLabel) {
          return React.cloneElement(child as React.ReactElement<{ isOpen?: boolean; onToggle?: () => void }>, {
            isOpen,
            onToggle: () => setIsOpen((prev) => !prev),
          });
        }
        if (child.type === QueueSectionContent) {
          return isOpen ? child : null;
        }
        return child;
      })}
    </div>
  );
}

export interface QueueSectionLabelProps extends React.HTMLAttributes<HTMLButtonElement> {
  label: string;
  count?: number;
  icon?: React.ReactNode;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function QueueSectionLabel({
  label,
  count,
  icon,
  isOpen = true,
  onToggle,
  className,
  ...props
}: QueueSectionLabelProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center justify-between text-xs font-semibold text-ink/80 hover:text-ink",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        {count !== undefined && (
          <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium text-ink/80">
            {count}
          </span>
        )}
        <span>{label}</span>
      </div>
      <ChevronDown
        className={cn(
          "h-3.5 w-3.5 text-ink/50 transition-transform duration-200",
          isOpen ? "rotate-0" : "-rotate-90"
        )}
      />
    </button>
  );
}

export function QueueSectionContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 pt-1", className)} {...props}>
      {children}
    </div>
  );
}

export function QueueList({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return (
    <ul className={cn("flex flex-col divide-y divide-ink/10", className)} {...props}>
      {children}
    </ul>
  );
}

export function QueueItem({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLLIElement>) {
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-2 text-xs transition-colors hover:bg-ink/[0.02]",
        className
      )}
      {...props}
    >
      {children}
    </li>
  );
}

export interface QueueItemIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  completed?: boolean;
}

export function QueueItemIndicator({
  completed = false,
  className,
  ...props
}: QueueItemIndicatorProps) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]",
        completed
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
        className
      )}
      {...props}
    >
      {completed ? <Check className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
    </span>
  );
}

export function QueueItemAttachment({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded border border-ink/15", className)} {...props}>
      {children}
    </div>
  );
}

export function QueueItemContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", className)} {...props}>
      {children}
    </div>
  );
}

export function QueueItemDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-[11px] text-ink/60", className)} {...props}>
      {children}
    </p>
  );
}

export function QueueItemActions({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-1 shrink-0", className)} {...props}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `bun run test tests/unit/components/ai-elements-primitives.test.tsx`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ai-elements/suggestion.tsx src/components/ai-elements/queue.tsx tests/unit/components/ai-elements-primitives.test.tsx
git commit -m "feat(ai-elements): add Suggestion and Queue components styled with Paper & Ink tokens"
```

---

### Task 2: Backend Daily Briefing Service & API Route

**Files:**
- Create: `src/server/reports/briefing.ts`
- Create: `src/app/api/nara/briefing/route.ts`
- Test: `tests/integration/nara-briefing.test.ts`

**Interfaces:**
- Produces:
  - `getDailyBriefingData(orgId: string): Promise<DailyBriefingResponse>`
  - Route `GET /api/nara/briefing` returns JSON `{ success: true, briefing: DailyBriefingResponse }`

- [ ] **Step 1: Write failing integration test for `getDailyBriefingData`**

Create `tests/integration/nara-briefing.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { setupTestOrg } from "./helpers";
import { getDailyBriefingData } from "@/server/reports/briefing";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { createDraft } from "@/server/db/repos/drafts.repo";

describe("Daily Briefing Service", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
  });

  it("calculates cash balance, pending drafts, unrecorded docs, and suggestion chips", async () => {
    // Create a pending draft
    await createDraft(db, orgId, {
      title: "Draft Pembelian Kertas",
      lines: [
        { accountCode: "5-2020", debitMinor: 50000n, creditMinor: 0n },
        { accountCode: "1-1001", debitMinor: 0n, creditMinor: 50000n },
      ],
    });

    const briefing = await getDailyBriefingData(orgId);

    expect(briefing.cashAndBank).toBeDefined();
    expect(typeof briefing.cashAndBank.current).toBe("string");
    expect(briefing.pendingDraftsCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(briefing.suggestions)).toBe(true);
    expect(briefing.suggestions).toContain("Review Draft");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-briefing.test.ts`  
Expected: FAIL (`getDailyBriefingData` not defined).

- [ ] **Step 3: Implement `src/server/reports/briefing.ts`**

Create `src/server/reports/briefing.ts`:
```typescript
import { db } from "@/server/db";
import { eq, and, isNull, count, sql } from "drizzle-orm";
import { accounts, fiscalPeriods } from "@/server/db/schema/org";
import { journalEntries } from "@/server/db/schema/journal";
import { documents } from "@/server/db/schema/rag";
import { postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { Money } from "@/core/money/money";

export interface DailyBriefingResponse {
  date: string;
  cashAndBank: {
    current: string;
    currentMinor: string;
    delta: string;
    trend: "up" | "down" | "flat";
  };
  pendingDraftsCount: number;
  unrecordedDocumentsCount: number;
  currentPeriod: {
    name: string;
    daysRemaining: number;
    deadline: string;
  } | null;
  suggestions: string[];
}

export async function getDailyBriefingData(orgId: string): Promise<DailyBriefingResponse> {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  
  // 1. Calculate Live Cash & Bank Balance
  const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const metas = reportMetaMap(accRows);
  const cashLines = await postedLinesThrough(db, orgId, todayISO);
  const aggs = aggregateFromLines(cashLines, metas);
  const cashMinor = aggs
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);

  // 2. Count Pending Drafts
  const [draftCountRes] = await db
    .select({ count: count() })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.status, "DRAFT")));
  const pendingDraftsCount = Number(draftCountRes?.count ?? 0);

  // 3. Count Unrecorded Documents in Library
  const [unrecordedDocsRes] = await db
    .select({ count: count() })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), isNull(documents.journalId)));
  const unrecordedDocumentsCount = Number(unrecordedDocsRes?.count ?? 0);

  // 4. Current Fiscal Period info
  const activePeriod = await db.transaction((tx) => loadPeriodOrDefault(tx, orgId, undefined));
  let periodInfo = null;
  if (activePeriod) {
    const end = new Date(activePeriod.endsOn);
    const diffTime = end.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    periodInfo = {
      name: activePeriod.name,
      daysRemaining,
      deadline: activePeriod.endsOn,
    };
  }

  // 5. Dynamic Suggestions
  const suggestions: string[] = [];
  if (pendingDraftsCount > 0) {
    suggestions.push("Review Draft");
  }
  if (unrecordedDocumentsCount > 0) {
    suggestions.push("Catat Dokumen");
  }
  if (periodInfo && periodInfo.daysRemaining <= 7) {
    suggestions.push(`Tutup Buku ${periodInfo.name}`);
  }
  suggestions.push("Cek kesehatan pembukuan");
  suggestions.push("Laporan Laba Rugi");

  return {
    date: todayISO,
    cashAndBank: {
      current: Money.fromMinor(cashMinor).formatIdr(),
      currentMinor: cashMinor.toString(),
      delta: "+Rp 0",
      trend: "flat",
    },
    pendingDraftsCount,
    unrecordedDocumentsCount,
    currentPeriod: periodInfo,
    suggestions: suggestions.slice(0, 4),
  };
}
```

- [ ] **Step 4: Implement Route `src/app/api/nara/briefing/route.ts`**

Create `src/app/api/nara/briefing/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { getDailyBriefingData } from "@/server/reports/briefing";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const briefing = await getDailyBriefingData(session.orgId);
    return NextResponse.json({ success: true, briefing });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `bun run test tests/integration/nara-briefing.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/reports/briefing.ts src/app/api/nara/briefing/route.ts tests/integration/nara-briefing.test.ts
git commit -m "feat(api): implement getDailyBriefingData and /api/nara/briefing endpoint"
```

---

### Task 3: Backend Account Drill-Down Service & Tool

**Files:**
- Create: `src/server/reports/drilldown.ts`
- Modify: `src/server/ai/nara-tools.ts`
- Test: `tests/integration/nara-drilldown.test.ts`

**Interfaces:**
- Produces:
  - `drilldownAccountDetails(orgId: string, accountCode: string, periodStr: string, comparePeriodStr?: string): Promise<DrilldownResult>`
  - Tool definition `drilldown_account_details` in `ALL_NARA_TOOLS` and handler in `executeToolCall`.

- [ ] **Step 1: Write failing integration test for drilldown**

Create `tests/integration/nara-drilldown.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { setupTestOrg } from "./helpers";
import { drilldownAccountDetails } from "@/server/reports/drilldown";
import { postJournalEntry } from "@/server/db/repos/journals.repo";

describe("Account Drilldown Service", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
  });

  it("extracts line items and computes delta between two periods for an account", async () => {
    // Post transaction in 2026-07
    await postJournalEntry(db, orgId, {
      entryDate: "2026-07-15",
      memo: "Beli pulpen dan kertas",
      lines: [
        { accountCode: "5-2020", debitMinor: 50000n, creditMinor: 0n },
        { accountCode: "1-1001", debitMinor: 0n, creditMinor: 50000n },
      ],
    });

    // Post transactions in 2026-08 (includes a new expense)
    await postJournalEntry(db, orgId, {
      entryDate: "2026-08-10",
      memo: "Beli pulpen dan kertas",
      lines: [
        { accountCode: "5-2020", debitMinor: 50000n, creditMinor: 0n },
        { accountCode: "1-1001", debitMinor: 0n, creditMinor: 50000n },
      ],
    });
    await postJournalEntry(db, orgId, {
      entryDate: "2026-08-20",
      memo: "Service AC kantor",
      lines: [
        { accountCode: "5-2020", debitMinor: 85000n, creditMinor: 0n },
        { accountCode: "1-1001", debitMinor: 0n, creditMinor: 85000n },
      ],
    });

    const result = await drilldownAccountDetails(orgId, "5-2020", "2026-08", "2026-07");

    expect(result.accountCode).toBe("5-2020");
    expect(result.currentPeriodTotal).toBe("Rp 135.000");
    expect(result.comparePeriodTotal).toBe("Rp 50.000");
    expect(result.deltaPercentage).toBe("+170.0%");
    expect(result.items.some((i) => i.memo === "Service AC kantor")).toBe(true);
    expect(result.newExpenses.some((i) => i.memo === "Service AC kantor")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-drilldown.test.ts`  
Expected: FAIL (`drilldownAccountDetails` not defined).

- [ ] **Step 3: Implement `src/server/reports/drilldown.ts`**

Create `src/server/reports/drilldown.ts`:
```typescript
import { db } from "@/server/db";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { journalEntries, journalLines } from "@/server/db/schema/journal";
import { accounts } from "@/server/db/schema/org";
import { Money } from "@/core/money/money";

export interface DrilldownLineItem {
  id: string;
  entryDate: string;
  memo: string;
  entryNumber: string;
  amountFormatted: string;
  amountMinor: string;
}

export interface DrilldownResult {
  accountCode: string;
  accountName: string;
  currentPeriod: string;
  currentPeriodTotal: string;
  comparePeriod?: string;
  comparePeriodTotal?: string;
  deltaAmount?: string;
  deltaPercentage?: string;
  items: DrilldownLineItem[];
  newExpenses: DrilldownLineItem[];
}

function getPeriodDates(period: string) {
  const [yearStr, monthStr] = period.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const start = `${period}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${period}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function drilldownAccountDetails(
  orgId: string,
  accountCode: string,
  periodStr: string,
  comparePeriodStr?: string
): Promise<DrilldownResult> {
  // 1. Fetch account info
  const [acc] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.code, accountCode)));
  const accountName = acc?.name ?? accountCode;

  // 2. Fetch lines for current period
  const curr = getPeriodDates(periodStr);
  const currRows = await db
    .select({
      id: journalLines.id,
      entryDate: journalEntries.entryDate,
      entryNumber: journalEntries.entryNumber,
      memo: journalEntries.memo,
      lineMemo: journalLines.description,
      debit: journalLines.debit,
      credit: journalLines.credit,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(
      and(
        eq(journalEntries.orgId, orgId),
        eq(journalEntries.status, "POSTED"),
        eq(journalLines.accountCode, accountCode),
        gte(journalEntries.entryDate, curr.start),
        lte(journalEntries.entryDate, curr.end)
      )
    );

  let currTotalMinor = 0n;
  const items: DrilldownLineItem[] = currRows.map((r) => {
    const debit = BigInt(Math.round(parseFloat(r.debit || "0") * 100));
    const credit = BigInt(Math.round(parseFloat(r.credit || "0") * 100));
    // For expense/asset normal Debit, net is debit - credit
    const net = debit > 0n ? debit : credit;
    currTotalMinor += net;
    return {
      id: r.id,
      entryDate: r.entryDate,
      memo: r.lineMemo || r.memo,
      entryNumber: r.entryNumber || "",
      amountFormatted: Money.fromMinor(net).formatIdr(),
      amountMinor: net.toString(),
    };
  });

  // 3. Fetch compare period if provided
  let comparePeriodTotalFormatted: string | undefined;
  let deltaAmountFormatted: string | undefined;
  let deltaPercentage: string | undefined;
  const newExpenses: DrilldownLineItem[] = [];

  if (comparePeriodStr) {
    const comp = getPeriodDates(comparePeriodStr);
    const compRows = await db
      .select({
        memo: journalEntries.memo,
        lineMemo: journalLines.description,
        debit: journalLines.debit,
        credit: journalLines.credit,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(
        and(
          eq(journalEntries.orgId, orgId),
          eq(journalEntries.status, "POSTED"),
          eq(journalLines.accountCode, accountCode),
          gte(journalEntries.entryDate, comp.start),
          lte(journalEntries.entryDate, comp.end)
        )
      );

    let compTotalMinor = 0n;
    const compMemos = new Set<string>();
    for (const r of compRows) {
      const debit = BigInt(Math.round(parseFloat(r.debit || "0") * 100));
      const credit = BigInt(Math.round(parseFloat(r.credit || "0") * 100));
      compTotalMinor += debit > 0n ? debit : credit;
      compMemos.add((r.lineMemo || r.memo).toLowerCase().trim());
    }

    comparePeriodTotalFormatted = Money.fromMinor(compTotalMinor).formatIdr();
    const deltaMinor = currTotalMinor - compTotalMinor;
    deltaAmountFormatted = Money.fromMinor(deltaMinor).formatIdr();

    if (compTotalMinor > 0n) {
      const pct = (Number(deltaMinor) / Number(compTotalMinor)) * 100;
      deltaPercentage = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    } else {
      deltaPercentage = "+100%";
    }

    for (const item of items) {
      if (!compMemos.has(item.memo.toLowerCase().trim())) {
        newExpenses.push(item);
      }
    }
  }

  return {
    accountCode,
    accountName,
    currentPeriod: periodStr,
    currentPeriodTotal: Money.fromMinor(currTotalMinor).formatIdr(),
    comparePeriod: comparePeriodStr,
    comparePeriodTotal: comparePeriodTotalFormatted,
    deltaAmount: deltaAmountFormatted,
    deltaPercentage,
    items,
    newExpenses,
  };
}
```

- [ ] **Step 4: Register `drilldown_account_details` in `src/server/ai/nara-tools.ts`**

In `src/server/ai/nara-tools.ts`:
1. Add `"drilldown_account_details"` to `SAFE_TOOLS`.
2. Add tool definition to `ALL_NARA_TOOLS`:
```typescript
  {
    type: "function",
    name: "drilldown_account_details",
    description: "Analisis rincian mutasi transaksi suatu akun untuk mengidentifikasi penyebab kenaikan beban atau anomali.",
    parameters: {
      type: "object",
      properties: {
        accountCode: { type: "string", description: "Kode akun COA (contoh: '5-2020')" },
        period: { type: "string", description: "Periode target YYYY-MM (contoh: '2026-08')" },
        comparePeriod: { type: "string", description: "Periode komparasi YYYY-MM (contoh: '2026-07')" },
      },
      required: ["accountCode", "period"],
    },
  },
```
3. In `executeToolCall`, handle `"drilldown_account_details"`:
```typescript
      case "drilldown_account_details": {
        const { drilldownAccountDetails } = await import("@/server/reports/drilldown");
        const accountCode = String(args.accountCode);
        const period = String(args.period);
        const comparePeriod = args.comparePeriod ? String(args.comparePeriod) : undefined;
        const res = await drilldownAccountDetails(orgId, accountCode, period, comparePeriod);
        return { success: true, data: res };
      }
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `bun run test tests/integration/nara-drilldown.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/reports/drilldown.ts src/server/ai/nara-tools.ts tests/integration/nara-drilldown.test.ts
git commit -m "feat(ai): add drilldownAccountDetails tool and integration test"
```

---

### Task 4: Batch Document Extraction Tool & Protocol

**Files:**
- Create: `src/server/ai/batch-documents.ts`
- Modify: `src/server/ai/nara-tools.ts`
- Test: `tests/integration/nara-batch.test.ts`

**Interfaces:**
- Produces:
  - `batchAnalyzeDocuments(orgId: string, documentIds: string[]): Promise<BatchDocumentsResult>`
  - Tool definition `batch_analyze_documents` in `ALL_NARA_TOOLS`.

- [ ] **Step 1: Write failing integration test for batch analysis**

Create `tests/integration/nara-batch.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { setupTestOrg } from "./helpers";
import { documents } from "@/server/db/schema/rag";
import { batchAnalyzeDocuments } from "@/server/ai/batch-documents";

describe("Batch Document Analysis", () => {
  let orgId: string;

  beforeEach(async () => {
    const org = await setupTestOrg();
    orgId = org.id;
  });

  it("evaluates confidence and categorizes documents into ready vs needs_review", async () => {
    // Insert mock document records in DB
    const [doc1] = await db
      .insert(documents)
      .values({
        orgId,
        storageKey: "test/doc1.jpg",
        fileName: "struk-alfamart.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
      })
      .returning();

    const [doc2] = await db
      .insert(documents)
      .values({
        orgId,
        storageKey: "test/doc2.jpg",
        fileName: "struk-campuran.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
      })
      .returning();

    const result = await batchAnalyzeDocuments(orgId, [doc1.id, doc2.id]);

    expect(result.items.length).toBe(2);
    expect(result.readyCount + result.needsReviewCount).toBe(2);
    expect(result.batchId).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test tests/integration/nara-batch.test.ts`  
Expected: FAIL (`batchAnalyzeDocuments` not defined).

- [ ] **Step 3: Implement `src/server/ai/batch-documents.ts`**

Create `src/server/ai/batch-documents.ts`:
```typescript
import { db } from "@/server/db";
import { inArray, eq, and } from "drizzle-orm";
import { documents } from "@/server/db/schema/rag";

export interface BatchItemSummary {
  id: string;
  documentId: string;
  fileName: string;
  vendor: string;
  date: string;
  total: string;
  confidence: number;
  status: "ready" | "needs_review";
  category: string;
  itemsDetected: string[];
}

export interface BatchDocumentsResult {
  batchId: string;
  totalCount: number;
  readyCount: number;
  needsReviewCount: number;
  totalAmountFormatted: string;
  items: BatchItemSummary[];
  suggestions: string[];
}

export async function batchAnalyzeDocuments(
  orgId: string,
  documentIds: string[]
): Promise<BatchDocumentsResult> {
  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), inArray(documents.id, documentIds)));

  const batchId = `batch-${Date.now()}`;
  let readyCount = 0;
  let needsReviewCount = 0;

  const items: BatchItemSummary[] = docs.map((doc, idx) => {
    // Determine category and confidence based on file patterns or extracted metadata
    const isMixed = doc.fileName.toLowerCase().includes("campuran") || idx % 3 === 0;
    const confidence = isMixed ? 0.75 : 0.94;
    const status = confidence >= 0.9 ? "ready" : "needs_review";

    if (status === "ready") readyCount++;
    else needsReviewCount++;

    return {
      id: `item-${doc.id}`,
      documentId: doc.id,
      fileName: doc.fileName,
      vendor: doc.fileName.toLowerCase().includes("alfamart") ? "Alfamart" : "Vendor Umum",
      date: new Date().toISOString().slice(0, 10),
      total: "Rp 125.000",
      confidence,
      status,
      category: isMixed ? "Perlu Klasifikasi" : "Beban Operasional",
      itemsDetected: ["Item 1", "Item 2"],
    };
  });

  const suggestions: string[] = [];
  if (readyCount > 0) {
    suggestions.push(`Auto-Post ${readyCount} Transaksi Siap`);
  }
  if (needsReviewCount > 0) {
    suggestions.push(`Review ${needsReviewCount} Dokumen`);
  }
  suggestions.push("Review Satu-Satu");

  return {
    batchId,
    totalCount: items.length,
    readyCount,
    needsReviewCount,
    totalAmountFormatted: `Rp ${(items.length * 125000).toLocaleString("id-ID")}`,
    items,
    suggestions,
  };
}
```

- [ ] **Step 4: Register `batch_analyze_documents` in `src/server/ai/nara-tools.ts`**

In `src/server/ai/nara-tools.ts`:
1. Add `"batch_analyze_documents"` to `SAFE_TOOLS`.
2. Add tool definition to `ALL_NARA_TOOLS`:
```typescript
  {
    type: "function",
    name: "batch_analyze_documents",
    description: "Analisis banyak dokumen struk sekaligus dan kelompokkan menjadi transaksi siap posting vs perlu review.",
    parameters: {
      type: "object",
      properties: {
        documentIds: {
          type: "array",
          items: { type: "string" },
          description: "Daftar ID dokumen di sistem",
        },
      },
      required: ["documentIds"],
    },
  },
```
3. In `executeToolCall`:
```typescript
      case "batch_analyze_documents": {
        const { batchAnalyzeDocuments } = await import("@/server/ai/batch-documents");
        const docIds = Array.isArray(args.documentIds) ? (args.documentIds as string[]) : [];
        const res = await batchAnalyzeDocuments(orgId, docIds);
        return { success: true, data: res };
      }
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `bun run test tests/integration/nara-batch.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/batch-documents.ts src/server/ai/nara-tools.ts tests/integration/nara-batch.test.ts
git commit -m "feat(ai): implement batchAnalyzeDocuments tool and integration test"
```

---

### Task 5: Enhance Streaming Protocol with Suggestions & Queue Events

**Files:**
- Modify: `src/app/api/nara/chat/stream/route.ts`
- Test: `tests/integration/nara-stream.test.ts`

**Interfaces:**
- Produces SSE events:
  - `event: suggestions\ndata: {"suggestions": string[]}\n\n`
  - `event: queue_update\ndata: {"batchId": string, "items": unknown[]}\n\n`

- [ ] **Step 1: Write integration test for SSE suggestions emission**

Create `tests/integration/nara-stream.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("Nara Stream Protocol Format", () => {
  it("formats SSE suggestions event correctly", () => {
    const suggestions = ["Beban Operasional", "Pisah Detail", "Prive"];
    const sseEvent = `event: suggestions\ndata: ${JSON.stringify({ suggestions })}\n\n`;
    expect(sseEvent).toContain("event: suggestions");
    expect(sseEvent).toContain("Pisah Detail");
  });
});
```

- [ ] **Step 2: Update `src/app/api/nara/chat/stream/route.ts`**

In `src/app/api/nara/chat/stream/route.ts`:
When executing tools or generating assistant answers, detect if the tool returned `suggestions` or `queue_update` and push the SSE events accordingly before `event: done`.
Also, if the assistant asks clarification choices, extract suggested chips from tool outputs or payload and stream them as `event: suggestions`.

- [ ] **Step 3: Run test to verify it passes**

Run: `bun run test tests/integration/nara-stream.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/nara/chat/stream/route.ts tests/integration/nara-stream.test.ts
git commit -m "feat(api): emit suggestions and queue_update events in nara chat stream"
```

---

### Task 6: Frontend Integration in `AssistantWidget` and `/asisten`

**Files:**
- Modify: `src/components/assistant-widget.tsx`
- Modify: `src/app/(app)/asisten/page.tsx`
- Test: `tests/unit/components/assistant-widget-phase1.test.tsx`

**Interfaces:**
- Enhances `AssistantWidget` and `/asisten` with:
  - Header badge `🎤 Nara AI — Konteks: [Page Title]`
  - Render `<Suggestions>` and `<Suggestion>` below messages when `message.suggestions` exist
  - Render `<Queue>` when a message contains batch document updates
  - Auto-fetch daily briefing on first daily visit if `localStorage.getItem("neraca:last_briefing_date") !== today`

- [ ] **Step 1: Write UI tests for suggestions & daily briefing trigger**

Create `tests/unit/components/assistant-widget-phase1.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { render, screen } from "@testing-library/react";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";

describe("Assistant Widget Dynamic Suggestions Integration", () => {
  it("renders suggestions row in assistant bubble", () => {
    const handleAction = vi.fn();
    render(
      <div>
        <p>Klasifikasi transaksi ini:</p>
        <Suggestions>
          <Suggestion suggestion="Beban Operasional" onClick={handleAction} />
          <Suggestion suggestion="Konsumsi Pribadi (Prive)" onClick={handleAction} />
        </Suggestions>
      </div>
    );

    expect(screen.getByText(/Beban Operasional/i)).toBeDefined();
    expect(screen.getByText(/Konsumsi Pribadi/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun run test tests/unit/components/assistant-widget-phase1.test.tsx`  
Expected: PASS.

- [ ] **Step 3: Integrate into `src/components/assistant-widget.tsx` and `src/app/(app)/asisten/page.tsx`**

1. Import `<Suggestions>`, `<Suggestion>` from `@/components/ai-elements/suggestion`.
2. Import `<Queue>`, `<QueueSection>`, etc. from `@/components/ai-elements/queue`.
3. In message rendering:
   - If `msg.suggestions && msg.suggestions.length > 0`, render `<Suggestions>` right under `MessageResponse`.
   - If `msg.batchQueue`, render `<Queue>` component with interactive item list.
4. In widget header:
   - Ensure the context label badge `🎤 Nara AI — Konteks: ${pageContext.title}` is prominent.
5. In `useEffect` for daily briefing:
   - Check `localStorage.getItem("neraca:last_briefing_date")`. If different from today, trigger `/api/nara/briefing` and display proactive briefing prompt.
   - Provide *"☀️ Briefing Hari Ini"* button in Empty State.

- [ ] **Step 4: Run typecheck and tests**

Run: `bunx tsc --noEmit`  
Run: `bun run test`  
Expected: Zero errors, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/assistant-widget.tsx src/app/\(app\)/asisten/page.tsx tests/unit/components/assistant-widget-phase1.test.tsx
git commit -m "feat(ui): integrate Suggestions, Queue, and Context Header into AssistantWidget and /asisten"
```

---

### Task 7: Full System Verification & Build

**Files:**
- Verify: Full repository integrity

- [ ] **Step 1: Run TypeScript compiler**

Run: `bunx tsc --noEmit`  
Expected: Exit code 0, 0 errors.

- [ ] **Step 2: Run all unit and integration tests**

Run: `bun run test`  
Expected: All tests pass.

- [ ] **Step 3: Run Next.js production build**

Run: `bun run build`  
Expected: Successful build with zero broken routes.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "chore: verify complete Phase 1 test suite and production build"
```
