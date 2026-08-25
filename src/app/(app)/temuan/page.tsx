import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listFindings } from "@/server/db/repos/findings.repo";
import { Reveal } from "@/components/motion";
import { TemuanClient } from "./temuan-client";

export default async function TemuanPage() {
  const ctx = await requireContext();
  const findings = await listFindings(db, ctx.orgId, "open");
  return (
    <section>
      <Reveal>
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-display text-[1.75rem] font-semibold tracking-tight">Temuan</h1>
            <p className="mt-1 text-xs uppercase tracking-widest text-ink-soft">Doctor — temuan berperingkat, bisa buat draft koreksi</p>
          </div>
          <span className="hidden rounded-full border border-rule bg-canvas px-3 py-1 text-xs text-ink-soft sm:inline">{findings.length} open</span>
        </div>
      </Reveal>
      <div className="mt-6">
        <TemuanClient findings={findings as never} />
      </div>
    </section>
  );
}
