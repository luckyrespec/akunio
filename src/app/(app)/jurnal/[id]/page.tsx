import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Paperclip,
  StickyNote,
  Undo2,
} from "lucide-react";
import { requireContext } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import {
  findReversalEntries,
  getPostedEntry,
  listEntryDocuments,
} from "@/server/db/repos/journals.repo";
import { Money } from "@/core/money/money";
import { PageHeader } from "@/components/page-header";
import { JournalAttachmentUploader } from "@/components/journal/journal-attachment-uploader";
import { DetailActions } from "./detail-actions";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function DocIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="size-3.5" />;
  if (mime.includes("csv") || mime.includes("excel") || mime.includes("spreadsheet")) {
    return <FileSpreadsheet className="size-3.5" />;
  }
  return <FileText className="size-3.5" />;
}

export default async function JurnalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireContext();
  const { id } = await params;

  let entry;
  try {
    entry = await withOrg(ctx.orgId, (tx) => getPostedEntry(tx, ctx.orgId, id));
  } catch {
    entry = null;
  }
  if (!entry) notFound();

  const [docs, reversals] = await withOrg(ctx.orgId, async (tx) =>
    Promise.all([
      listEntryDocuments(tx, ctx.orgId, entry.id),
      findReversalEntries(tx, ctx.orgId, entry.id),
    ]),
  );

  let originalNumber: string | null = null;
  if (entry.reversalOfId) {
    try {
      const orig = await withOrg(ctx.orgId, (tx) => getPostedEntry(tx, ctx.orgId, entry.reversalOfId!));
      originalNumber = orig?.number ?? null;
    } catch {
      originalNumber = null;
    }
  }

  const totalD = entry.lines.reduce((s, l) => s + l.debitMinor, 0n);
  const totalK = entry.lines.reduce((s, l) => s + l.creditMinor, 0n);
  const balanced = totalD === totalK;
  const statusLabel = entry.reversalOfId ? "Balikan" : "Diposting";

  return (
    <section className="w-full space-y-6">
      <div className="mb-2">
        <Link
          href="/jurnal"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft hover:text-terra transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke Jurnal Umum
        </Link>
      </div>

      <PageHeader
        title={entry.number}
        eyebrow={`${entry.entryDate} · ${entry.reversalOfId ? "Jurnal Balikan" : "Diposting"}`}
        actions={
          <DetailActions
            entryId={entry.id}
            entryNumber={entry.number}
            canReverse={entry.status === "POSTED" && !entry.reversalOfId}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2">
              <StickyNote className="size-4 text-ink-soft" />
              <h2 className="font-display text-sm font-semibold text-ink">Keterangan</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft whitespace-pre-wrap">
              {entry.memo}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-rule/60 pt-4 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-ink-soft">Tanggal</dt>
                <dd className="tnum mt-0.5 font-medium text-ink">{entry.entryDate}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Status</dt>
                <dd className="mt-0.5 font-medium text-ink">{statusLabel}</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Jumlah Baris</dt>
                <dd className="tnum mt-0.5 font-medium text-ink">{entry.lines.length} baris</dd>
              </div>
              <div>
                <dt className="text-ink-soft">Keseimbangan</dt>
                <dd className="mt-0.5 inline-flex items-center gap-1 font-medium text-ink">
                  {balanced ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-debit" />
                      Seimbang
                    </>
                  ) : (
                    "Tidak seimbang"
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-xs">
            <table className="w-full tnum text-sm">
              <thead>
                <tr className="border-b border-rule bg-canvas/70 text-left text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  <th className="px-4 py-3">Akun</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {entry.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-ink">{l.accountCode}</span>
                      <span className="mx-1 text-ink-soft">·</span> {l.accountName}
                      {(l.memo ?? entry.memo) && (
                        <span className="ml-2 text-xs text-ink-soft">({l.memo ?? entry.memo})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.debitMinor > 0n ? (
                        Money.fromMinor(l.debitMinor).formatIdr()
                      ) : (
                        <span className="text-ink-soft/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.creditMinor > 0n ? (
                        Money.fromMinor(l.creditMinor).formatIdr()
                      ) : (
                        <span className="text-ink-soft/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="rule-double">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">
                    {Money.fromMinor(totalD).formatIdr()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">
                    {Money.fromMinor(totalK).formatIdr()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {(entry.reversalOfId || reversals.length > 0) && (
            <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs text-xs">
              <div className="flex items-center gap-2">
                <Undo2 className="size-4 text-ink-soft" />
                <h2 className="font-display text-sm font-semibold text-ink">Keterkaitan Balikan</h2>
              </div>
              <ul className="mt-2 space-y-1.5 text-ink-soft">
                {entry.reversalOfId && (
                  <li>
                    Jurnal ini membalikkan{" "}
                    {originalNumber ? (
                      <Link
                        href={`/jurnal/${entry.reversalOfId}`}
                        className="tnum font-semibold text-terra hover:underline"
                      >
                        {originalNumber}
                      </Link>
                    ) : (
                      "entri asal"
                    )}
                    .
                  </li>
                )}
                {reversals.map((r) => (
                  <li key={r.id}>
                    Dibalikkan oleh{" "}
                    <Link
                      href={`/jurnal/${r.id}`}
                      className="tnum font-semibold text-terra hover:underline"
                    >
                      {r.number}
                    </Link>{" "}
                    <span className="tnum">({r.entryDate})</span>.
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 xl:col-span-4">
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-3 lg:sticky lg:top-6">
            <div className="flex items-center gap-2">
              <Paperclip className="size-4 text-ink-soft" />
              <h2 className="font-display text-sm font-semibold text-ink">
                Lampiran {docs.length > 0 && <span className="text-ink-soft">({docs.length})</span>}
              </h2>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-soft">
              Baris jurnal terkunci. Lampiran bukti tetap bisa ditambahkan kapan saja.
            </p>
            {docs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-rule bg-canvas/40 p-4 text-center">
                <Paperclip className="mx-auto size-5 text-ink-soft/50" />
                <p className="mt-1.5 text-xs text-ink-soft">
                  Belum ada lampiran. Unggah nota, berita acara, atau bukti pendukung.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {docs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-canvas/40 p-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-terra/10 text-terra">
                        <DocIcon mime={d.mime} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink">
                          {d.fileName ?? "dokumen"}
                        </p>
                        <p className="text-[11px] text-ink-soft">
                          {formatBytes(d.sizeBytes)} · {d.mime}
                        </p>
                      </div>
                    </div>
                    <a
                      href={`/api/documents/${d.id}/download${d.fileName ? `?name=${encodeURIComponent(d.fileName)}` : ""}`}
                      className="flex shrink-0 items-center gap-1 rounded-lg border border-rule bg-paper px-2 py-1.5 text-[11px] font-medium text-ink hover:bg-canvas"
                    >
                      <Download className="size-3.5" /> Unduh
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <JournalAttachmentUploader entryId={entry.id} />
          </div>
        </div>
      </div>
    </section>
  );
}
