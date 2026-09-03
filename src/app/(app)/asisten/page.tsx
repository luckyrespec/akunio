import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listThreads } from "@/server/db/repos/chat.repo";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import AsistenClient from "./asisten-client";

export default async function AsistenPage() {
  const ctx = await requireContext();
  const threads = await listThreads(db, ctx.orgId);
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const settings = (org?.settings ?? {}) as { aiHitlPolicy?: "smart" | "strict" | "autonomous" };

  return (
    <AsistenClient
      initialThreads={threads}
      initialHitlPolicy={settings.aiHitlPolicy ?? "smart"}
      userEmail={ctx.userEmail}
    />
  );
}
