import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, organizations } from "@/server/db/schema/org";
import { seedOrgData } from "./seed-org";

/**
 * Ensures the user owns exactly one workspace: organization + OWNER membership
 * + seeded chart of accounts and fiscal periods.
 *
 * Called from two places:
 * - better-auth signup hook (new user)
 * - getActiveContext() self-heal (existing session whose workspace was lost,
 *   e.g. wiped by an old test run) — the user keeps their login and gets a
 *   fresh workspace on their next request instead of a redirect loop.
 */
export async function ensureUserWorkspace(
  userId: string,
  displayName: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  if (existing) return;

  await db.transaction(async (tx) => {
    // Serialize concurrent first-requests for the same user.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);

    const [again] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (again) return;

    const [org] = await tx
      .insert(organizations)
      .values({ name: displayName || "Organisasi Baru" })
      .returning();
    await tx.insert(memberships).values({
      orgId: org.id,
      userId,
      role: "OWNER",
    });
    await seedOrgData(org.id, 1, tx);
  });
}
