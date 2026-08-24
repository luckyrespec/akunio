import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { createThread, listThreads } from "@/server/db/repos/chat.repo";

export async function GET() {
  const ctx = await requireContext();
  const threads = await listThreads(db, ctx.orgId);
  return NextResponse.json(threads);
}

export async function POST(req: NextRequest) {
  const ctx = await requireContext();
  const body = await req.json().catch(() => ({}));
  const title = (body as { title?: string }).title?.trim() || "Percakapan baru";
  const t = await db.transaction((tx) => createThread(tx, ctx.orgId, title));
  return NextResponse.json(t);
}
