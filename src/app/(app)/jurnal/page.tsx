import { Fragment } from "react";
import Link from "next/link";
import { requireContext } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listEntriesWithLines } from "@/server/db/repos/journals.repo";
import { getDraftsWithNumbers, effectiveStatus } from "@/server/db/repos/drafts.repo";
import { Money } from "@/core/money/money";
import { ReverseButton } from "@/components/journal/reverse-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { GlowCard } from "@/components/aceternity/glow-card";

export default async function JurnalPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const tab = sp.tab === "draft" ? "draft" : "manual";

  return (
    <section>
      <PageHeader
        title="Jurnal Umum"
        eyebrow="Catatan transaksi harian"
        actions={
          <>
            <div className="flex gap-1 rounded-full border border-rule bg-paper p-1">
              <Link href="/jurnal"
                    className={tab === "manual"
                      ? "rounded-full bg-canvas px-3 py-1 text-xs font-medium text-terra shadow-sm"
                      : "rounded-full px-3 py-1 text-xs text-ink-soft hover:bg-canvas"}>
                Manual
              </Link>
              <Link href="/jurnal?tab=draft"
                    className={tab === "draft"
                      ? "rounded-full bg-canvas px-3 py-1 text-xs font-medium text-terra shadow-sm"
                      : "rounded-full px-3 py-1 text-xs text-ink-soft hover:bg-canvas"}>
                Draft AI
              </Link>
            </div>
            <Link href="/jurnal/baru">
              <Button className="bg-terra shadow-sm hover:bg-terra/90">+ Tulis Jurnal</Button>
            </Link>
          </>
        }
      />

      {tab === "draft" ? <DraftTab orgId={ctx.orgId} /> : <ManualTab orgId={ctx.orgId} />}
    </section>
  );
}

async function ManualTab({ orgId }: { orgId: string }) {
  const entries = await db.transaction((tx) => listEntriesWithLines(tx, orgId, 100));

  return (
    <>
      <GlowCard className="mt-6">
        <div className="overflow-x-auto p-1">
          <table className="data-table tnum text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas/60 text-left">
                <th className="px-4 py-3">Nomor</th>
                <th className="px-4 py-3">Tanggal</th>
                <th className="px-4 py-3">Akun &amp; Keterangan</th>
                <th className="px-4 py-3 text-right">Debit</th>
                <th className="px-4 py-3 text-right">Kredit</th>
                <th className="px-4 py-3">Aksi</th>
              </tr>
            </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="font-display text-sm">Belum ada jurnal</p>
                  <p className="mt-1 text-xs text-ink-soft">Mulai dengan menekan “+ Tulis Jurnal” atau minta Asisten AI.</p>
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <Fragment key={e.id}>
                {e.lines.map((l, i) => (
                  <tr key={l.id} className="border-b border-rule/60 last:border-0 transition-colors hover:bg-canvas/60">
                    <td className="px-4 py-2.5 align-top">
                      {i === 0 ? <span className="font-medium">{e.number}</span> : ""}
                    </td>
                    <td className="px-4 py-2.5 align-top text-ink-soft">{i === 0 ? e.entryDate : ""}</td>
                    <td className="px-4 py-2.5 pl-8">
                      <span className="font-mono text-xs">{l.accountCode}</span> <span className="text-ink-soft">·</span> {l.accountName}
                      <span className="ml-2 text-xs text-ink-soft">{l.memo ?? e.memo}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {l.debitMinor > 0n ? Money.fromMinor(l.debitMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {l.creditMinor > 0n ? Money.fromMinor(l.creditMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {i === 0 && e.status === "POSTED" && !e.reversalOfId && (
                        <ReverseButton entryId={e.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </GlowCard>

      {entries.some((e) => e.reversalOfId) && (
        <p className="mt-3 text-xs text-ink-soft">
          Entri dengan balikan terhubung otomatis; koreksi tidak pernah menghapus riwayat.
        </p>
      )}
    </>
  );
}

async function DraftTab({ orgId }: { orgId: string }) {
  const drafts = await db.transaction((tx) => getDraftsWithNumbers(tx, orgId));
  const now = new Date();

  return (
    <GlowCard className="mt-6">
      <div className="overflow-x-auto p-1">
        <table className="data-table tnum text-sm">
          <thead>
            <tr className="border-b border-rule text-left">
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Sumber</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Keyakinan</th>
            </tr>
          </thead>
        <tbody>
          {drafts.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-12 text-center text-ink-soft">
                Belum ada draft AI. Buat dari menu Asisten.
              </td>
            </tr>
          )}
          {drafts.map((d) => {
            const status = effectiveStatus(d, now);
            const created = d.createdAt.toISOString().slice(0, 10);
            const memo = (d.draft as { memo?: string }).memo ?? "";
            return (
              <tr key={d.id} className="border-b border-rule/60 last:border-0">
                <td className="px-4 py-2">{created}</td>
                <td className="px-4 py-2">
                  {d.kind === "DOCUMENT" ? "Dokumen" : "Teks"}
                  <span className="ml-2 text-xs text-ink-soft">
                    {memo.length > 40 ? `${memo.slice(0, 40)}…` : memo}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {status === "PENDING" && (
                    <Link href={`/jurnal/ai/${d.id}`}>
                      <Badge variant="outline">Menunggu review</Badge>
                    </Link>
                  )}
                  {status === "ACCEPTED" && (
                    <Badge className="bg-canvas text-debit">
                      Diposting {d.entryNumber ?? ""}
                    </Badge>
                  )}
                  {status === "REJECTED" && <Badge variant="outline">Ditolak</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  {Math.round(((d.draft as { overallConfidence?: number }).overallConfidence ?? 0) * 100)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </GlowCard>
  );
}
