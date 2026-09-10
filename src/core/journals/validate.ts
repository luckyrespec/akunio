import type { JournalEntryInput, JournalLineInput, PeriodStatus } from "./types";

export type ValidationIssue =
  | { code: "BAD_DATE" }
  | { code: "MIN_LINES" }
  | { code: "NEGATIVE_AMOUNT"; index: number }
  | { code: "LINE_EMPTY"; index: number }
  | { code: "LINE_BOTH_SIDES"; index: number }
  | { code: "UNBALANCED"; debitMinor: bigint; creditMinor: bigint }
  | { code: "PERIOD_NOT_OPEN"; periodStatus: PeriodStatus };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateEntry(
  e: JournalEntryInput,
  periodStatus: PeriodStatus,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isValidDate(e.dateISO)) issues.push({ code: "BAD_DATE" });

  const tooFewLines = e.lines.length < 2;
  if (tooFewLines) issues.push({ code: "MIN_LINES" });

  let debit = 0n, credit = 0n;
  e.lines.forEach((l, i) => {
    if (l.debitMinor < 0n || l.creditMinor < 0n)
      issues.push({ code: "NEGATIVE_AMOUNT", index: i });
    if (l.debitMinor === 0n && l.creditMinor === 0n)
      issues.push({ code: "LINE_EMPTY", index: i });
    else if (l.debitMinor !== 0n && l.creditMinor !== 0n)
      issues.push({ code: "LINE_BOTH_SIDES", index: i });
    debit += l.debitMinor;
    credit += l.creditMinor;
  });

  if (!tooFewLines && debit !== credit)
    issues.push({ code: "UNBALANCED", debitMinor: debit, creditMinor: credit });
  if (periodStatus !== "OPEN")
    issues.push({ code: "PERIOD_NOT_OPEN", periodStatus });
  return issues;
}

export type AccountCheckIssue =
  | { code: "UNKNOWN_ACCOUNT"; index: number; accountCode?: string }
  | { code: "ARCHIVED_ACCOUNT"; index: number; accountCode?: string }
  | { code: "GROUP_ACCOUNT"; index: number; accountCode?: string };

export interface PostingAccountMeta {
  archivedAt: Date | null;
  hasChildren: boolean;
  code?: string;
}

export function checkPostingAccounts(
  lines: JournalLineInput[],
  byId: Map<string, PostingAccountMeta>,
): AccountCheckIssue[] {
  const issues: AccountCheckIssue[] = [];
  lines.forEach((l, i) => {
    const meta = byId.get(l.accountId);
    if (!meta) issues.push({ code: "UNKNOWN_ACCOUNT", index: i });
    else if (meta.archivedAt) issues.push({ code: "ARCHIVED_ACCOUNT", index: i, accountCode: meta.code });
    else if (meta.hasChildren) issues.push({ code: "GROUP_ACCOUNT", index: i, accountCode: meta.code });
  });
  return issues;
}

export function journalNumber(periodName: string, seq: number): string {
  const year = periodName.slice(0, 4);
  return `JE-${year}-${String(seq).padStart(4, "0")}`;
}

export interface PostedRef {
  number: string;
  lines: Array<Pick<JournalLineInput, "accountId" | "debitMinor" | "creditMinor">>;
}

export function makeReversal(posted: PostedRef, dateISO: string, memo?: string): JournalEntryInput {
  return {
    dateISO,
    memo: memo ?? `Balikan ${posted.number}`,
    source: "MANUAL",
    lines: [...posted.lines]
      .reverse()
      .map((l) => ({
        accountId: l.accountId,
        debitMinor: l.creditMinor,
        creditMinor: l.debitMinor,
      })),
  };
}
