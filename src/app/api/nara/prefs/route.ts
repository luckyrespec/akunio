import { NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema/org";
import { eq } from "drizzle-orm";
import { parseAiPrefs } from "@/lib/ai-prefs";

/** Preferensi AI organisasi untuk klien chat (widget + halaman asisten). */
export async function GET() {
  try {
    const ctx = await requireContext();
    const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
    return NextResponse.json({ prefs: parseAiPrefs(org?.settings) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memuat preferensi AI.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
