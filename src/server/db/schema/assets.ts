import {
  pgTable,
  uuid,
  text,
  varchar,
  date,
  numeric,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";

export const fixedAssets = pgTable(
  "fixed_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["TANAH", "BANGUNAN", "KENDARAAN", "MESIN_PERALATAN", "INVENTARIS_KANTOR"],
    }).notNull(),
    acquisitionDate: date("acquisition_date").notNull(),
    inServiceDate: date("in_service_date").notNull(),
    acquisitionCostMinor: numeric("acquisition_cost_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    salvageValueMinor: numeric("salvage_value_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    usefulLifeMonths: integer("useful_life_months").notNull(),
    depreciationMethod: text("depreciation_method", {
      enum: ["STRAIGHT_LINE", "DECLINING_BALANCE"],
    }).notNull(),
    depreciationRatePercent: numeric("depreciation_rate_percent", { precision: 5, scale: 2 }),
    assetAccountId: uuid("asset_account_id")
      .notNull()
      .references(() => accounts.id),
    accumulatedDepAccountId: uuid("accumulated_dep_account_id")
      .notNull()
      .references(() => accounts.id),
    depreciationExpenseAccountId: uuid("depreciation_expense_account_id")
      .notNull()
      .references(() => accounts.id),
    status: text("status", {
      enum: ["ACTIVE", "FULLY_DEPRECIATED", "DISPOSED"],
    })
      .notNull()
      .default("ACTIVE"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fixed_assets_org_code_uq").on(t.orgId, t.code)],
);

export const assetDepreciationLines = pgTable(
  "asset_depreciation_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => fixedAssets.id, { onDelete: "cascade" }),
    periodName: varchar("period_name", { length: 7 }).notNull(), // 'YYYY-MM'
    depreciationDate: date("depreciation_date").notNull(),
    depreciationAmountMinor: numeric("depreciation_amount_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    accumulatedDepreciationMinor: numeric("accumulated_depreciation_minor", { precision: 18, scale: 0, mode: "bigint" })
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
  (t) => [uniqueIndex("asset_dep_asset_period_uq").on(t.assetId, t.periodName)],
);

export const assetDisposals = pgTable("asset_disposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => fixedAssets.id, { onDelete: "cascade" }),
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
