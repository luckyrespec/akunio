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

function requiredSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET wajib diisi di production.");
  }
  return s || "neraca-dev-secret-only";
}

function trustedOrigins(): string[] {
  const extra = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...extra,
  ];
}

function googleProvider() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return {};
  return { google: { clientId, clientSecret } };
}

export const auth = betterAuth({
  secret: requiredSecret(),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: trustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      const { sendAuthEmail } = await import("./email");
      await sendAuthEmail("reset-password", user, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, url }) => {
      const { sendAuthEmail } = await import("./email");
      await sendAuthEmail("verification", user, url);
    },
  },
  socialProviders: {
    ...googleProvider(),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit:
    // Relaxed in AI_MOCK dev/test so parallel e2e workers never 429 each
    // other on the shared localhost IP bucket. Production keeps strict caps.
    process.env.AI_MOCK === "1"
      ? { enabled: false }
      : {
          enabled: true,
          window: 60,
          max: 20,
          customRules: {
            "/sign-in/email": { window: 60, max: 10 },
            "/sign-up/email": { window: 60, max: 10 },
          },
        },
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
