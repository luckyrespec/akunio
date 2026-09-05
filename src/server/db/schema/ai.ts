import {
  pgTable, uuid, text, integer, jsonb, timestamp, index, uniqueIndex,
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

// Lampiran data dukung yang ditautkan ke entri jurnal (posting manual maupun AI).
export const journalDocuments = pgTable(
  "journal_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    fileName: text("file_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("jd_entry_doc_uq").on(t.entryId, t.documentId),
    index("jd_entry_idx").on(t.entryId),
  ],
);
