import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { organizations } from "./org";
export const aiFindings = pgTable("ai_findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  type: text("type").notNull(),
  severity: text("severity", { enum: ["HIGH","MEDIUM","LOW"] }).notNull(),
  status: text("status", { enum: ["open","resolved","dismissed"] }).notNull().default("open"),
  evidence: jsonb("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_findings_org_status_idx").on(t.orgId, t.status)]);
export const aiProposals = pgTable("ai_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id").notNull().references(() => organizations.id),
  findingId: uuid("finding_id").notNull().references(() => aiFindings.id),
  draft: jsonb("draft").notNull(),
  ifrsCitation: text("ifrs_citation"),
  status: text("status", { enum: ["pending","accepted","rejected"] }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ai_proposals_org_idx").on(t.orgId)]);
