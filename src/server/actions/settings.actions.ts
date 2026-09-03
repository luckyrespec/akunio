"use server";

import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateHitlPolicyAction(policy: "smart" | "strict" | "autonomous") {
  try {
    const ctx = await requireContext(["OWNER", "ACCOUNTANT"]);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    const settings = ((org?.settings as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    settings.aiHitlPolicy = policy;

    await db
      .update(organizations)
      .set({ settings })
      .where(eq(organizations.id, ctx.orgId));

    try {
      revalidatePath("/pengaturan");
      revalidatePath("/asisten");
    } catch {}
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memperbarui kebijakan AI.";
    return { ok: false, error: msg };
  }
}
