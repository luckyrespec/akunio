import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { createThread, getThread, listMessages } from "@/server/db/repos/chat.repo";
import { askNara } from "@/server/ai/nara";

// Compatibility alias — /api/advisor/* delegates to Akunio (unified assistant)
// Keep for old widget/bookmarks; new clients should use /api/nara/*
export async function GET(req: NextRequest) {
  const ctx = await requireContext();
  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
  const t = await getThread(db, ctx.orgId, threadId);
  if (!t) return NextResponse.json({ error: "Thread tidak ditemukan." }, { status: 404 });
  const msgs = await listMessages(db, threadId);
  return NextResponse.json(msgs);
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext();
    const body = await req.json();
    const { threadId: incomingThreadId, message } = body as { threadId?: string; message: string };
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Pesan tidak boleh kosong." }, { status: 400 });
    }

    let threadId = incomingThreadId;
    if (!threadId) {
      const title = message.split(/\s+/).slice(0, 5).join(" ") || "Percakapan baru";
      const t = await db.transaction((tx) => createThread(tx, ctx.orgId, title));
      threadId = t.id;
    } else {
      const t = await getThread(db, ctx.orgId, threadId);
      if (!t) return NextResponse.json({ error: "Thread tidak ditemukan." }, { status: 404 });
    }

    const result = await askNara(ctx.orgId, threadId, message);
    // Map to legacy shape for old clients
    return NextResponse.json({ threadId, answer: result.answer, citations: result.citations, suggestedDraft: result.draft, draft: result.draft, draftId: result.draftId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
    if (msg.includes("Kuota")) return NextResponse.json({ error: msg }, { status: 429 });
    if (msg === "AI_TIDAK_TERSEDIA") return NextResponse.json({ error: "Asisten sedang tidak tersedia. Coba lagi sebentar." }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
