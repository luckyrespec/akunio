import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";

export const sakSources = pgTable("sak_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  docId: text("doc_id").notNull(),
  version: text("version").notNull(),
  effectiveDate: date("effective_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SakSource = typeof sakSources.$inferSelect;
