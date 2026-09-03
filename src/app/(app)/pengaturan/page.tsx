import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { memberships, organizations } from "@/server/db/schema/org";
import { user } from "@/server/db/schema/auth";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { ArchiveToggle } from "@/components/settings/archive-toggle";
import { PeriodActions } from "@/components/settings/period-actions";
import { HitlPolicySelector } from "@/components/settings/hitl-policy-selector";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

const TYPE_LABEL = {
  ASET: "Aset",
  LIABILITAS: "Liabilitas",
  EKUITAS: "Ekuitas",
  PENDAPATAN: "Pendapatan",
  BEBAN: "Beban",
} as const;

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={status === "OPEN" ? "default" : status === "CLOSED" ? "secondary" : "outline"}
    >
      {status}
    </Badge>
  );
}

export default async function PengaturanPage() {
  const ctx = await requireContext();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  const orgSettings = (org?.settings ?? {}) as { aiHitlPolicy?: "smart" | "strict" | "autonomous" };

  const data = await db.transaction(async (tx) => {
    const accounts = await listAccounts(tx, ctx.orgId);
    const periods = await listPeriods(tx, ctx.orgId);
    const members = await tx
      .select({ email: user.email, role: memberships.role })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(eq(memberships.orgId, ctx.orgId))
      .orderBy(memberships.createdAt);
    return { accounts, periods, members };
  });

  return (
    <section className="space-y-8">
      <PageHeader title="Pengaturan" eyebrow="Bagan akun, periode akuntansi, kebijakan AI & anggota tim" />

      <HitlPolicySelector currentPolicy={orgSettings.aiHitlPolicy ?? "smart"} />

      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Bagan Akun (Chart of Accounts)</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Akun yang diarsipkan tidak dapat dipilih untuk pembuatan jurnal transaksi baru.
          </p>
        </div>

        {/* Mobile Cards (< sm) */}
        <div className="space-y-2.5 sm:hidden">
          {data.accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-rule bg-paper p-3.5 shadow-xs flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-ink">{a.code}</span>
                  <span className="text-[10px] uppercase text-ink-soft">({TYPE_LABEL[a.type]})</span>
                </div>
                <p className="font-medium text-sm text-ink truncate mt-0.5">{a.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-ink-soft">Normal: {a.normal}</span>
                  {a.archivedAt ? (
                    <Badge variant="outline" className="border-rule text-ink-soft text-[10px] px-1.5 py-0">Diarsipkan</Badge>
                  ) : (
                    <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                      Aktif
                    </Badge>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <ArchiveToggle accountId={a.id} archived={Boolean(a.archivedAt)} />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= sm) */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-rule bg-paper shadow-xs">
          <table className="w-full tnum text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Akun</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Saldo Normal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {data.accounts.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-canvas/30">
                  <td className="px-4 py-3 font-mono font-medium text-ink">{a.code}</td>
                  <td className="px-4 py-3 font-medium text-ink">{a.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{TYPE_LABEL[a.type]}</td>
                  <td className="px-4 py-3 text-ink-soft">{a.normal}</td>
                  <td className="px-4 py-3">
                    {a.archivedAt ? (
                      <Badge variant="outline" className="border-rule text-ink-soft">Diarsipkan</Badge>
                    ) : (
                      <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Aktif
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ArchiveToggle accountId={a.id} archived={Boolean(a.archivedAt)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Periode Akuntansi</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Periode yang ditutup (Closed) menolak pencatatan transaksi jurnal baru.
          </p>
        </div>

        {/* Mobile Cards (< sm) */}
        <div className="space-y-2.5 sm:hidden">
          {data.periods.map((p) => (
            <div key={p.id} className="rounded-xl border border-rule bg-paper p-3.5 shadow-xs flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm text-ink">{p.name}</p>
                <p className="text-xs text-ink-soft mt-0.5">{p.startsOn} – {p.endsOn}</p>
                <div className="mt-1.5">
                  <StatusBadge status={p.status} />
                </div>
              </div>
              <div className="shrink-0">
                {ctx.role !== "VIEWER" && (
                  <PeriodActions periodId={p.id} status={p.status} />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table (>= sm) */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-rule bg-paper shadow-xs">
          <table className="w-full tnum text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-3">Nama Periode</th>
                <th className="px-4 py-3">Rentang Tanggal</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {data.periods.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-canvas/30">
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{p.startsOn} – {p.endsOn}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 text-center">
                    {ctx.role !== "VIEWER" && (
                      <PeriodActions periodId={p.id} status={p.status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Anggota Organisasi</h2>
          <p className="mt-1 text-xs text-ink-soft">Daftar pengguna terdaftar pada ruang kerja ini.</p>
        </div>
        <div className="max-w-xl divide-y divide-rule/60 overflow-hidden rounded-xl border border-rule bg-paper shadow-xs">
          {data.members.map((m) => (
            <div key={m.email} className="flex items-center justify-between px-5 py-3.5 text-sm">
              <span className="font-medium text-ink">{m.email}</span>
              <Badge variant="secondary" className="bg-canvas border border-rule text-ink-soft">
                {m.role}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
