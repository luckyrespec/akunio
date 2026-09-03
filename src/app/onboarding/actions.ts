"use server";

import { randomUUID } from "node:crypto";
import { requireVerifiedSession } from "@/server/auth/guard";
import { db } from "@/server/db";
import {
  getOnboardingView,
  submitOnboardingMessage,
  finalizeOnboarding,
} from "@/server/onboarding/engine";

async function orgId(): Promise<string> {
  const ctx = await requireVerifiedSession();
  return ctx.orgId;
}

export async function sendOnboardingMessage(text: string) {
  const id = await orgId();
  return submitOnboardingMessage(db, id, text);
}

export async function loadOnboardingView() {
  const id = await orgId();
  return getOnboardingView(db, id);
}

export async function finishOnboarding(key?: string) {
  const id = await orgId();
  return finalizeOnboarding(id, key ?? randomUUID());
}
