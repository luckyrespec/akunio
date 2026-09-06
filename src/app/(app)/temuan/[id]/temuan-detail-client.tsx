"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Upload, FileText, BookOpen } from "lucide-react";
import {
  IconArrowRight,
  IconCircleCheck,
  IconClock,
  IconFileWarning,
  IconInfo,
  IconReceipt,
  IconSparkles,
} from "@/components/icons";
import { Money } from "@/core/money/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SakRuleSheet } from "@/components/sak/sak-rule-sheet";
import { Reveal } from "@/components/motion";
import { cn } from "@/lib/utils";
import {
  evidenceKeyLabel,
  evidenceValueText,
  formatFindingDate,
  severityMeta,
  typeMetadata,
  type FindingView,
} from "../finding-meta";
import { getFindingRelatedAction, uploadFindingReceiptAction } from "../actions";
import { getSakCitationDetailAction } from "@/server/actions/ai.actions";

type RelatedItem = Record<string, unknown>;

interface JournalDocView {
  id: string;
  fileName: string | null;
  mime: string;
  sizeBytes: number;
}

interface JournalLineView {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debitMinor: string;
  creditMinor: string;
  memo: string | null;
}

interface JournalView {
  id: string;
  number: string;
  entryDate: string;
  memo: string;
  status: string;
  reversalOfId: string | null;
  lines: JournalLineView[];
  docs: JournalDocView[];
}

interface LedgerRowView {
  number: string;
  entryDate: string;
  memo: string;
  debitMinor: string;
  creditMinor: string;
  balanceMinor: string;
}

interface AccountView {
  id: string;
  code: string;
  name: string;
  type: string;
  normal: string;
  debitMinor: string;
  creditMinor: string;
  balanceMinor: string;
  transactionCount: number;
  recentRows: LedgerRowView[];
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "resolved":
      return { label: "Selesai", className: "bg-debit/10 text-debit border-debit/30" };
    case "dismissed":
      return { label: "Diabaikan", className: "bg-canvas text-ink-soft border-rule" };
    default:
      return { label: "Terbuka", className: "bg-terra/10 text-terra border-terra/30" };
  }
}

function RelatedSkeletonTall() {
  return (
    <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-6 shadow-xs space-y-4" aria-hidden>
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-3/4" />
    </div>
  );
}

