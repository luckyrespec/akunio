import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listFindings } from "@/server/db/repos/findings.repo";
import { countEntries } from "@/server/db/repos/journals.repo";
import { PageHeader } from "@/components/page-header";
import { TemuanClient } from "./temuan-client";
import type { FindingView } from "./finding-meta";

export default async function TemuanPage() {
  const ctx = await requireContext();
  const [openFindings, allFindings, totalJournals] = await Promise.all([
    listFindings(db, ctx.orgId, "open"),
    listFindings(db, ctx.orgId),
    countEntries(db, ctx.orgId),
  ]);

  const resolvedCount = allFindings.filter((f) => f.status === "resolved").length;
  const dismissedCount = allFindings.filter((f) => f.status === "dismissed").length;

  const serialized: FindingView[] = openFindings.map((f) => ({
    id: f.id,
    type: f.type,
    severity: f.severity as FindingView["severity"],
    status: f.status,
    evidence: (f.evidence as Record<string, unknown>) ?? null,
    createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
  }));

  return (
    <section>
      <PageHeader
        title="Diagnosa & Anomali"
        eyebrow="Doctor AI — Pemindaian integritas pembukuan, deteksi anomali kepatuhan, dan draf usulan koreksi otomatis"
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-canvas px-3 py-1 text-xs text-ink-soft">
              <span className="size-2 rounded-full bg-terra" />
              <strong className="text-ink font-semibold">{openFindings.length}</strong> Perlu Tindakan
            </span>
            {resolvedCount > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-debit/20 bg-debit/10 px-3 py-1 text-xs text-debit font-medium">
                {resolvedCount} Terselesaikan
              </span>
            )}
          </div>
        }
      />
      <div className="mt-4">
        <TemuanClient
          initialFindings={serialized}
          stats={{
            totalScanned: totalJournals,
            openCount: openFindings.length,
            resolvedCount,
            dismissedCount,
          }}
        />
      </div>
    </section>
  );
}

