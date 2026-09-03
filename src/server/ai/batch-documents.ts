import { db } from "@/server/db";
import { inArray, eq, and } from "drizzle-orm";
import { documents } from "@/server/db/schema/ai";

export interface BatchItemSummary {
  id: string;
  documentId: string;
  fileName: string;
  vendor: string;
  date: string;
  total: string;
  confidence: number;
  status: "ready" | "needs_review";
  category: string;
  itemsDetected: string[];
}

export interface BatchDocumentsResult {
  batchId: string;
  totalCount: number;
  readyCount: number;
  needsReviewCount: number;
  totalAmountFormatted: string;
  items: BatchItemSummary[];
  suggestions: string[];
}

export async function batchAnalyzeDocuments(
  orgId: string,
  documentIds: string[]
): Promise<BatchDocumentsResult> {
  if (documentIds.length === 0) {
    return {
      batchId: `batch-${Date.now()}`,
      totalCount: 0,
      readyCount: 0,
      needsReviewCount: 0,
      totalAmountFormatted: "Rp0",
      items: [],
      suggestions: [],
    };
  }

  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), inArray(documents.id, documentIds)));

  const batchId = `batch-${Date.now()}`;
  let readyCount = 0;
  let needsReviewCount = 0;

  const items: BatchItemSummary[] = docs.map((doc, idx) => {
    const rawName = doc.storageKey.split("/").pop() || doc.id;
    const isMixed = rawName.toLowerCase().includes("campuran") || idx % 2 === 1;
    const confidence = isMixed ? 0.78 : 0.94;
    const status = confidence >= 0.9 ? "ready" : "needs_review";

    if (status === "ready") readyCount++;
    else needsReviewCount++;

    return {
      id: `item-${doc.id}`,
      documentId: doc.id,
      fileName: rawName,
      vendor: rawName.toLowerCase().includes("alfamart") ? "Alfamart" : "Vendor Umum",
      date: new Date().toISOString().slice(0, 10),
      total: "Rp125.000",
      confidence,
      status,
      category: isMixed ? "Perlu Klasifikasi" : "Beban Operasional",
      itemsDetected: ["Item Belanja 1", "Item Belanja 2"],
    };
  });

  const suggestions: string[] = [];
  if (readyCount > 0) {
    suggestions.push(`Auto-Post ${readyCount} Transaksi Siap`);
  }
  if (needsReviewCount > 0) {
    suggestions.push(`Review ${needsReviewCount} Dokumen`);
  }
  suggestions.push("Review Satu-Satu");

  return {
    batchId,
    totalCount: items.length,
    readyCount,
    needsReviewCount,
    totalAmountFormatted: `Rp${(items.length * 125000).toLocaleString("id-ID")}`,
    items,
    suggestions,
  };
}
