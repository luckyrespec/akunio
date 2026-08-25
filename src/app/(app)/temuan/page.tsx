import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listFindings } from "@/server/db/repos/findings.repo";
import { PageHeader } from "@/components/page-header";
import { TemuanClient } from "./temuan-client";

export default async function TemuanPage() {
  const ctx = await requireContext();
  const findings = await listFindings(db, ctx.orgId, "open");
  return (
    <section>
      <PageHeader
        title="Temuan"
        eyebrow="Doctor — temuan berperingkat, bisa buat draft koreksi"
        actions={
          <span className="hidden rounded-full border border-rule bg-canvas px-3 py-1 text-xs text-ink-soft sm:inline">{findings.length} open</span>
        }
      />
      <div className="mt-6">
        <TemuanClient findings={findings as never} />
      </div>
    </section>
  );
}
