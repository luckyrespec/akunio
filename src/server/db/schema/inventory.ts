import {
  pgTable,
  uuid,
  text,
  varchar,
  date,
  numeric,
  boolean,
  timestamp,
  uniqueIndex,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";

export const inventorySettings = pgTable("inventory_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  valuationMethod: text("valuation_method", {
    enum: ["WEIGHTED_AVERAGE", "FIFO"],
  })
    .notNull()
    .default("WEIGHTED_AVERAGE"),
  recordingMethod: text("recording_method", {
    enum: ["PERPETUAL", "PERIODIC"],
  })
    .notNull()
    .default("PERPETUAL"),
  cogsAccountId: uuid("cogs_account_id").references(() => accounts.id),
  adjustmentLossAccountId: uuid("adjustment_loss_account_id").references(() => accounts.id),
  adjustmentGainAccountId: uuid("adjustment_gain_account_id").references(() => accounts.id),
  isLocked: boolean("is_locked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("inventory_settings_org_uq").on(t.orgId),
]);

export const inventorySkuCounters = pgTable(
  "inventory_sku_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    lastSeq: integer("last_seq").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId] })],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(),
    itemType: text("item_type", { enum: ["BARANG", "JASA"] }).notNull().default("BARANG"),
    revenueAccountId: uuid("revenue_account_id").references(() => accounts.id),
    expenseAccountId: uuid("expense_account_id").references(() => accounts.id),
    name: text("name").notNull(),
    barcode: varchar("barcode", { length: 64 }),
    appBarcode: varchar("app_barcode", { length: 16 }),
    imageStorageKey: text("image_storage_key"),
    imageMime: varchar("image_mime", { length: 32 }),
    unit: varchar("unit", { length: 32 }).notNull().default("Pcs"),
    category: varchar("category", { length: 64 }),
    minStockAlert: numeric("min_stock_alert", { precision: 12, scale: 4 }).default("0"),

    currentQty: numeric("current_qty", { precision: 12, scale: 4 }).notNull().default("0"),
    totalCostMinor: numeric("total_cost_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    averageCostMinor: numeric("average_cost_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),

    standardSellingPriceMinor: numeric("standard_selling_price_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_items_org_code_uq").on(t.orgId, t.code),
    uniqueIndex("inventory_items_org_app_barcode_uq").on(t.orgId, t.appBarcode),
  ],
);

export const inventoryLayers = pgTable("inventory_layers", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  initialQty: numeric("initial_qty", { precision: 12, scale: 4 }).notNull(),
  remainingQty: numeric("remaining_qty", { precision: 12, scale: 4 }).notNull(),
  unitCostMinor: numeric("unit_cost_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  referenceType: text("reference_type", {
    enum: ["PURCHASE", "OPENING_BALANCE", "ADJUSTMENT"],
  }).notNull(),
  referenceId: uuid("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type", { enum: ["IN", "OUT", "ADJUSTMENT"] }).notNull(),
  qty: numeric("qty", { precision: 12, scale: 4 }).notNull(),
  unitCostMinor: numeric("unit_cost_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  totalCostMinor: numeric("total_cost_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  resultingQty: numeric("resulting_qty", { precision: 12, scale: 4 }).notNull(),
  resultingTotalCostMinor: numeric("resulting_total_cost_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  sourceType: text("source_type", { enum: ["INVOICE", "JOURNAL", "OPNAME", "MANUAL", "POS"] }).notNull(),
  sourceId: uuid("source_id"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockOpnames = pgTable("stock_opnames", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  number: varchar("number", { length: 32 }).notNull(),
  opnameDate: date("opname_date").notNull(),
  status: text("status", {
    enum: ["DRAFT", "IN_PROGRESS", "REVIEW_DRAFT_JOURNAL", "COMPLETED", "CANCELLED"],
  })
    .notNull()
    .default("DRAFT"),
  totalDifferenceValueMinor: numeric("total_difference_value_minor", { precision: 18, scale: 0, mode: "bigint" })
    .notNull()
    .default(sql`0`),
  journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("stock_opnames_org_number_uq").on(t.orgId, t.number),
]);

export const stockOpnameItems = pgTable("stock_opname_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  opnameId: uuid("opname_id")
    .notNull()
    .references(() => stockOpnames.id, { onDelete: "cascade" }),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id, { onDelete: "cascade" }),
  systemQty: numeric("system_qty", { precision: 12, scale: 4 }).notNull(),
  physicalQty: numeric("physical_qty", { precision: 12, scale: 4 }).notNull(),
  differenceQty: numeric("difference_qty", { precision: 12, scale: 4 }).notNull(),
  unitCostMinor: numeric("unit_cost_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  differenceValueMinor: numeric("difference_value_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  reason: text("reason"),
});
