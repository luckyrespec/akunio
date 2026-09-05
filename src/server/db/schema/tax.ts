import {
  pgTable, uuid, varchar, integer, numeric, text, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { organizations } from "./org";
import { journalEntries } from "./journal";
import { aiDrafts } from "./ai";

export const taxSummaries = pgTable(
  "tax_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodMonth: varchar("period_month", { length: 7 }).notNull(), // '2026-01'
    taxYear: integer("tax_year").notNull(),
    grossRevenueMinor: numeric("gross_revenue_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(0n),
    cumulativeYearRevenueMinor: numeric("cumulative_year_revenue_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(0n),
    taxableRevenueMinor: numeric("taxable_revenue_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(0n),
    taxDueMinor: numeric("tax_due_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(0n),
    accrualDraftId: uuid("accrual_draft_id").references(() => aiDrafts.id, { onDelete: "set null" }),
    accrualJournalEntryId: uuid("accrual_journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
    paymentJournalEntryId: uuid("payment_journal_entry_id").references(() => journalEntries.id, { onDelete: "set null" }),
    ntpn: varchar("ntpn", { length: 30 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    status: text("status", { enum: ["UNPROCESSED", "DRAFTED", "ACCRUED", "PAID"] })
      .notNull()
      .default("UNPROCESSED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tax_summaries_org_month_uq").on(t.orgId, t.periodMonth),
    index("tax_summaries_org_year_idx").on(t.orgId, t.taxYear),
  ]
);

export type TaxSummaryRow = typeof taxSummaries.$inferSelect;
export type InsertTaxSummary = typeof taxSummaries.$inferInsert;
