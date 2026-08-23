import { eq } from "drizzle-orm";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { memberships } from "@/server/db/schema/org";
import { user } from "@/server/db/schema/auth";
import { listAccounts } from "@/server/db/repos/accounts.repo";
import { listPeriods } from "@/server/db/repos/periods.repo";
import { ArchiveToggle } from "@/components/settings/archive-toggle";
import { PeriodActions } from "@/components/settings/period-actions";
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
    <section>
      <h1 className="font-display text-2xl">Pengaturan</h1>

      <h2 className="mt-8 font-display text-lg">Bagan Akun</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Akun yang diarsipkan tidak dapat dipakai untuk transaksi baru.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-rule bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Kode</th>
              <th className="px-4 py-3 font-medium">Nama</th>
              <th className="px-4 py-3 font-medium">Tipe</th>
              <th className="px-4 py-3 font-medium">Normal</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.id} className="border-b border-rule/60 last:border-0">
                <td className="px-4 py-2 tnum">{a.code}</td>
                <td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2">{TYPE_LABEL[a.type]}</td>
                <td className="px-4 py-2 tnum">{a.normal}</td>
                <td className="px-4 py-2">
                  {a.archivedAt ? <Badge variant="outline">Arsip</Badge> : <span className="text-xs text-ink-soft">Aktif</span>}
                </td>
                <td className="px-4 py-2">
                  <ArchiveToggle accountId={a.id} archived={Boolean(a.archivedAt)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-lg">Periode Akuntansi</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Periode tutup buku menolak pencatatan transaksi baru.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-rule bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Periode</th>
              <th className="px-4 py-3 font-medium">Tanggal</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data.periods.map((p) => (
              <tr key={p.id} className="border-b border-rule/60 last:border-0">
                <td className="px-4 py-2 tnum">{p.name}</td>
                <td className="px-4 py-2 tnum">{p.startsOn} – {p.endsOn}</td>
                <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-2">
                  {ctx.role !== "VIEWER" && (
                    <PeriodActions periodId={p.id} status={p.status} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-display text-lg">Anggota</h2>
      <div className="mt-4 max-w-xl divide-y divide-rule rounded-lg border border-rule bg-paper">
        {data.members.map((m) => (
          <div key={m.email} className="flex items-center justify-between px-5 py-3 text-sm">
            <span>{m.email}</span>
            <Badge variant="secondary">{m.role}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
