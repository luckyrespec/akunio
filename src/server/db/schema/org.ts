import {
  pgTable, uuid, text, integer, boolean, char, varchar, date,
  timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
  baseCurrency: text("base_currency").notNull().default("IDR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id").notNull().references(() => organizations.id),
    userId: text("user_id").notNull(),
    role: text("role", { enum: ["OWNER", "ACCOUNTANT", "VIEWER"] })
      .notNull()
      .default("VIEWER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.orgId, t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    code: varchar("code", { length: 8 }).notNull(),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["ASET", "LIABILITAS", "EKUITAS", "PENDAPATAN", "BEBAN"],
    }).notNull(),
    normal: char("normal", { length: 1 }).notNull(),
    parentCode: varchar("parent_code", { length: 8 }),
    isCash: boolean("is_cash").notNull().default(false),
    isBank: boolean("is_bank").notNull().default(false),
    contra: boolean("contra").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_org_code_uq").on(t.orgId, t.code)],
);

export const fiscalPeriods = pgTable(
  "fiscal_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: varchar("name", { length: 7 }).notNull(), // '2026-01'
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: text("status", { enum: ["OPEN", "CLOSED", "LOCKED"] })
      .notNull()
      .default("OPEN"),
  },
  (t) => [uniqueIndex("periods_org_name_uq").on(t.orgId, t.name)],
);
