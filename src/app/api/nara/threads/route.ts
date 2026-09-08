import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { createThread, listThreads } from "@/server/db/repos/chat.repo";

export async function GET() {
  try {
    const ctx = await requireContext();
    const threads = await listThreads(db, ctx.orgId);
    return NextResponse.json({ threads });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal mengambil daftar percakapan.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext();
    const body = await req.json().catch(() => ({}));
    const title = (body as { title?: string }).title?.trim() || "Percakapan baru";
    const modelPreset = (body as { modelPreset?: string }).modelPreset || "fast";
    const t = await db.transaction((tx) => createThread(tx, ctx.orgId, title, modelPreset));
    return NextResponse.json(t);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membuat percakapan baru.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
