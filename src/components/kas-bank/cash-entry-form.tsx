"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/page-header";
import { AccountSelect } from "@/components/account-select";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  FileText,
  Loader2,
  Paperclip,
  UploadCloud,
  X,
} from "lucide-react";
import { createCashEntryAction } from "@/server/actions/cash-bank.actions";
import { uploadDocumentAction } from "@/server/actions/upload.actions";
import { InsightSheet } from "./insight-sheet";
import type { CashKind } from "@/server/db/schema/cash-bank";
import type { DailyInsight } from "@/core/kas-bank/insights";

export interface AccountOption {
  id: string;
  code: string;
  name: string;
}

export interface QuickPick {
  accountId: string;
  label: string;
}

interface CashEntryFormProps {
  kind: CashKind;
  title: string;
  detailBasePath: string;
  cashAccounts: AccountOption[];
  counterAccounts: AccountOption[];
  contacts: Array<{ id: string; name: string }>;
  quickPicks: QuickPick[];
  insight: DailyInsight;
  transferMode?: boolean;
}

const EYEBROW: Record<CashKind, string> = {
  BAYAR:
    "Pengeluaran kas dan bank — posting mengunci jurnal, draft bisa dicek dulu.",
  TERIMA:
    "Pemasukan kas dan bank — posting mengunci jurnal, draft bisa dicek dulu.",
  TRANSFER:
    "Pindah dana antar kas dan bank — posting mengunci jurnal, draft bisa dicek dulu.",
};

const COUNTER_HINT: Record<CashKind, string> = {
  BAYAR: "Beban atau tujuan pengeluaran — mis. Beban Gaji.",
  TERIMA: "Sumber pemasukan — mis. Pendapatan Usaha.",
  TRANSFER: "Rekening tujuan — harus berbeda dari rekening asal.",
};

const CARD_HEAD: Record<CashKind, { title: string; desc: string }> = {
  BAYAR: {
    title: "Rincian Pembayaran",
    desc: "Pilih rekening sumber, tujuan pengeluaran, dan nominalnya.",
  },
  TERIMA: {
    title: "Rincian Penerimaan",
    desc: "Pilih rekening tujuan, sumber pemasukan, dan nominalnya.",
  },
  TRANSFER: {
    title: "Rincian Transfer",
    desc: "Pilih rekening asal dan tujuan, lalu nominalnya.",
  },
};

