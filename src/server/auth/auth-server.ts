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

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const [org] = await db
            .insert(organizations)
            .values({ name: user.name || "Organisasi Baru" })
            .returning();
          await db.insert(memberships).values({
            orgId: org.id,
            userId: user.id,
            role: "OWNER",
          });
          await seedOrgData(org.id);
        },
      },
    },
  },
});
