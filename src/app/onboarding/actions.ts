"use server";

import { randomUUID } from "node:crypto";
import { requireVerifiedSession } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import {
  getOnboardingView,
  finalizeOnboarding,
} from "@/server/onboarding/engine";

async function orgId(): Promise<string> {
  const ctx = await requireVerifiedSession();
  return ctx.orgId;
}

export async function loadOnboardingView() {
  const id = await orgId();
  return withOrg(id, (tx) => getOnboardingView(tx, id));
}

export async function finishOnboarding(key?: string) {
  const id = await orgId();
  return finalizeOnboarding(id, key ?? randomUUID());
}
