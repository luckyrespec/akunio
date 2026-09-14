import { NextRequest, NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getDocumentRow } from "@/server/db/repos/documents.repo";
import { getDocument } from "@/server/storage/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireContext();
    const { id } = await params;
    const row = await withOrg(ctx.orgId, (tx) => getDocumentRow(tx, ctx.orgId, id));
    if (!row) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });

    const buf = await getDocument(row.storageKey);
    const rawName = new URL(req.url).searchParams.get("name") || "dokumen";
    const safeName = rawName.replace(/[\\/"']/g, "").slice(0, 120) || "dokumen";

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": row.mime,
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Gagal mengunduh dokumen." }, { status: 500 });
  }
}
