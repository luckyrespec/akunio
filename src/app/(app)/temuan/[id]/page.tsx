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
        eyebrow="Detail diagnosa Doctor AI"
        actions={<TemuanDetailActions findingId={finding.id} status={finding.status} />}
      />
      <TemuanDetailClient finding={finding} />
    </section>
  );
}
