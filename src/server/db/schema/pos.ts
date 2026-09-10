import {
  pgTable,
  uuid,
  text,
  varchar,
  date,
  numeric,
  timestamp,
  uniqueIndex,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";
import { kasBankEntries } from "./cash-bank";
import { inventoryItems } from "./inventory";

export const posShifts = pgTable(
  "pos_shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    cashAccountId: uuid("cash_account_id")
      .notNull()
      .references(() => accounts.id),
    openedBy: text("opened_by"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openingCashMinor: numeric("opening_cash_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    status: text("status", { enum: ["BUKA", "TUTUP"] }).notNull().default("BUKA"),
    varianceJournalEntryId: uuid("variance_journal_entry_id").references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pos_shifts_org_status_idx").on(t.orgId, t.status)],
);

export const posSales = pgTable(
  "pos_sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    shiftId: uuid("shift_id").references(() => posShifts.id),
    number: varchar("number", { length: 32 }).notNull(),
    soldDate: date("sold_date").notNull(),
    paymentMethod: text("payment_method", { enum: ["TUNAI", "QRIS", "TRANSFER"] }).notNull(),
    cashAccountId: uuid("cash_account_id")
      .notNull()
      .references(() => accounts.id),
    subtotalMinor: numeric("subtotal_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
    discountMinor: numeric("discount_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    totalMinor: numeric("total_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
    cashReceivedMinor: numeric("cash_received_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
    changeMinor: numeric("change_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    buyerName: text("buyer_name"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    kasEntryId: uuid("kas_entry_id").references(() => kasBankEntries.id),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pos_sales_org_number_uq").on(t.orgId, t.number),
    uniqueIndex("pos_sales_org_idem_uq").on(t.orgId, t.idempotencyKey),
    index("pos_sales_org_date_idx").on(t.orgId, t.soldDate),
    index("pos_sales_org_shift_idx").on(t.orgId, t.shiftId),
  ],
);

export const posSaleItems = pgTable(
  "pos_sale_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => posSales.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    qty: numeric("qty", { precision: 12, scale: 4 }).notNull(),
    unitPriceMinor: numeric("unit_price_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
    discountMinor: numeric("discount_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    lineTotalMinor: numeric("line_total_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
    unitCostMinor: numeric("unit_cost_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [index("pos_sale_items_sale_idx").on(t.saleId)],
);

export const posSaleSeqCounters = pgTable(
  "pos_sale_seq_counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    year: text("year").notNull(),
    last: integer("last").notNull().default(0),
  },
  (t) => [uniqueIndex("pos_sale_seq_org_year_uq").on(t.orgId, t.year)],
);
