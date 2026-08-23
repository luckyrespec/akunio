import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema/org";
import { auth } from "./auth-server";

export type Role = "OWNER" | "ACCOUNTANT" | "VIEWER";

export interface AppContext {
  userId: string;
  userEmail: string;
  orgId: string;
  role: Role;
}

export async function getActiveContext(): Promise<AppContext | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s) return null;
  const [m] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, s.user.id))
    .limit(1);
  if (!m) return null;
  return {
    userId: s.user.id,
    userEmail: s.user.email,
    orgId: m.orgId,
    role: m.role,
  };
}
