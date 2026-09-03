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
  secret: process.env.BETTER_AUTH_SECRET || "neraca-auth-secret-key-default",
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://127.0.0.1:3000",
    "https://127.0.0.1:3000",
    "https://threadsle.zap-clipper.my.id",
    "http://threadsle.zap-clipper.my.id",
    "https://*.zap-clipper.my.id",
    "http://*.zap-clipper.my.id",
  ],
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
