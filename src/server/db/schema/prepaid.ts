import { pgTable, uuid, text, varchar, date, numeric, timestamp, uniqueIndex, index, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";

export const prepaidContracts = pgTable("prepaid_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 32 }).notNull(),
  name: text("name").notNull(),
  vendor: text("vendor"),
  controlAccountId: uuid("control_account_id").notNull().references(() => accounts.id),
  expenseAccountId: uuid("expense_account_id").notNull().references(() => accounts.id),
  paymentAccountId: uuid("payment_account_id").notNull().references(() => accounts.id),
  totalMinor: numeric("total_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  startDate: date("start_date").notNull(),
  months: integer("months").notNull(),
  monthlyMinor: numeric("monthly_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  accumulatedMinor: numeric("accumulated_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull().default(sql`0`),
  remainingMinor: numeric("remaining_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  status: text("status", { enum: ["ACTIVE", "COMPLETED", "CANCELLED"] }).notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("prepaid_contracts_org_code_uq").on(t.orgId, t.code)]);

export const prepaidScheduleLines = pgTable("prepaid_schedule_lines", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").notNull().references(() => prepaidContracts.id, { onDelete: "cascade" }),
  periodName: varchar("period_name", { length: 7 }).notNull(),
  amortDate: date("amort_date").notNull(),
  amountMinor: numeric("amount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  accumulatedMinor: numeric("accumulated_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  remainingMinor: numeric("remaining_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  status: text("status", { enum: ["SCHEDULED", "POSTED"] }).notNull().default("SCHEDULED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("prepaid_sched_contract_period_uq").on(t.contractId, t.periodName),
  index("prepaid_sched_org_period_idx").on(t.orgId, t.periodName),
]);
