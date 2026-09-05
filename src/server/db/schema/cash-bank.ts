import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  numeric,
  integer,
} from "drizzle-orm/pg-core";
import { organizations, accounts } from "./org";
import { contacts } from "./invoicing";
import { journalEntries } from "./journal";

export type CashKind = "BAYAR" | "TERIMA" | "TRANSFER";
export type CashStatus = "DRAFT" | "POSTED";

export const kasBankEntries = pgTable(
  "kas_bank_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    kind: text("kind").$type<CashKind>().notNull(),
    entryDate: date("entry_date").notNull(),
    cashAccountId: uuid("cash_account_id")
      .notNull()
      .references(() => accounts.id),
    counterAccountId: uuid("counter_account_id")
      .notNull()
      .references(() => accounts.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    amountMinor: numeric("amount_minor", { mode: "bigint" }).notNull(),
    memo: text("memo").notNull().default(""),
    number: text("number").notNull(),
    journalEntryId: uuid("journal_entry_id").references(
      () => journalEntries.id
    ),
    status: text("status").$type<CashStatus>().notNull().default("DRAFT"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("kas_bank_org_number_uq").on(t.orgId, t.number),
    index("kas_bank_org_date_idx").on(t.orgId, t.entryDate),
    index("kas_bank_org_kind_idx").on(t.orgId, t.kind),
  ]
);

export const kasBankSeqCounters = pgTable(
  "kas_bank_seq_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    year: text("year").notNull(),
    kind: text("kind").$type<CashKind>().notNull(),
    last: integer("last").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.year, t.kind] })]
);
