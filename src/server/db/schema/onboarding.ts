import {
  pgTable, uuid, text, integer, timestamp, jsonb,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { organizations } from "./org";
import { BUSINESS_TYPES } from "@/core/accounts/business-types";

export const ONBOARDING_STEPS = [
  "NAMA",
  "USAHA",
  "JENIS",
  "STOK",
  "SKALA",
  "LOKASI",
  "REFERRAL",
  "RINGKASAN",
  "COA",
  "SELESAI",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const REVENUE_RANGES = ["LT_10JT", "R_10_50JT", "R_50_200JT", "GT_200JT", "BARU_MULAI"] as const;
export type RevenueRange = (typeof REVENUE_RANGES)[number];

export const REFERRAL_SOURCES = ["TEMAN", "GOOGLE", "SOSMED", "LAINNYA"] as const;
export type ReferralSource = (typeof REFERRAL_SOURCES)[number];

export const orgProfiles = pgTable(
  "org_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    displayName: text("display_name"),
    businessName: text("business_name"),
    businessType: text("business_type", { enum: BUSINESS_TYPES }),
    revenueRange: text("revenue_range", { enum: REVENUE_RANGES }),
    employeeCount: integer("employee_count"),
    city: text("city"),
    address: text("address"),
    referralSource: text("referral_source", { enum: REFERRAL_SOURCES }),
    coaDraft: jsonb("coa_draft"),
    idempotencyKey: text("idempotency_key"),
    status: text("status", { enum: ["IN_PROGRESS", "COMPLETED"] })
      .notNull()
      .default("IN_PROGRESS"),
    currentStep: text("current_step", { enum: ONBOARDING_STEPS })
      .notNull()
      .default("NAMA"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_profiles_org_uq").on(t.orgId)],
);

export const onboardingMessages = pgTable(
  "onboarding_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    step: text("step", { enum: ONBOARDING_STEPS }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("onboarding_messages_org_idx").on(t.orgId)],
);

export type OrgProfile = typeof orgProfiles.$inferSelect;
export type OnboardingMessage = typeof onboardingMessages.$inferSelect;
