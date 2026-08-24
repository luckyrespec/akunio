import { redirect } from "next/navigation";
import { getActiveContext, type AppContext, type Role } from "./session";

// Test seam: when TEST_CTX_ORG is set, server actions run as an OWNER of that
// org without a real request scope (integration tests call actions directly).
// Never set outside tests — equivalent to the AI_MOCK seam.
function testContext(): AppContext | null {
  const orgId = process.env.TEST_CTX_ORG;
  if (!orgId) return null;
  return { userId: "test-user", userEmail: "test@test.id", orgId, role: "OWNER" };
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
