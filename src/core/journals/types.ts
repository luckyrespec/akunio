export type PeriodStatus = "OPEN" | "CLOSED" | "LOCKED";
export type JournalSource = "MANUAL" | "AI" | "DOCUMENT" | "IMPORT";

export interface JournalLineInput {
  accountId: string;
  debitMinor: bigint;
  creditMinor: bigint;
  memo?: string;
}

export interface JournalEntryInput {
  dateISO: string;
  memo: string;
  lines: JournalLineInput[];
  source?: JournalSource;
  idempotencyKey?: string;
}
