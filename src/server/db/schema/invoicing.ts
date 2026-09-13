import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { organizations, accounts } from "./org";
import { journalEntries } from "./journal";
import { inventoryItems } from "./inventory";

export const contactTypeEnum = ["CUSTOMER", "VENDOR", "BOTH"] as const;
export type ContactType = (typeof contactTypeEnum)[number];

export const invoiceTypeEnum = ["INVOICE", "BILL"] as const;
export type InvoiceType = (typeof invoiceTypeEnum)[number];

export const invoiceStatusEnum = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
] as const;
export type InvoiceStatus = (typeof invoiceStatusEnum)[number];

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type", { enum: contactTypeEnum }).notNull().default("CUSTOMER"),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    address: text("address"),
    taxId: varchar("tax_id", { length: 50 }),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("contacts_org_id_idx").on(t.orgId),
    index("contacts_org_name_idx").on(t.orgId, t.name),
  ]
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: text("type", { enum: invoiceTypeEnum }).notNull().default("INVOICE"),
    invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("IDR"),
    subtotalMinor: numeric("subtotal_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    discountMinor: numeric("discount_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    taxMinor: numeric("tax_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    totalMinor: numeric("total_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    amountPaidMinor: numeric("amount_paid_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    status: text("status", { enum: invoiceStatusEnum }).notNull().default("DRAFT"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("invoices_org_number_uq").on(t.orgId, t.invoiceNumber),
    index("invoices_org_status_idx").on(t.orgId, t.status),
    index("invoices_org_contact_idx").on(t.orgId, t.contactId),
    index("invoices_org_due_idx").on(t.orgId, t.dueDate),
  ]
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    catalogItemId: uuid("catalog_item_id").references(() => inventoryItems.id, {
      onDelete: "restrict",
    }),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1.00"),
    unitPriceMinor: numeric("unit_price_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    discountMinor: numeric("discount_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
    taxRatePercent: numeric("tax_rate_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("0.00"),
    totalMinor: numeric("total_minor", { precision: 18, scale: 0, mode: "bigint" })
      .notNull()
      .default(sql`0`),
  },
  (t) => [index("invoice_items_inv_idx").on(t.invoiceId), index("invoice_items_catalog_idx").on(t.catalogItemId)]
);

export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    paymentDate: date("payment_date").notNull(),
    amountMinor: numeric("amount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
    paymentAccountId: uuid("payment_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    referenceNumber: varchar("reference_number", { length: 100 }),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("invoice_payments_inv_idx").on(t.invoiceId)]
);

export const invoiceSeqCounters = pgTable(
  "invoice_seq_counters",
  {
    orgId: uuid("org_id").notNull(),
    year: integer("year").notNull(),
    type: text("type", { enum: invoiceTypeEnum }).notNull(),
    lastSeq: integer("last_seq").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.year, t.type] })],
);
