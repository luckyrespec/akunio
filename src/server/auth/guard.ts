import { redirect } from "next/navigation";
import { getActiveContext, isEmailVerified, type AppContext, type Role } from "./session";
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

/** Logged in + email verified. Unverified users go to /verifikasi. */
export async function requireVerifiedSession(): Promise<AppContext> {
  const testCtx = testContext();
  if (testCtx) return testCtx;
  const ctx = await getActiveContext();
  if (!ctx) redirect("/masuk");
  const verified = ctx.emailVerified || (await isEmailVerified(ctx.userId));
  if (!verified) redirect("/verifikasi");
  return { ...ctx, emailVerified: true };
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
