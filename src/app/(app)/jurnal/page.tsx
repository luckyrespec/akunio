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
import { Reveal } from "@/components/motion";
import { JournalTabs } from "@/components/journal/journal-tabs";

export default async function JurnalPage({
  searchParams,
}: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireContext();
  const sp = await searchParams;
  const tab = sp.tab === "draft" ? "draft" : "manual";

  return (
    <section className="space-y-6">
      <PageHeader
        title="Jurnal Umum"
        eyebrow="Catatan transaksi harian & draft AI"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <JournalTabs tab={tab} />
            <Link href="/jurnal/baru">
              <Button className="bg-terra text-white shadow-xs hover:bg-terra/90 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]">
                + Tulis Jurnal
              </Button>
            </Link>
          </div>
        }
      />

      {tab === "draft" ? <DraftTab orgId={ctx.orgId} /> : <ManualTab orgId={ctx.orgId} />}
    </section>
  );
}

async function ManualTab({ orgId }: { orgId: string }) {
  const entries = await db.transaction((tx) => listEntriesWithLines(tx, orgId, 100));

  return (
    <Reveal delay={0.08}>
    <div className="space-y-4">
      {/* Mobile Card View (< sm) */}
      <div className="space-y-3 sm:hidden">
        {entries.length === 0 && (
          <div className="rounded-xl border border-rule bg-paper p-8 text-center shadow-xs">
            <p className="font-display text-base font-medium text-ink">Belum ada jurnal</p>
            <p className="mt-1 text-xs text-ink-soft">Mulai dengan menekan “+ Tulis Jurnal” atau gunakan Asisten AI.</p>
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id} className="rounded-xl border border-rule bg-paper p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-rule/50 pb-2.5">
              <div>
                <span className="font-semibold text-sm text-ink">{e.number}</span>
                <span className="ml-2 text-xs text-ink-soft">{e.entryDate}</span>
              </div>
              {e.status === "POSTED" && !e.reversalOfId && (
                <ReverseButton entryId={e.id} />
              )}
            </div>
            {e.memo && (
              <p className="text-xs text-ink-soft italic">“{e.memo}”</p>
            )}
            <div className="space-y-2 pt-1">
              {e.lines.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="font-mono font-medium text-ink">{l.accountCode}</span>
                    <span className="mx-1 text-ink-soft">·</span>
                    <span className="text-ink truncate">{l.accountName}</span>
                  </div>
                  <div className="shrink-0 tnum font-medium">
                    {l.debitMinor > 0n ? (
                      <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                        D: {Money.fromMinor(l.debitMinor).formatIdr()}
                      </span>
                    ) : (
                      <span className="rounded bg-terra/10 px-2 py-0.5 text-terra font-semibold">
                        K: {Money.fromMinor(l.creditMinor).formatIdr()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop & Tablet Table View (>= sm) */}
      <div className="hidden sm:block">
        <GlowCard>
          <div className="overflow-x-auto rounded-xl border border-rule bg-paper shadow-xs">
            <table className="w-full tnum text-sm">
              <thead>
                <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3">Nomor</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Akun &amp; Keterangan</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Kredit</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <p className="font-display text-base font-medium text-ink">Belum ada jurnal</p>
                      <p className="mt-1 text-xs text-ink-soft">Mulai dengan menekan “+ Tulis Jurnal” atau gunakan Asisten AI.</p>
                    </td>
                  </tr>
                )}
                {entries.map((e) => (
                  <Fragment key={e.id}>
                    {e.lines.map((l, i) => (
                      <tr key={l.id} className="transition-colors hover:bg-canvas/30">
                        <td className="px-4 py-3 align-top">
                          {i === 0 ? <span className="font-semibold text-ink">{e.number}</span> : ""}
                        </td>
                        <td className="px-4 py-3 align-top text-ink-soft">{i === 0 ? e.entryDate : ""}</td>
                        <td className="px-4 py-3 pl-8">
                          <span className="font-mono text-xs font-medium text-ink">{l.accountCode}</span> <span className="text-ink-soft">·</span> {l.accountName}
                          <span className="ml-2 text-xs text-ink-soft">({l.memo ?? e.memo})</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.debitMinor > 0n ? Money.fromMinor(l.debitMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {l.creditMinor > 0n ? Money.fromMinor(l.creditMinor).formatIdr() : <span className="text-ink-soft/30">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
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
      </div>

      {entries.some((e) => e.reversalOfId) && (
        <p className="text-xs text-ink-soft">
          Entri dengan balikan terhubung otomatis; koreksi tidak pernah menghapus riwayat audit.
        </p>
      )}
    </div>
    </Reveal>
  );
}

async function DraftTab({ orgId }: { orgId: string }) {
  const drafts = await db.transaction((tx) => getDraftsWithNumbers(tx, orgId));
  const now = new Date();

  return (
    <Reveal delay={0.08}>
    <div className="space-y-4">
      {/* Mobile Card View (< sm) */}
      <div className="space-y-3 sm:hidden">
        {drafts.length === 0 && (
          <div className="rounded-xl border border-rule bg-paper p-8 text-center text-ink-soft shadow-xs">
            <p className="font-display text-base font-medium text-ink">Belum ada draft AI</p>
            <p className="mt-1 text-xs text-ink-soft">Unggah dokumen atau minta Asisten AI membuat draft jurnal dari obrolan.</p>
          </div>
        )}
        {drafts.map((d) => {
          const status = effectiveStatus(d, now);
          const created = d.createdAt.toISOString().slice(0, 10);
          const memo = (d.draft as { memo?: string }).memo ?? "";
          return (
            <div key={d.id} className="rounded-xl border border-rule bg-paper p-4 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-soft">{created}</span>
                <span className="text-xs font-medium text-ink">
                  Keyakinan: {Math.round(((d.draft as { overallConfidence?: number }).overallConfidence ?? 0) * 100)}%
                </span>
              </div>
              <div>
                <span className="text-xs font-semibold text-ink">{d.kind === "DOCUMENT" ? "Dokumen" : "Teks"}</span>
                {memo && <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">{memo}</p>}
              </div>
              <div className="pt-2 border-t border-rule/50 flex items-center justify-between">
                {status === "PENDING" && (
                  <Link href={`/jurnal/ai/${d.id}`} className="w-full">
                    <Button size="sm" variant="outline" className="w-full border-terra/40 text-terra bg-terra/5 hover:bg-terra/10 justify-center">
                      Review &amp; Posting Draft →
                    </Button>
                  </Link>
                )}
                {status === "ACCEPTED" && (
                  <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Diposting {d.entryNumber ?? ""}
                  </Badge>
                )}
                {status === "REJECTED" && (
                  <Badge variant="outline" className="text-ink-soft">
                    Ditolak
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop & Tablet Table View (>= sm) */}
      <div className="hidden sm:block">
        <GlowCard>
          <div className="overflow-x-auto rounded-xl border border-rule bg-paper shadow-xs">
            <table className="w-full tnum text-sm">
              <thead>
                <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Sumber &amp; Memo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Keyakinan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {drafts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-16 text-center text-ink-soft">
                      <p className="font-display text-base font-medium text-ink">Belum ada draft AI</p>
                      <p className="mt-1 text-xs text-ink-soft">Unggah dokumen atau minta Asisten AI membuat draft jurnal dari obrolan.</p>
                    </td>
                  </tr>
                )}
                {drafts.map((d) => {
                  const status = effectiveStatus(d, now);
                  const created = d.createdAt.toISOString().slice(0, 10);
                  const memo = (d.draft as { memo?: string }).memo ?? "";
                  return (
                    <tr key={d.id} className="transition-colors hover:bg-canvas/30">
                      <td className="px-4 py-3 text-ink-soft">{created}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{d.kind === "DOCUMENT" ? "Dokumen" : "Teks"}</span>
                        <span className="ml-2 text-xs text-ink-soft">
                          {memo.length > 50 ? `${memo.slice(0, 50)}…` : memo}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {status === "PENDING" && (
                          <Link href={`/jurnal/ai/${d.id}`} className="inline-flex items-center">
                            <Badge variant="outline" className="border-terra/40 text-terra bg-terra/5 hover:bg-terra/10 cursor-pointer">
                              Menunggu review →
                            </Badge>
                          </Link>
                        )}
                        {status === "ACCEPTED" && (
                          <Badge className="border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Diposting {d.entryNumber ?? ""}
                          </Badge>
                        )}
                        {status === "REJECTED" && (
                          <Badge variant="outline" className="text-ink-soft">
                            Ditolak
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {Math.round(((d.draft as { overallConfidence?: number }).overallConfidence ?? 0) * 100)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlowCard>
      </div>
    </div>
    </Reveal>
  );
}
