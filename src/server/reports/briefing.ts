import { db } from "@/server/db";
import { eq, and, isNull, count } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import { journalEntries } from "@/server/db/schema/journal";
import { aiDrafts, documents } from "@/server/db/schema/ai";
import { postedLinesThrough, loadPeriodOrDefault } from "@/server/reports/build";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { aggregateFromLines, signed } from "@/core/reports/aggregates";
import { Money } from "@/core/money/money";

export interface DailyBriefingResponse {
  date: string;
  cashAndBank: {
    current: string;
    currentMinor: string;
    delta: string;
    trend: "up" | "down" | "flat";
  };
  pendingDraftsCount: number;
  unrecordedDocumentsCount: number;
  currentPeriod: {
    name: string;
    daysRemaining: number;
    deadline: string;
  } | null;
  suggestions: string[];
}

export async function getDailyBriefingData(orgId: string): Promise<DailyBriefingResponse> {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);

  // 1. Calculate Live Cash & Bank Balance
  const accRows = await db.select().from(accounts).where(eq(accounts.orgId, orgId));
  const metas = reportMetaMap(accRows);
  const cashLines = await postedLinesThrough(db, orgId, todayISO);
  const aggs = aggregateFromLines(cashLines, metas);
  const cashMinor = aggs
    .filter((a) => a.meta.isCash || a.meta.isBank)
    .reduce((s, a) => s + signed(a.meta, a), 0n);

  // 2. Count Pending Drafts (both journal drafts and AI drafts)
  const [draftCountRes] = await db
    .select({ count: count() })
    .from(journalEntries)
    .where(and(eq(journalEntries.orgId, orgId), eq(journalEntries.status, "DRAFT")));
  const [aiDraftCountRes] = await db
    .select({ count: count() })
    .from(aiDrafts)
    .where(and(eq(aiDrafts.orgId, orgId), eq(aiDrafts.status, "PENDING")));
  const pendingDraftsCount = Number(draftCountRes?.count ?? 0) + Number(aiDraftCountRes?.count ?? 0);

  // 3. Count Unrecorded Documents in Library
  const [unrecordedDocsRes] = await db
    .select({ count: count() })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.status, "UPLOADED")));
  const unrecordedDocumentsCount = Number(unrecordedDocsRes?.count ?? 0);

  // 4. Current Fiscal Period info
  const activePeriod = await db.transaction((tx) => loadPeriodOrDefault(tx, orgId, undefined));
  let periodInfo = null;
  if (activePeriod) {
    const end = new Date(activePeriod.endsOn);
    const diffTime = end.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    periodInfo = {
      name: activePeriod.name,
      daysRemaining,
      deadline: activePeriod.endsOn,
    };
  }

  // 5. Dynamic Suggestions
  const suggestions: string[] = [];
  if (pendingDraftsCount > 0) {
    suggestions.push("Review Draft");
  }
  if (unrecordedDocumentsCount > 0) {
    suggestions.push("Catat Dokumen");
  }
  if (periodInfo && periodInfo.daysRemaining <= 7) {
    suggestions.push(`Tutup Buku ${periodInfo.name}`);
  }
  suggestions.push("Cek kesehatan pembukuan");
  suggestions.push("Laporan Laba Rugi");

  return {
    date: todayISO,
    cashAndBank: {
      current: Money.fromMinor(cashMinor).formatIdr(),
      currentMinor: cashMinor.toString(),
      delta: "+Rp 0",
      trend: "flat",
    },
    pendingDraftsCount,
    unrecordedDocumentsCount,
    currentPeriod: periodInfo,
    suggestions: suggestions.slice(0, 4),
  };
}
