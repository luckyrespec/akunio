import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema/org";
import { ensureUserWorkspace } from "@/server/bootstrap/ensure-workspace";

export type Role = "OWNER" | "ACCOUNTANT" | "VIEWER";

export interface AppContext {
  userId: string;
  userEmail: string;
  emailVerified: boolean;
  orgId: string;
  role: Role;
}

export async function getActiveContext(): Promise<AppContext | null> {
  // Lazy import: @neondatabase/auth pulls next/headers at module scope,
  // which vitest cannot resolve. Tests run behind the TEST_CTX_ORG seam
  // (guard.ts) and never reach this import; real requests resolve it fine.
  const { auth } = await import("./auth-server");
  const { data: session } = await auth.getSession();
  const u = session?.user;
  if (!u) return null;

  let [m] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, u.id))
    .limit(1);

  // Lazy provisioning menggantikan signup-hook lama: request terautentikasi
  // pertama membuat org + OWNER + profil IN_PROGRESS (+ cermin identitas
  // lokal untuk join email). Neon Auth bersifat managed — hook user.create
  // lokal tidak lagi menyala.
  if (!m) {
    await ensureUserWorkspace(u.id, u.name ?? u.email, u.email);
    [m] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, u.id))
      .limit(1);
    if (!m) return null;
  }

  return {
    userId: u.id,
    userEmail: u.email,
    emailVerified: u.emailVerified ?? false,
    orgId: m.orgId,
    role: m.role,
  };
}
