import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getThread, listMessages, updateThread } from "@/server/db/repos/chat.repo";
import { DEFAULT_THREAD_TITLE, generateThreadTitle } from "@/server/ai/thread-title";

/** Minimal 3 pesan user sebelum Gemini diminta menamai sesi. */
const MIN_USER_MESSAGES = 3;

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Minta Gemini menamai ulang sesi berdasarkan konteks percakapan.
 * Idempoten: sesi yang judulnya sudah kustom tidak disentuh.
 */
export async function POST(req: NextRequest, props: RouteParams) {
  try {
    const ctx = await requireContext();
    const { id: threadId } = await props.params;
    const { thread, messages } = await withOrg(ctx.orgId, async (tx) => {
      const thread = await getThread(tx, ctx.orgId, threadId);
      if (!thread) return { thread: null, messages: [] as Awaited<ReturnType<typeof listMessages>> };
      const messages = await listMessages(tx, threadId);
      return { thread, messages };
    });
    if (!thread) {
      return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    }
    const current = (thread.title ?? "").trim();
    if (current && current !== DEFAULT_THREAD_TITLE) {
      return NextResponse.json({ title: current, renamed: false });
    }
    if (messages.filter((m) => m.role === "user").length < MIN_USER_MESSAGES) {
      return NextResponse.json({ title: current || DEFAULT_THREAD_TITLE, renamed: false });
    }
    const title = await generateThreadTitle(
      messages.map((m) => ({ role: m.role, content: m.content })),
    );
    if (!title || title === current) {
      return NextResponse.json({ title: current || title, renamed: false });
    }
    const updated = await withOrg(ctx.orgId, (tx) =>
      updateThread(tx, ctx.orgId, threadId, { title }),
    );
    return NextResponse.json({ title: updated?.title ?? title, renamed: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menamai percakapan.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
