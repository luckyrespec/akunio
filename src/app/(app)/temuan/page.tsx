import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listFindings } from "@/server/db/repos/findings.repo";
export default async function TemuanPage() {
  const ctx = await requireContext();
  const findings = await listFindings(db, ctx.orgId);
  return (
    <section>
      <h1 className="font-display text-2xl">Temuan</h1>
      <p className="mt-1 text-sm text-ink-soft">Temuan dari Doctor — berperingkat severity, bisa buat draft koreksi.</p>
      <div className="mt-6 space-y-2">
        {findings.length === 0 && <p className="text-sm text-ink-soft">Tidak ada temuan — pembukuan rapi.</p>}
        {findings.map(f => (
          <div key={f.id} className="flex items-center justify-between rounded-lg border border-rule bg-paper p-4">
            <div>
              <p className="font-medium">{f.type} — {f.severity}</p>
              <p className="text-xs text-ink-soft">{JSON.stringify(f.evidence)}</p>
            </div>
            <span className={`rounded-full px-2 py-1 text-xs ${f.severity==="HIGH" ? "bg-terra/10 text-terra border border-terra" : f.severity==="MEDIUM" ? "bg-amber-50 text-amber-700" : "text-ink-soft"}`}>{f.severity}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
