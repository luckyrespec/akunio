import { NextResponse } from "next/server";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getInventoryItem } from "@/server/db/repos/inventory.repo";
import { getDocument } from "@/server/storage/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const item = await getInventoryItem(db, ctx.orgId, id);
  if (!item?.imageStorageKey) {
    return NextResponse.json({ error: "Foto tidak ada." }, { status: 404 });
  }
  const buf = await getDocument(item.imageStorageKey);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": item.imageMime ?? "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
