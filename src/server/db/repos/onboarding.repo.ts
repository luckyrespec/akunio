import { eq } from "drizzle-orm";
import {
  orgProfiles,
  onboardingMessages,
  type OnboardingStep,
} from "../schema/onboarding";
import type { Queryable } from "./queryable";

export type { OrgProfile, OnboardingMessage } from "../schema/onboarding";

export async function getProfile(q: Queryable, orgId: string) {
  const [row] = await q
    .select()
    .from(orgProfiles)
    .where(eq(orgProfiles.orgId, orgId))
    .limit(1);
  return row ?? null;
}

export async function upsertProfile(
  q: Queryable,
  orgId: string,
  patch: Partial<typeof orgProfiles.$inferInsert>,
) {
  const [row] = await q
    .insert(orgProfiles)
    .values({ orgId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: orgProfiles.orgId,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  return row;
}

export async function addOnboardingMessage(
  q: Queryable,
  orgId: string,
  role: "user" | "assistant",
  content: string,
  step?: OnboardingStep | null,
) {
  const [row] = await q
    .insert(onboardingMessages)
    .values({ orgId, role, content, step: step ?? null })
    .returning();
  return row;
}

export async function listOnboardingMessages(q: Queryable, orgId: string) {
  return q
    .select()
    .from(onboardingMessages)
    .where(eq(onboardingMessages.orgId, orgId))
    .orderBy(onboardingMessages.createdAt);
}
