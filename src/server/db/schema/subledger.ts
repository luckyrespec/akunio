import { pgTable, uuid, text, numeric, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations, accounts } from "./org";
import { journalLines } from "./journal";

export const subledgerKindEnum = ["PIUTANG", "UTANG", "PERSEDIAAN"] as const;
export type SubledgerKind = (typeof subledgerKindEnum)[number];

export const subledgerControls = pgTable("subledger_controls", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: subledgerKindEnum }).notNull(),
  controlAccountId: uuid("control_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  allowManual: boolean("allow_manual").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("subledger_controls_org_kind_uq").on(t.orgId, t.kind),
  uniqueIndex("subledger_controls_org_account_uq").on(t.orgId, t.controlAccountId),
]);

export const subledgerJournalLinks = pgTable("subledger_journal_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  journalLineId: uuid("journal_line_id").notNull().references(() => journalLines.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: subledgerKindEnum }).notNull(),
  refId: uuid("ref_id").notNull(),
  amountMinor: numeric("amount_minor", { precision: 18, scale: 0, mode: "bigint" }).notNull(),
  qty: numeric("qty", { precision: 12, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("subledger_links_line_idx").on(t.journalLineId),
  index("subledger_links_org_kind_ref_idx").on(t.orgId, t.kind, t.refId),
]);
