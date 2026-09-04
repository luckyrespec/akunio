import { redirect } from "next/navigation";
import { getActiveContext, type AppContext, type Role } from "./session";
import { getOnboardingStatus } from "./onboarding-status";

// Test seam: when TEST_CTX_ORG is set, server actions run as an OWNER of that
// org without a real request scope (integration tests call actions directly).
// Never set outside tests — equivalent to the AI_MOCK seam.
function testContext(): (AppContext & { onboardingCompleted: boolean }) | null {
  const orgId = process.env.TEST_CTX_ORG;
  if (!orgId) return null;
  return {
    userId: "test-user",
    userEmail: "test@test.id",
    emailVerified: true,
    orgId,
    role: "OWNER",
    onboardingCompleted: true,
  };
}

export async function requireContext(allowed?: Role[]): Promise<AppContext> {
  const testCtx = testContext();
  const ctx = testCtx ?? (await getActiveContext());
  if (!ctx) redirect("/masuk");
  if (allowed && !allowed.includes(ctx.role)) {
    throw new Error("FORBIDDEN_AKSES");
  }
  return ctx;
}

/**
 * Session gate for onboarding + verified-only surfaces.
 *
 * Design note: this checks SESSION PRESENCE only, never the
 * emailVerified flag. Rationale: with Neon Auth, an unverified user in
 * `require_email_verification` mode is never issued a session at all
 * (signup returns no token; sign-in fails EMAIL_NOT_VERIFIED) — so a
 * live session already implies "verified or verification not required".
 * Enforcing the flag here would wrongly lock out sessions on branches
 * where verification is optional (e.g. the e2e branch). The /verifikasi
 * funnel is driven explicitly by AuthForm routing, not by this gate.
 */
export async function requireVerifiedSession(): Promise<AppContext> {
  const testCtx = testContext();
  if (testCtx) return testCtx;
  const ctx = await getActiveContext();
  if (!ctx) redirect("/masuk");
  return ctx;
}

/** Verified + onboarding COMPLETED. Everyone else funnels to /onboarding. */
export async function requireOnboardedContext(allowed?: Role[]): Promise<AppContext> {
  const testCtx = testContext();
  if (testCtx) return testCtx;
  const ctx = await requireVerifiedSession();
  if (allowed && !allowed.includes(ctx.role)) {
    throw new Error("FORBIDDEN_AKSES");
  }
  const status = await getOnboardingStatus(ctx.orgId);
  if (status !== "COMPLETED") redirect("/onboarding");
  return ctx;
}
