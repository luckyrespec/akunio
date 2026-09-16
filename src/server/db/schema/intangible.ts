import {
  pgTable,
  uuid,
  text,
  varchar,
  date,
  numeric,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";

export const intangibleAssets = pgTable(
  "intangible_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["LISENSI_SOFTWARE", "HAK_CIPTA", "PATEN", "MEREK_DAGANG", "GOODWILL", "LAINNYA"],
    }).notNull(),
    acquisitionDate: date("acquisition_date").notNull(),
    inServiceDate: date("in_service_date").notNull(),
    acquisitionCostMinor: numeric("acquisition_cost_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    amortizationMethod: text("amortization_method", {
      enum: ["STRAIGHT_LINE"],
    })
      .notNull()
      .default("STRAIGHT_LINE"),
    assetAccountId: uuid("asset_account_id")
      .notNull()
      .references(() => accounts.id),
    accumulatedAccountId: uuid("accumulated_account_id")
      .notNull()
      .references(() => accounts.id),
    amortizationExpenseAccountId: uuid("amortization_expense_account_id")
      .notNull()
      .references(() => accounts.id),
    status: text("status", {
      enum: ["ACTIVE", "FULLY_AMORTIZED", "DISPOSED"],
    })
      .notNull()
      .default("ACTIVE"),
    acquisitionPosted: boolean("acquisition_posted").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("intangible_assets_org_code_uq").on(t.orgId, t.code)],
);

export const intangibleAmortizationLines = pgTable(
  "intangible_amortization_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => intangibleAssets.id, { onDelete: "cascade" }),
    periodName: varchar("period_name", { length: 7 }).notNull(),
    amortizationDate: date("amortization_date").notNull(),
    amortizationAmountMinor: numeric("amortization_amount_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    accumulatedMinor: numeric("accumulated_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    bookValueMinor: numeric("book_value_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    status: text("status", { enum: ["SCHEDULED", "POSTED"] })
      .notNull()
      .default("SCHEDULED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("intangible_amor_asset_period_uq").on(t.assetId, t.periodName)],
);

export const intangibleDisposals = pgTable("intangible_disposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => intangibleAssets.id, { onDelete: "cascade" }),
  disposalDate: date("disposal_date").notNull(),
  disposalType: text("disposal_type", {
    enum: ["SALE", "SCRAP", "WRITE_OFF"],
  }).notNull(),
  proceedsMinor: numeric("proceeds_minor", { precision: 18, scale: 0, mode: "bigint" })
    .notNull()
    .default(sql`0`),
  bookValueAtDisposalMinor: numeric("book_value_at_disposal_minor", { precision: 18, scale: 0, mode: "bigint" })
    .notNull()
    .default(sql`0`),
  gainLossMinor: numeric("gain_loss_minor", { precision: 18, scale: 0, mode: "bigint" })
    .notNull()
    .default(sql`0`),
  depositAccountId: uuid("deposit_account_id").references(() => accounts.id),
  gainLossAccountId: uuid("gain_loss_account_id")
    .notNull()
    .references(() => accounts.id),
  journalEntryId: uuid("journal_entry_id")
    .notNull()
    .references(() => journalEntries.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itbSeqCounters = pgTable(
  "itb_seq_counters",
  {
    orgId: uuid("org_id").notNull(),
    year: integer("year").notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.year] })],
);
