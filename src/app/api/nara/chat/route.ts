import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { createThread, getThread, listMessages } from "@/server/db/repos/chat.repo";
import { askNara } from "@/server/ai/nara";
import { ALLOWED_MIMES, MAX_DOCUMENT_BYTES } from "@/server/storage/storage";

export async function GET(req: NextRequest) {
  const ctx = await requireContext();
  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
  const t = await withOrg(ctx.orgId, (tx) => getThread(tx, ctx.orgId, threadId));
  if (!t) return NextResponse.json({ error: "Thread tidak ditemukan." }, { status: 404 });
  const msgs = await withOrg(ctx.orgId, (tx) => listMessages(tx, threadId));
  return NextResponse.json(msgs);
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireContext();
    let threadId: string | undefined;
    let message: string | undefined;
    let document: { dataBase64: string; mime: string } | undefined;

    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      threadId = (fd.get("threadId") as string) || undefined;
      message = String(fd.get("message") ?? "").trim();
      const file = fd.get("file");
      if (file instanceof File && file.size > 0) {
        if (!ALLOWED_MIMES.includes(file.type as never)) {
          return NextResponse.json({ error: "Tipe file harus gambar atau PDF." }, { status: 400 });
        }
        if (file.size > MAX_DOCUMENT_BYTES) {
          return NextResponse.json({ error: "Ukuran file maksimal 5 MB." }, { status: 400 });
        }
        const buf = Buffer.from(await file.arrayBuffer());
        document = { dataBase64: buf.toString("base64"), mime: file.type };
        if (!message) message = "Buat jurnal dari dokumen terlampir";
      }
    } else {
      const body = (await req.json()) as { threadId?: string; message: string };
      threadId = body.threadId;
      message = body.message?.trim();
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Pesan tidak boleh kosong." }, { status: 400 });
    }

    if (!threadId) {
      const title = message.split(/\s+/).slice(0, 5).join(" ") || "Percakapan baru";
      const t = await withOrg(ctx.orgId, (tx) => createThread(tx, ctx.orgId, title));
      threadId = t.id;
    } else {
      const tid: string = threadId;
      const t = await withOrg(ctx.orgId, (tx) => getThread(tx, ctx.orgId, tid));
      if (!t) return NextResponse.json({ error: "Thread tidak ditemukan." }, { status: 404 });
    }

    const result = await askNara(ctx.orgId, threadId!, message, document ? { document } : undefined);
    return NextResponse.json({ threadId, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Terjadi kesalahan.";
    if (msg.includes("Kuota")) return NextResponse.json({ error: msg }, { status: 429 });
    if (msg === "AI_TIDAK_TERSEDIA") return NextResponse.json({ error: "Asisten sedang tidak tersedia. Coba lagi sebentar." }, { status: 503 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
