import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db";
import {
  user,
  session,
  account,
  verification,
} from "@/server/db/schema/auth";
import { organizations, memberships } from "@/server/db/schema/org";
import { seedOrgData } from "@/server/bootstrap/seed-org";

export async function bootstrapNewUser(
  userId: string,
  displayName: string,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
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
  } catch (err) {
    // better-auth commits the user row before this hook runs and never
    // rolls it back on hook failure; delete it so the email is not burned.
    // The original error is rethrown, not swallowed.
    await db.delete(user).where(eq(user.id, userId));
    throw err;
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        after: async (created) => {
          await bootstrapNewUser(created.id, created.name);
        },
      },
    },
  },
});
