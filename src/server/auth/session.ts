import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema/org";
import { ensureUserWorkspace } from "@/server/bootstrap/ensure-workspace";
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

  let [m] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, s.user.id))
    .limit(1);

  // Self-heal: logged in but workspace missing (e.g. wiped by an old test
  // run) — rebuild it instead of bouncing the user to /masuk forever.
  if (!m) {
    await ensureUserWorkspace(s.user.id, s.user.name);
    [m] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, s.user.id))
      .limit(1);
    if (!m) return null;
  }

  return {
    userId: s.user.id,
    userEmail: s.user.email,
    orgId: m.orgId,
    role: m.role,
  };
}
