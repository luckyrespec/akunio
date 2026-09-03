import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  numeric,
  date,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalLines } from "./journal";

export type ReconciliationStatus = "IN_PROGRESS" | "COMPLETED";
export type StatementLineType = "CR" | "DB";
export type MatchStatus = "UNMATCHED" | "MATCHED" | "EXCLUDED";

export const bankReconciliations = pgTable(
  "bank_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    statementDate: date("statement_date").notNull(),
    statementBalanceMinor: numeric("statement_balance_minor", {
      mode: "bigint",
    }).notNull(),
    ledgerBalanceMinor: numeric("ledger_balance_minor", {
      mode: "bigint",
    }).notNull(),
    differenceMinor: numeric("difference_minor", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    status: text("status")
      .$type<ReconciliationStatus>()
      .notNull()
      .default("IN_PROGRESS"),
    fileUrl: text("file_url"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: varchar("completed_by", { length: 255 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("bank_rec_org_idx").on(t.orgId),
    index("bank_rec_account_idx").on(t.orgId, t.bankAccountId),
  ]
);

export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reconciliationId: uuid("reconciliation_id")
      .notNull()
      .references(() => bankReconciliations.id, { onDelete: "cascade" }),
    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    type: text("type").$type<StatementLineType>().notNull(),
    amountMinor: numeric("amount_minor", { mode: "bigint" }).notNull(),
    referenceNumber: varchar("reference_number", { length: 100 }),
    matchStatus: text("match_status")
      .$type<MatchStatus>()
      .notNull()
      .default("UNMATCHED"),
    matchedJournalLineId: uuid("matched_journal_line_id").references(
      () => journalLines.id,
      { onDelete: "set null" }
    ),
    confidenceScore: integer("confidence_score"),
    aiNotes: text("ai_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("stmt_lines_rec_idx").on(t.reconciliationId),
    index("stmt_lines_status_idx").on(t.reconciliationId, t.matchStatus),
  ]
);