const CASH_PLACEHOLDER: Record<CashKind, string> = {
  BAYAR: "Cari kas / bank sumber...",
  TERIMA: "Cari kas / bank tujuan...",
  TRANSFER: "Cari rekening asal...",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const FRIENDLY_ERROR: Record<string, string> = {
  AKUN_SAMA: "Akun asal dan tujuan sama — pilih dua akun yang berbeda.",
  BUKAN_AKUN_KAS: "Akun pertama harus Kas atau Bank.",
  TRANSFER_HARUS_ANTAR_KAS:
    "Transfer hanya antar Kas/Bank — pilih dua rekening kas.",
  NOMINAL_HARUS_POSITIF: "Nominal harus lebih dari Rp0.",
  TANGGAL_TIDAK_VALID: "Tanggal tidak valid — gunakan format kalender.",
  AKUN_TIDAK_DITEMUKAN: "Akun tidak ditemukan — muat ulang halaman.",
  AKUN_DIARSIPKAN: "Akun sudah diarsipkan — pilih akun aktif lain.",
  PERIODE_TUTUP:
    "Periode tanggal itu sudah ditutup — pilih tanggal di periode berjalan.",
  PERIODE_TIDAK_DITEMUKAN:
    "Tidak ada periode untuk tanggal itu — periksa Pengaturan.",
};

function friendlyError(raw: string): string {
  return FRIENDLY_ERROR[raw] ?? raw;
}

export function CashEntryForm({
  kind,
  title,
  detailBasePath,
  cashAccounts,
  counterAccounts,
  contacts,
  quickPicks,
  insight,
  transferMode = false,
}: CashEntryFormProps) {
  const router = useRouter();
  const [cashId, setCashId] = React.useState(cashAccounts[0]?.id ?? "");
  const [counterId, setCounterId] = React.useState(
    transferMode ? (cashAccounts[1]?.id ?? "") : ""
  );
  const [contactId, setContactId] = React.useState("");
  const [date, setDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const head = CARD_HEAD[kind];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > MAX_FILE_BYTES) {
        setError("Ukuran file maksimal 5 MB.");
        return;
      }
      setError(null);
      setFile(selected);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      if (dropped.size > MAX_FILE_BYTES) {
        setError("Ukuran file maksimal 5 MB.");
        return;
      }
      setError(null);
      setFile(dropped);
    }
  }

  function removeFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function doSubmit(post: boolean) {
    if (!cashId || !counterId) {
      setError("Pilih kedua akun terlebih dahulu.");
      return;
    }
    if (transferMode && cashId === counterId) {
      setError(friendlyError("AKUN_SAMA"));
      return;
    }
    if (!amount.trim()) {
      setError("Nominal wajib diisi — tulis angka saja, mis. 1500000.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let documentId: string | undefined;
      let documentFileName: string | undefined;
      if (file) {
        const up = new FormData();
        up.set("file", file);
        const upRes = await uploadDocumentAction(up);
        if (!upRes.ok || !upRes.documentId) {
          setError(upRes.error ?? "Gagal mengunggah lampiran.");
          return;
        }
        documentId = upRes.documentId;
        documentFileName = file.name;
      }
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("entryDate", date);
      fd.set("cashAccountId", cashId);
      fd.set("counterAccountId", counterId);
      if (contactId) fd.set("contactId", contactId);
      fd.set("amount", amount);
      fd.set("memo", memo.trim());
      fd.set("post", post ? "1" : "0");
      if (documentId) {
        fd.set("documentId", documentId);
        if (documentFileName) fd.set("documentFileName", documentFileName);
      }
      const res = await createCashEntryAction(fd);
      if (!res.ok) throw new Error(friendlyError(res.error));
      router.push(`${detailBasePath}/${res.data.id}`);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? friendlyError(e.message) : "Gagal menyimpan."
      );
    } finally {
      setLoading(false);
    }
  }

  const cashLabel = transferMode ? "Dari Kas/Bank" : "Kas/Bank";
  const counterLabel = transferMode ? "Ke Kas/Bank" : "Akun Lawan";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <PageHeader
        title={title}
        eyebrow={EYEBROW[kind]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(detailBasePath)}
              disabled={loading}
              className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
            >
              Batal
            </Button>
            <div className="flex items-stretch shadow-xs rounded-xl overflow-hidden">
              <Button
                type="button"
                size="sm"
                disabled={loading}
                data-testid="kas-bank-submit-post"
                onClick={() => doSubmit(true)}
                className="h-9 rounded-l-xl rounded-r-none px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold transition-transform active:scale-[0.98] disabled:transform-none shadow-none"
              >
                {loading && (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                )}
                Simpan & Posting
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    disabled={loading}
                    aria-label="Opsi simpan lain"
                    className="h-9 rounded-l-none rounded-r-xl border-l border-l-white/25 px-2.5 bg-terra text-white hover:bg-terra/90 shadow-none disabled:transform-none"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="min-w-48 rounded-xl border-rule bg-paper shadow-md"
                >
                  <DropdownMenuItem
                    data-testid="kas-bank-submit-draft"
                    onSelect={() => doSubmit(false)}
                    className="text-xs font-medium cursor-pointer py-2"
                  >
                    Simpan sebagai Draft
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      />

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-destructive/10 border border-destructive/20 p-3.5 text-xs font-medium text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-rule bg-paper p-4 sm:p-6 shadow-xs space-y-4">
          <div>
            <h2 className="font-display text-sm font-semibold text-ink">
              {head.title}
            </h2>
            <p className="text-xs text-ink-soft mt-0.5">{head.desc}</p>
          </div>

        {!transferMode && quickPicks.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {quickPicks.map((q) => (
              <Button
                key={q.accountId}
                type="button"
                variant={counterId === q.accountId ? "default" : "outline"}
                size="sm"
                className="text-xs"
                onClick={() => setCounterId(q.accountId)}
              >
                {q.label}
              </Button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label
              htmlFor="kas-bank-cash"
              className="text-xs text-ink-soft"
            >
              {cashLabel} *
            </Label>
            <div data-testid="kas-bank-cash">
              <AccountSelect
                id="kas-bank-cash"
                accounts={cashAccounts}
                value={cashId}
                onValueChange={setCashId}
                placeholder={CASH_PLACEHOLDER[kind]}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label
              htmlFor="kas-bank-counter"
              className="text-xs text-ink-soft"
            >
              {counterLabel} *
            </Label>
            <div data-testid="kas-bank-counter">
              <AccountSelect
                id="kas-bank-counter"
                accounts={counterAccounts}
                value={counterId}
                onValueChange={setCounterId}
                placeholder="Cari nomor atau nama akun..."
                showCreateLink
              />
            </div>
            <p className="text-[11px] leading-relaxed text-ink-soft">
              {COUNTER_HINT[kind]}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="kas-bank-amount"
            className="text-xs text-ink-soft"
          >
            Nominal (Rp) *
          </Label>
          <Input
            id="kas-bank-amount"
            data-testid="kas-bank-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="text-right bg-paper font-mono text-xs"
            required
          />
          <p className="text-[11px] leading-relaxed text-ink-soft">
            Tulis angka saja, tanpa titik.
          </p>
        </div>

        {!transferMode && contacts.length > 0 && (
          <div className="space-y-1">
            <Label
              htmlFor="kas-bank-contact"
              className="text-xs text-ink-soft"
            >
              Kontak (opsional)
            </Label>
            <select
              id="kas-bank-contact"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
            >
              <option value="">— Tanpa kontak —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <Label
            htmlFor="kas-bank-memo"
            className="text-xs text-ink-soft"
          >
            Keterangan
          </Label>
          <Textarea
            id="kas-bank-memo"
            data-testid="kas-bank-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Contoh: Beli ATK kantor"
            className="text-xs bg-paper min-h-[72px] leading-relaxed"
            rows={2}
          />
        </div>
        </div>

        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-1.5">
            <Label
              htmlFor="kas-bank-date"
              className="text-xs font-semibold text-ink-soft flex items-center gap-1.5"
            >
              <Calendar className="size-3.5 text-ink-soft" />
              <span>Tanggal Transaksi</span>
            </Label>
            <Input
              id="kas-bank-date"
              data-testid="kas-bank-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="bg-paper"
            />
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Paperclip className="size-3.5 text-ink-soft" />
                <span className="text-xs font-semibold text-ink">
                  Lampiran / Bukti
                </span>
              </div>
              <span className="text-[11px] text-ink-soft">Maks 5 MB</span>
            </div>
            {file ? (
              <div className="flex items-center justify-between rounded-xl border border-rule bg-canvas/40 p-2.5 shadow-2xs">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-terra/10 text-terra">
                    <FileText className="size-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="truncate text-xs font-medium text-ink">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-ink-soft">
                      {(file.size / 1024).toFixed(1)} KB · tertaut saat
                      disimpan
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={removeFile}
                  className="text-ink-soft hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Hapus file"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-rule bg-canvas/30 px-3 py-3 text-xs text-ink-soft transition-colors hover:bg-canvas hover:text-ink"
              >
                <UploadCloud className="size-4 text-terra" />
                <span className="text-[11px]">
                  Seret foto nota ke sini, atau klik untuk pilih
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="rounded-2xl border border-rule bg-paper p-4 sm:p-5 shadow-xs space-y-2">
            <div className="flex items-center gap-1.5">
              <BookOpen className="size-3.5 text-terra" />
              <span className="text-xs font-semibold text-ink">
                Insight Harian
              </span>
            </div>
            <p className="text-xs font-medium text-ink">{insight.title}</p>
            <p className="text-xs leading-relaxed text-ink-soft">
              {insight.body}
            </p>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-ink-soft">
                {insight.source}
              </span>
              <InsightSheet insight={insight} />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
