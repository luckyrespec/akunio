import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getThread, updateThread, deleteThread, listMessagesPage } from "@/server/db/repos/chat.repo";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteParams) {
  try {
    const ctx = await requireContext();
    const { id: threadId } = await props.params;
    const { thread, messages, hasMore } = await withOrg(ctx.orgId, async (tx) => {
      const thread = await getThread(tx, ctx.orgId, threadId);
      if (!thread) return { thread: null, messages: [], hasMore: false };
      // Riwayat dibatasi per halaman (default 50 terbaru); kursor ?before[CreatedAt|Id].
      const sp = req.nextUrl.searchParams;
      const { messages, hasMore } = await listMessagesPage(tx, threadId, {
        limit: Number(sp.get("limit")) || undefined,
        beforeCreatedAt: sp.get("before") ?? undefined,
        beforeId: sp.get("beforeId") ?? undefined,
      });
      return { thread, messages, hasMore };
    });
    if (!thread) {
      return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ thread, messages, hasMore });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal mengambil percakapan.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: RouteParams) {
  try {
    const ctx = await requireContext();
    const { id: threadId } = await props.params;
    const body = await req.json().catch(() => ({}));
    const patch: { title?: string; modelPreset?: string; pinned?: boolean } = {};
    if (typeof body.title === "string") patch.title = body.title.trim();
    if (typeof body.modelPreset === "string") patch.modelPreset = body.modelPreset;
    if (typeof body.pinned === "boolean") patch.pinned = body.pinned;

    const updated = await withOrg(ctx.orgId, (tx) => updateThread(tx, ctx.orgId, threadId, patch));
    if (!updated) {
      return NextResponse.json({ error: "Percakapan tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memperbarui percakapan.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: RouteParams) {
  try {
    const ctx = await requireContext();
    const { id: threadId } = await props.params;
    const ok = await withOrg(ctx.orgId, (tx) => deleteThread(tx, ctx.orgId, threadId));
    if (!ok) {
      return NextResponse.json({ error: "Percakapan tidak ditemukan atau gagal dihapus." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menghapus percakapan.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
