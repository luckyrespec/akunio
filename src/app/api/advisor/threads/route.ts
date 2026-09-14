import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { createThread, listThreads } from "@/server/db/repos/chat.repo";

export async function GET() {
  const ctx = await requireContext();
  const threads = await withOrg(ctx.orgId, (tx) => listThreads(tx, ctx.orgId));
  return NextResponse.json(threads);
}

export async function POST(req: NextRequest) {
  const ctx = await requireContext();
  const body = await req.json().catch(() => ({}));
  const title = (body as { title?: string }).title?.trim() || "Percakapan baru";
  const t = await withOrg(ctx.orgId, (tx) => createThread(tx, ctx.orgId, title));
  return NextResponse.json(t);
}
