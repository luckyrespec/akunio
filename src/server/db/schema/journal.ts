import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, integer, numeric, date,
  timestamp, uniqueIndex, primaryKey, index, check,
} from "drizzle-orm/pg-core";
import { organizations, accounts, fiscalPeriods } from "./org";

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    periodId: uuid("period_id")
      .notNull()
      .references(() => fiscalPeriods.id),
    seq: integer("seq").notNull(),
    number: text("number").notNull(),
    entryDate: date("entry_date").notNull(),
    memo: text("memo").notNull(),
    source: text("source", { enum: ["MANUAL", "AI", "DOCUMENT", "IMPORT"] })
      .notNull()
      .default("MANUAL"),
    status: text("status", { enum: ["DRAFT", "POSTED"] }).notNull().default("DRAFT"),
    reversalOfId: uuid("reversal_of_id"),
    idempotencyKey: text("idempotency_key"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("je_org_number_uq").on(t.orgId, t.number),
    uniqueIndex("je_org_idem_uq").on(t.orgId, t.idempotencyKey),
    index("je_org_date_idx").on(t.orgId, t.entryDate),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id), // denormalized for RLS
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    position: integer("position").notNull().default(0),
    debit: numeric("debit", { precision: 18, scale: 2 }).notNull().default("0"),
    credit: numeric("credit", { precision: 18, scale: 2 }).notNull().default("0"),
    memo: text("memo"),
  },
  (t) => [
    check("jl_one_side_chk", sql`((debit >= 0) AND (credit >= 0) AND (((debit = 0)::int + (credit = 0)::int) = 1))`),
  ],
);

export const journalSeqCounters = pgTable(
  "journal_seq_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    periodId: uuid("period_id")
      .notNull()
      .references(() => fiscalPeriods.id),
    last: integer("last").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.periodId] })],
);
