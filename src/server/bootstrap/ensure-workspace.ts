import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, organizations } from "@/server/db/schema/org";
import { user } from "@/server/db/schema/auth";
import { upsertProfile } from "@/server/db/repos/onboarding.repo";

/**
 * Ensures the user owns exactly one workspace: organization + OWNER membership
 * + an IN_PROGRESS onboarding profile.
 *
 * COA and fiscal periods are NOT seeded here anymore — they are provisioned
 * atomically when onboarding completes (see src/server/onboarding/engine.ts).
 *
 * Identity mirror: Neon Auth is managed, so the local `user` table is only
 * a read mirror (id/email/name) for joins like the member list — passwords
 * and sessions never live here. It is (up)serted on every ensure call.
 *
 * Called from two places:
 * - getActiveContext() lazy provisioning on the first authenticated request
 *   (Neon Auth has no local user.create hook to attach to)
 * - getActiveContext() self-heal (existing session whose workspace was lost,
 *   e.g. wiped by an old test run) — the user keeps their login and gets a
 *   fresh workspace on their next request instead of a redirect loop.
 */
export async function ensureUserWorkspace(
  userId: string,
  displayName: string,
  email?: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: memberships.id, orgId: memberships.orgId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  if (existing) {
    // Self-heal for pre-onboarding workspaces (also backfills the profile).
    await upsertProfile(db, existing.orgId, {});
    await mirrorIdentity(db, userId, displayName, email);
    return;
  }

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
    await upsertProfile(tx, org.id, {});
    await mirrorIdentity(tx, userId, displayName, email);
  });
}

type MirrorDb = Parameters<typeof upsertProfile>[0];

async function mirrorIdentity(
  q: MirrorDb,
  userId: string,
  displayName: string,
  email?: string,
): Promise<void> {
  if (!email) return;
  await q
    .insert(user)
    .values({
      id: userId,
      name: displayName || email,
      email,
      emailVerified: false,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: user.id,
      set: { name: displayName || email, email, updatedAt: new Date() },
    });
}
