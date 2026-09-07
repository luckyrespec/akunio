import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getFinding } from "@/server/db/repos/findings.repo";
import { PageHeader } from "@/components/page-header";
import { TemuanDetailActions } from "./temuan-detail-actions";
import { TemuanDetailClient } from "./temuan-detail-client";
import type { FindingView } from "../finding-meta";

import { cn } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TemuanDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireContext();
  const row = await getFinding(db, ctx.orgId, id);
  if (!row) notFound();

  const finding: FindingView = {
    id: row.id,
    type: row.type,
    severity: row.severity as FindingView["severity"],
    status: row.status,
    evidence: (row.evidence as Record<string, unknown>) ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };

  // Cek apakah temuan ini sudah memiliki draf koreksi yang masih PENDING
  const { aiDrafts } = await import("@/server/db/schema/ai");
  const { and, eq, sql } = await import("drizzle-orm");
  const [pendingDraft] = await db
    .select({ id: aiDrafts.id })
    .from(aiDrafts)
    .where(
      and(
        eq(aiDrafts.orgId, ctx.orgId),
        eq(aiDrafts.status, "PENDING"),
        sql`${aiDrafts.draft}->>'findingId' = ${finding.id}`,
      ),
    )
    .limit(1);

  return (
    <section className="space-y-6">
      <div className="mb-2">
        <Link
          href="/temuan"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Daftar Temuan
        </Link>
      </div>
      <PageHeader
        title={`Temuan #${finding.id.slice(0, 8)}`}
        eyebrow="Rincian diagnosa dan rekomendasi perbaikan pembukuan"
        actions={
          finding.status === "open" ? (
            <TemuanDetailActions
              findingId={finding.id}
              findingType={finding.type}
              status={finding.status}
              pendingDraftId={pendingDraft?.id}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                  finding.status === "resolved"
                    ? "border-debit/30 bg-debit/10 text-debit"
                    : "border-rule bg-canvas text-ink-soft",
                )}
              >
                {finding.status === "resolved" ? "✓ Terselesaikan" : "Diabaikan"}
              </span>
            </div>
          )
        }
      />
      <TemuanDetailClient finding={finding} />
    </section>
  );
}
