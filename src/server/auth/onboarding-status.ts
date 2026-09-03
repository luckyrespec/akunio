import { db } from "@/server/db";
import { getProfile } from "@/server/db/repos/onboarding.repo";

export type OnboardingStatus = "IN_PROGRESS" | "COMPLETED";

/** Null = no profile row (legacy org) — callers treat it as IN_PROGRESS. */
export async function getOnboardingStatus(orgId: string): Promise<OnboardingStatus | null> {
  const profile = await getProfile(db, orgId);
  if (!profile) return null;
  return profile.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
}
