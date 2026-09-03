import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { user } from "@/server/db/schema/auth";

// TEST-ONLY seam: flips email_verified for e2e (Playwright cannot click the
// verification link — delivery is stubbed in AI_MOCK mode).
// Returns 404 unless AI_MOCK=1. Never enable outside dev/test —
// equivalent to the TEST_CTX_ORG / AI_MOCK seams.
export async function POST(req: Request) {
  if (process.env.AI_MOCK !== "1") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { email } = (await req.json()) as { email?: string };
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email wajib diisi." }, { status: 400 });
  }
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
  return NextResponse.json({ ok: true });
}