function JournalCard({ entry }: { entry: JournalView }) {
  const totalD = entry.lines.reduce((s, l) => s + BigInt(l.debitMinor), 0n);
  const totalK = entry.lines.reduce((s, l) => s + BigInt(l.creditMinor), 0n);
  const balanced = totalD === totalK;
  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-xs">
      {/* Kepala jurnal */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule/60 bg-canvas/40 px-4 sm:px-5 py-4">
        <div className="space-y-0.5">
          <p className="tnum text-base font-bold text-ink">{entry.number}</p>
          <p className="text-xs text-ink-soft tnum">{entry.entryDate}</p>
        </div>
        <div className="flex items-center gap-2">
          {entry.reversalOfId && (
            <span className="rounded-full border border-rule bg-paper px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
              Jurnal Balikan
            </span>
          )}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              entry.status === "POSTED"
                ? "bg-debit/10 text-debit border-debit/30"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
            )}
          >
            {entry.status === "POSTED" ? "Posted" : "Draf"}
          </span>
        </div>
      </div>

      {/* Keterangan */}
      <div className="px-4 sm:px-5 pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">Keterangan</h4>
        <p className="mt-1 text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {entry.memo || "(tanpa keterangan)"}
        </p>
      </div>

      {/* Rincian baris */}
      <div className="px-4 sm:px-5 pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">Rincian Baris</h4>
        <div className="mt-2 overflow-x-auto rounded-xl border border-rule">
          <table className="w-full tnum text-sm">
            <thead>
              <tr className="border-b border-rule bg-canvas/70 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                <th className="px-4 py-2.5">Akun</th>
                <th className="px-4 py-2.5 text-right">Debit</th>
                <th className="px-4 py-2.5 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/60">
              {entry.lines.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-medium text-ink">{l.accountCode}</span>
                    <span className="mx-1 text-ink-soft">·</span>
                    <span className="text-ink-soft">{l.accountName}</span>
                    {l.memo ? (
                      <span className="ml-2 text-[11px] text-ink-soft/70">({l.memo})</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {BigInt(l.debitMinor) > 0n ? (
                      Money.fromMinor(BigInt(l.debitMinor)).formatIdr()
                    ) : (
                      <span className="text-ink-soft/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {BigInt(l.creditMinor) > 0n ? (
                      Money.fromMinor(BigInt(l.creditMinor)).formatIdr()
                    ) : (
                      <span className="text-ink-soft/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-double border-rule bg-canvas/40 text-sm font-bold">
                <td className="px-4 py-2.5 text-ink">Total</td>
                <td className="px-4 py-2.5 text-right text-ink">{Money.fromMinor(totalD).formatIdr()}</td>
                <td className="px-4 py-2.5 text-right text-ink">{Money.fromMinor(totalK).formatIdr()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!balanced && (
          <p className="mt-2 text-xs font-semibold text-terra">
            Perhatian: total debit dan kredit tidak seimbang pada entri ini.
          </p>
        )}
      </div>

      {/* Lampiran */}
      <div className="px-4 sm:px-5 pt-4">
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
          Lampiran {entry.docs.length > 0 && <span className="tnum">({entry.docs.length})</span>}
        </h4>
        {entry.docs.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-soft">
            Belum ada lampiran — relevan bila temuan menyangkut bukti transaksi.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {entry.docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-canvas/40 px-3 py-2"
              >
                <span className="min-w-0 truncate text-xs font-medium text-ink">
                  {d.fileName ?? "dokumen"}
                </span>
                <span className="shrink-0 text-[11px] text-ink-soft">
                  {formatBytes(d.sizeBytes)} · {d.mime}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end px-4 sm:px-5 py-4">
        <Link
          href={entry.status === "POSTED" ? `/jurnal/${entry.id}` : "/jurnal"}
          className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
        >
          Buka di Jurnal
          <IconArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function AccountCard({ account }: { account: AccountView }) {
  const bal = BigInt(account.balanceMinor);
  return (
    <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-base font-bold text-ink">{account.code}</p>
          <p className="text-xs text-ink-soft">{account.name}</p>
        </div>
        <span className="rounded-full border border-rule bg-canvas px-2 py-0.5 text-[10px] font-semibold text-ink-soft">
          {account.type} · Normal {account.normal}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-rule bg-canvas/40 p-3 text-center">
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-ink-soft">Debit</dt>
          <dd className="tnum mt-0.5 text-xs font-semibold text-ink">
            {Money.fromMinor(BigInt(account.debitMinor)).formatIdr()}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-ink-soft">Kredit</dt>
          <dd className="tnum mt-0.5 text-xs font-semibold text-ink">
            {Money.fromMinor(BigInt(account.creditMinor)).formatIdr()}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wider text-ink-soft">Saldo</dt>
          <dd className={cn("tnum mt-0.5 text-xs font-semibold", bal < 0n ? "text-terra" : "text-ink")}>
            {Money.fromMinor(bal).formatIdr()}
          </dd>
        </div>
      </dl>
      <div>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
          Mutasi Terakhir
        </h4>
        {account.recentRows.length === 0 ? (
          <p className="mt-1.5 text-xs text-ink-soft">Belum ada mutasi posted pada akun ini.</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule/60 rounded-xl border border-rule">
            {account.recentRows.map((r) => (
              <li key={`${r.number}-${r.entryDate}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">{r.memo}</p>
                  <p className="tnum text-[11px] text-ink-soft">
                    {r.number} · {r.entryDate}
                  </p>
                </div>
                <div className="shrink-0 text-right tnum text-xs font-semibold">
                  {BigInt(r.debitMinor) > 0n ? (
                    <span className="text-debit">D {Money.fromMinor(BigInt(r.debitMinor)).formatIdr()}</span>
                  ) : (
                    <span className="text-credit">K {Money.fromMinor(BigInt(r.creditMinor)).formatIdr()}</span>
                  )}
                  <p className="text-[11px] font-normal text-ink-soft">
                    Saldo {Money.fromMinor(BigInt(r.balanceMinor)).formatIdr()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-soft tnum">{account.transactionCount} baris jurnal</span>
        <Link
          href={`/buku-besar/${account.id}`}
          className="inline-flex items-center gap-1 font-semibold text-terra hover:underline"
        >
          Buka Buku Besar
          <IconArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

function typeRecommendation(type: string, standard: string): string {
  switch (type) {
    case "missingReceipts":
      return `Jurnal transaksi ini sudah tercatat dengan benar dan seimbang di buku besar. Untuk memenuhi kepatuhan ${standard} tentang keandalan bukti transaksi, silakan lampirkan dokumen bukti fisik (faktur/kuitansi/struk) sah di bawah ini. Temuan otomatis terselesaikan setelah berkas berhasil diunggah.`;
    case "duplicates":
      return `Ditemukan jurnal yang memiliki memo, tanggal, nominal, dan alokasi akun yang kembar. Sesuai prinsip ${standard}, buat draf jurnal pembalik (reversal) untuk menganulir salah satu entri agar tidak terjadi pencatatan ganda.`;
    case "abnormalBalances":
      return `Saldo akun berada di sisi berlawanan aturan akuntansi wajar (saldo minus). Mengikuti prinsip ${standard}, buat draf jurnal reklasifikasi penyesuaian untuk menormalkan saldo akun.`;
    case "oddDates":
      return `Transaksi dibukukan di luar rentang tanggal periode fiskal aktif. Sesuai prinsip ${standard}, Anda dapat membuka periode pembukuan terkait di Pengaturan Periode, atau membuat draf penyesuaian pisah batas periode.`;
    case "ratioAnomalies":
      return `Terjadi fluktuasi mutasi debit/kredit yang melebihi batas deviasi historis. Periksa mutasi buku besar di panel samping. Jika mutasi wajar, Anda dapat mengonfirmasi dan menandai temuan ini selesai.`;
    default:
      return `Sistem merekomendasikan penyesuaian pembukuan mengikuti prinsip ${standard}.`;
  }
}

function MissingReceiptUploadCard({
  findingId,
  isResolved,
  onUploaded,
}: {
  findingId: string;
  isResolved: boolean;
  onUploaded?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await uploadFindingReceiptAction(findingId, formData);
      if (!res.ok) {
        setError(res.error || "Gagal mengunggah berkas.");
        return;
      }
      setSuccess(true);
      setUploadedName(file.name);
      if (onUploaded) onUploaded();
    } catch {
      setError("Terjadi kesalahan jaringan saat mengunggah.");
    } finally {
      setUploading(false);
    }
  }

  if (isResolved || success) {
    return (
      <div className="rounded-xl border border-debit/30 bg-debit/[0.08] p-4 text-xs space-y-2">
        <div className="flex items-center gap-2 font-semibold text-debit">
          <IconCircleCheck className="size-4 shrink-0" />
          <span>Dokumen Lampiran Sah Terverifikasi</span>
        </div>
        <p className="text-ink-soft leading-relaxed">
          {uploadedName ? (
            <>
              Berkas <strong className="font-mono text-ink">{uploadedName}</strong> telah berhasil dilampirkan ke entri jurnal ini. Temuan ini telah berstatus terselesaikan.
            </>
          ) : (
            "Dokumen bukti fisik telah berhasil dilampirkan ke entri jurnal ini. Temuan kepatuhan ini telah berstatus terselesaikan."
          )}
        </p>
      </div>
    );
  }

  return (
    <div id="upload-lampiran-section" className="rounded-xl border border-terra/30 bg-paper p-4 text-xs space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink flex items-center gap-1.5">
          <Upload className="size-4 text-terra" />
          Unggah Lampiran Bukti Transaksi
        </span>
        <span className="text-[10px] text-ink-soft bg-canvas px-2 py-0.5 rounded border border-rule">
          PDF / PNG / JPG maks 5MB
        </span>
      </div>
      <p className="text-ink-soft leading-relaxed">
        Jurnal telah dicatat dengan benar. Unggah berkas kuitansi, struk belanja, atau faktur sah untuk menautkannya langsung ke transaksi ini dan menyelesaikan temuan.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-center cursor-pointer transition-colors",
            file
              ? "border-terra bg-terra/5"
              : "border-rule bg-canvas/40 hover:bg-canvas/70 hover:border-terra/40",
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
          {file ? (
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-terra" />
              <div className="text-left">
                <p className="font-medium text-ink truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
                <p className="text-[10px] text-ink-soft">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="size-5 text-ink-soft" />
              <div>
                <span className="font-semibold text-terra hover:underline">Pilih berkas dokumen</span>
                <span className="text-ink-soft"> atau seret ke sini</span>
              </div>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-terra font-medium">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {file && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => setFile(null)}
              className="text-xs text-ink-soft cursor-pointer"
            >
              Batal
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={!file || uploading}
            className="bg-terra text-white hover:bg-terra/90 text-xs px-4 cursor-pointer"
          >
            {uploading ? "Mengunggah & Menautkan..." : "Unggah & Tandai Selesai"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function TemuanDetailClient({ finding }: { finding: FindingView }) {
  const [related, setRelated] = useState<RelatedItem[] | null>(null);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(true);

  // Drawer Sheet Rincian Aturan SAK
  const [citationSheetOpen, setCitationSheetOpen] = useState(false);
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationData, setCitationData] = useState<{
    bab: number;
    babTitle: string;
    description: string;
    sectionTitle: string;
    paragraphRange: string;
    content: string;
  } | null>(null);

  const meta = typeMetadata(finding.type);
  const sev = severityMeta(finding.severity);
  const st = statusBadge(finding.status);
  const ev = finding.evidence ?? {};
  const dateFormatted = formatFindingDate(finding.createdAt);

  const loadRelated = useCallback(async () => {
    setRelatedLoading(true);
    setRelatedError(null);
    try {
      const res = await getFindingRelatedAction(finding.id);
      if (res.ok) {
        setRelated(res.related as RelatedItem[]);
      } else {
        setRelatedError(res.error || "Gagal memuat data terkait.");
      }
    } catch {
      setRelatedError("Terjadi kesalahan jaringan saat memuat data terkait.");
    } finally {
      setRelatedLoading(false);
    }
  }, [finding.id]);

  useEffect(() => {
    void loadRelated();
  }, [loadRelated]);

  async function handleOpenCitation() {
    setCitationLoading(true);
    setCitationSheetOpen(true);
    try {
      const res = await getSakCitationDetailAction(String(meta.bab), meta.paragraph || "");
      if (res.ok && res.data) {
        setCitationData(res.data);
      } else {
        setCitationData({
          bab: meta.bab,
          babTitle: meta.babTitle,
          description: "Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah",
          sectionTitle: `Bab ${meta.bab}${meta.paragraph ? ` Paragraf ${meta.paragraph}` : ""}`,
          paragraphRange: meta.paragraph || "",
          content: res.error || "Rincian standar tidak dapat dimuat.",
        });
      }
    } catch {
      setCitationData({
        bab: meta.bab,
        babTitle: meta.babTitle,
        description: "Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah",
        sectionTitle: `Bab ${meta.bab}`,
        paragraphRange: meta.paragraph || "",
        content: "Terjadi kesalahan jaringan saat mengambil rincian aturan SAK.",
      });
    } finally {
      setCitationLoading(false);
    }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[5fr_7fr]">
      {/* Kolom pendukung: ringkasan temuan + aksi */}
      <div className="space-y-4 min-w-0">
        <Reveal>
          <div className="rounded-2xl border border-rule bg-paper p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  sev.badgeClass,
                )}
              >
                <span className={cn("size-1.5 rounded-full", sev.dot)} />
                {sev.label}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                  st.className,
                )}
              >
                {st.label}
              </span>
              <span className="text-xs text-ink-soft tnum">{dateFormatted}</span>
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-ink">{meta.label}</h2>
              <p className="mt-1 text-sm text-ink-soft leading-relaxed">{meta.desc}</p>
            </div>
            <div className="rounded-xl border border-rule bg-canvas/60 p-4 text-xs space-y-2.5">
              <div className="flex items-center justify-between border-b border-rule/60 pb-2">
                <span className="font-semibold text-ink uppercase tracking-wider text-[10px]">
                  Rincian Bukti & Parameter
                </span>
                <button
                  type="button"
                  onClick={handleOpenCitation}
                  title={`Buka rincian SAK EMKM ${meta.babTitle}`}
                  className="text-[10px] text-terra hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Ref: {meta.standard}</span>
                  <BookOpen className="size-3 text-terra" />
                </button>
              </div>
              <div className="space-y-1.5 pt-1">
                {Object.entries(ev).length === 0 && (
                  <p className="text-ink-soft">Tidak ada data rincian bukti tambahan.</p>
                )}
                {Object.entries(ev).map(([k, v]) => {
                  if (k === "entryId") return null;
                  const isAmount = k.toLowerCase().includes("minor") || k.toLowerCase().includes("tot") || k.toLowerCase() === "avg";
                  let valString: string;
                  try {
                    valString = evidenceValueText(v, isAmount);
                  } catch {
                    valString = String(v);
                  }
                  return (
                    <div key={k} className="flex items-center justify-between gap-4 py-0.5">
                      <span className="text-ink-soft">{evidenceKeyLabel(k)}</span>
                      <span className="font-mono text-xs font-semibold text-ink tnum text-right break-all">
                        {valString}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rekomendasi Solusi Khusus per Jenis Masalah */}
            <div className="rounded-xl border border-terra/30 bg-terra/[0.06] p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-terra font-semibold">
                <IconSparkles className="size-4" />
                <span>Rekomendasi Tindakan Perbaikan</span>
              </div>
              <p className="text-ink-soft leading-relaxed text-justify [text-justify:inter-word]">
                {typeRecommendation(finding.type, meta.standard)}
              </p>
            </div>

            {/* Form Penyelesaian Khusus: Unggah Bukti Transaksi */}
            {finding.type === "missingReceipts" && (
              <MissingReceiptUploadCard
                findingId={finding.id}
                isResolved={finding.status === "resolved"}
                onUploaded={() => {
                  void loadRelated();
                }}
              />
            )}

            {/* Opsi Khusus: Tanggal di Luar Periode */}
            {finding.type === "oddDates" && finding.status === "open" && (
              <div className="rounded-xl border border-rule bg-canvas/50 p-4 text-xs space-y-2">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  <IconClock className="size-4 text-terra" />
                  Opsi Pengaturan Periode Fiskal
                </span>
                <p className="text-ink-soft leading-relaxed">
                  Jika tanggal transaksi ini adalah periode pembukuan yang sah namun belum dibuka, Anda dapat membuka periode tersebut di menu pengaturan.
                </p>
                <div className="pt-1">
                  <Link
                    href="/pengaturan/periode"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-terra hover:underline"
                  >
                    Buka Pengaturan Periode
                    <IconArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            )}

            {finding.status === "open" ? null : (
              <p className="flex items-center gap-2 rounded-xl border border-debit/25 bg-debit/[0.07] px-3.5 py-2.5 text-xs text-ink">
                <IconCircleCheck className="size-4 text-debit shrink-0" />
                Temuan ini sudah {finding.status === "resolved" ? "diselesaikan" : "diabaikan"} — panel data terkait di samping tetap dapat diperiksa.
              </p>
            )}
          </div>
        </Reveal>
      </div>

      {/* Kolom utama: dokumen data terkait */}
      <div className="space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-bold text-ink">Data Terkait</h2>
          {!relatedLoading && !relatedError && related && related.length > 0 && (
            <span className="text-[11px] text-ink-soft tnum">{related.length} rujukan</span>
          )}
        </div>
        {relatedLoading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Memuat data terkait">
            <RelatedSkeletonTall />
          </div>
        ) : relatedError ? (
          <div className="rounded-2xl border border-terra/30 bg-terra/[0.06] p-5 text-center space-y-3">
            <IconFileWarning className="size-6 mx-auto text-terra" />
            <p className="text-xs text-ink">{relatedError}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadRelated()} className="text-xs">
              Coba Lagi
            </Button>
          </div>
        ) : !related || related.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rule bg-paper p-5 text-center space-y-2">
            <IconInfo className="size-6 mx-auto text-ink-soft" />
            <p className="text-xs font-semibold text-ink">Tidak ada rujukan data</p>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              Temuan agregat ini dihitung dari banyak jurnal sekaligus, jadi tidak menunjuk satu transaksi tertentu.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {related.map((r, i) => {
              const label = String(r.label ?? "Data terkait");
              if (r.kind === "journal" && r.found && r.entry) {
                return (
                  <section key={i} aria-label={label} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{label}</p>
                    <JournalCard entry={r.entry as unknown as JournalView} />
                  </section>
                );
              }
              if (r.kind === "account" && r.found && r.account) {
                return (
                  <section key={i} aria-label={label} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{label}</p>
                    <AccountCard account={r.account as unknown as AccountView} />
                  </section>
                );
              }
              return (
                <div key={i} className="rounded-2xl border border-dashed border-rule bg-paper p-4 text-xs text-ink-soft">
                  {label} tidak lagi tersedia (mungkin sudah dihapus).
                </div>
              );
            })}
          </div>
        )}
      </div>

      <SakRuleSheet
        open={citationSheetOpen}
        onOpenChange={setCitationSheetOpen}
        heading={`Bab ${citationData?.bab ?? meta.bab}: ${citationData?.babTitle ?? meta.babTitle}`}
        description={
          citationData?.description ||
          'Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah'
        }
        loading={citationLoading}
        blocks={
          citationData
            ? [
                {
                  title: citationData.sectionTitle || `Bab ${citationData.bab}`,
                  paragraphRange: citationData.paragraphRange,
                  content: citationData.content,
                },
              ]
            : []
        }
      />
    </div>
  );
}
