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
import { ensureUserWorkspace } from "@/server/bootstrap/ensure-workspace";

export async function bootstrapNewUser(
  userId: string,
  displayName: string,
): Promise<void> {
  try {
    await ensureUserWorkspace(userId, displayName);
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
