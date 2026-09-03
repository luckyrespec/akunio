import { NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { documents } from "@/server/db/schema/ai";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  try {
    const ctx = await requireContext();
    const rows = await db
      .select({
        id: documents.id,
        storageKey: documents.storageKey,
        mime: documents.mime,
        sizeBytes: documents.sizeBytes,
        status: documents.status,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.orgId, ctx.orgId))
      .orderBy(desc(documents.createdAt));

    const files = rows.map((r) => {
      const fileName = r.storageKey.split("/").pop() || "dokumen";
      return {
        id: r.id,
        storageKey: r.storageKey,
        fileName,
        mime: r.mime,
        sizeBytes: r.sizeBytes,
        status: r.status,
        createdAt: r.createdAt,
      };
    });

    return NextResponse.json({ files });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal memuat pustaka dokumen.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
