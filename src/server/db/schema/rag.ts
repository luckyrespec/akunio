import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  customType,
  boolean,
} from "drizzle-orm/pg-core";
import { organizations } from "./org";

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    // Fallback to text (JSON array) when pgvector extension is not installed
    // (native Windows Postgres). Production Docker image has real vector(768).
    return "text";
  },
  toDriver(value: number[]) {
    return JSON.stringify(value);
  },
  fromDriver(value: string) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as number[];
      } catch {
        return value as unknown as number[];
      }
    }
    return value as unknown as number[];
  },
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const ifrsChunks = pgTable(
  "ifrs_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    section: text("section").notNull(),
    chunkIndex: text("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    tsv: tsvector("tsv"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ifrs_chunks_section_idx").on(t.section)],
);

export const tenantChunks = pgTable(
  "tenant_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    sourceKind: text("source_kind", {
      enum: ["JOURNAL", "ACCOUNT", "PERIOD_SUMMARY", "DOCUMENT"],
    }).notNull(),
    refId: uuid("ref_id"),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    tsv: tsvector("tsv"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenant_chunks_org_idx").on(t.orgId)],
);

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    title: text("title").notNull(),
    modelPreset: text("model_preset").notNull().default("fast"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_threads_org_idx").on(t.orgId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    reasoning: text("reasoning"),
    attachments: jsonb("attachments"),
    toolInvocations: jsonb("tool_invocations"),
    citations: jsonb("citations"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_thread_idx").on(t.threadId)],
);

export const ragQueue = pgTable(
  "rag_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    kind: text("kind", {
      enum: ["JOURNAL", "ACCOUNT", "PERIOD_SUMMARY", "DOCUMENT"],
    }).notNull(),
    refId: uuid("ref_id"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rag_queue_org_idx").on(t.orgId)],
);
