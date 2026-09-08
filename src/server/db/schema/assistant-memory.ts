import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./org";

export const assistantMemories = pgTable(
  "assistant_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["PROFILE", "PREFERENCE", "FACT", "THREAD_SUMMARY"] }).notNull(),
    content: text("content").notNull(),
    source: text("source", { enum: ["user", "auto"] })
      .notNull()
      .default("user"),
    sourceThreadId: uuid("source_thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assistant_memories_org_idx").on(t.orgId),
    index("assistant_memories_org_kind_idx").on(t.orgId, t.kind),
  ],
);
