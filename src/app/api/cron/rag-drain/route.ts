import { NextResponse } from "next/server";
import { isRagTenantIndexingEnabled, processQueueBatch } from "@/server/ai/rag-worker";

// Drain antrean ingestion RAG (rag_queue -> tenant_chunks).
// Dijadwalkan eksternal (cron tiap 60 menit, ?limit=100) dengan header:
//   Authorization: Bearer <CRON_SECRET>
// Bukan per-request user: worker memanggil embedding Gemini yang lambat.
// Kill-switch: RAG_TENANT_INDEXING="0" → selalu {processed: 0, disabled: true}.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRagTenantIndexingEnabled()) {
    return NextResponse.json({ processed: 0, disabled: true });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 20), 1), 100);
  const processed = await processQueueBatch(limit);
  return NextResponse.json({ processed });
}
