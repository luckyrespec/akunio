import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { listFindings } from "@/server/db/repos/findings.repo";
import { countEntries } from "@/server/db/repos/journals.repo";
import { PageHeader } from "@/components/page-header";
import { TemuanClient } from "./temuan-client";
import type { FindingView } from "./finding-meta";
import { cn } from "@/lib/utils";

export default async function TemuanPage() {
  const ctx = await requireContext();
  const [allFindings, totalJournals] = await withOrg(ctx.orgId, (tx) =>
    Promise.all([
      listFindings(tx, ctx.orgId),
      countEntries(tx, ctx.orgId),
    ]),
  );

  const openFindings = allFindings.filter((f) => f.status === "open");
  const resolvedCount = allFindings.filter((f) => f.status === "resolved").length;
  const dismissedCount = allFindings.filter((f) => f.status === "dismissed").length;

  const serialized: FindingView[] = allFindings.map((f) => ({
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
        eyebrow="Pemeriksaan integritas pembukuan, deteksi anomali saldo, dan usulan koreksi jurnal otomatis."
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-canvas px-3 py-1 text-xs text-ink-soft">
              <span className={cn("size-2 rounded-full", openFindings.length > 0 ? "bg-terra" : "bg-debit")} />
              <strong className="text-ink font-semibold">{openFindings.length}</strong> Perlu Tindakan
            </span>
            {resolvedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-debit/20 bg-debit/10 px-3 py-1 text-xs text-debit font-medium">
                ✓ {resolvedCount} Terselesaikan
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

