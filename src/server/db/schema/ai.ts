import {
  pgTable, uuid, text, integer, jsonb, timestamp, index,
} from "drizzle-orm/pg-core";
import { organizations } from "./org";
import { journalEntries } from "./journal";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    extracted: jsonb("extracted"),
    status: text("status", { enum: ["UPLOADED", "EXTRACTED", "FAILED"] })
      .notNull()
      .default("UPLOADED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_org_idx").on(t.orgId)],
);

export const aiDrafts = pgTable(
  "ai_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    kind: text("kind", { enum: ["TEXT", "DOCUMENT"] }).notNull(),
    documentId: uuid("document_id").references(() => documents.id),
    inputText: text("input_text").notNull().default(""),
    draft: jsonb("draft").notNull(),
    model: text("model").notNull(),
    status: text("status", { enum: ["PENDING", "ACCEPTED", "REJECTED"] })
      .notNull()
      .default("PENDING"),
    postedEntryId: uuid("posted_entry_id").references(() => journalEntries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_drafts_org_status_idx").on(t.orgId, t.status)],
);
