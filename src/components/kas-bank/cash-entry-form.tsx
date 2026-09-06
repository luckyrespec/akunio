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
import { ChevronDown, Loader2 } from "lucide-react";
import { createCashEntryAction } from "@/server/actions/cash-bank.actions";
import type { CashKind } from "@/server/db/schema/cash-bank";

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
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("entryDate", date);
      fd.set("cashAccountId", cashId);
      fd.set("counterAccountId", counterId);
      if (contactId) fd.set("contactId", contactId);
      fd.set("amount", amount);
      fd.set("memo", memo.trim());
      fd.set("post", post ? "1" : "0");
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
          className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive max-w-2xl"
        >
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-rule bg-paper p-5 shadow-2xs max-w-2xl">
        <p className="text-xs text-ink-soft">
          Otomatis menjadi jurnal seimbang — Anda tidak perlu menghafal
          debit-kredit.
        </p>

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
          <div className="space-y-1.5">
            <Label
              htmlFor="kas-bank-cash"
              className="text-xs font-medium text-ink"
            >
              {cashLabel} *
            </Label>
            <select
              id="kas-bank-cash"
              data-testid="kas-bank-cash"
              value={cashId}
              onChange={(e) => setCashId(e.target.value)}
              className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
            >
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="kas-bank-counter"
              className="text-xs font-medium text-ink"
            >
              {counterLabel} *
            </Label>
            <select
              id="kas-bank-counter"
              data-testid="kas-bank-counter"
              value={counterId}
              onChange={(e) => setCounterId(e.target.value)}
              className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
            >
              <option value="">— Pilih —</option>
              {counterAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] leading-relaxed text-ink-soft">
              {COUNTER_HINT[kind]}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="kas-bank-date"
              className="text-xs font-medium text-ink"
            >
              Tanggal *
            </Label>
            <Input
              id="kas-bank-date"
              data-testid="kas-bank-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs bg-canvas"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="kas-bank-amount"
              className="text-xs font-medium text-ink"
            >
              Nominal (Rp) *
            </Label>
            <Input
              id="kas-bank-amount"
              data-testid="kas-bank-amount"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1500000"
              className="text-xs bg-canvas tnum"
              required
            />
            <p className="text-[11px] leading-relaxed text-ink-soft">
              Tulis angka saja, tanpa titik.
            </p>
          </div>
        </div>

        {!transferMode && contacts.length > 0 && (
          <div className="space-y-1.5">
            <Label
              htmlFor="kas-bank-contact"
              className="text-xs font-medium text-ink"
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

        <div className="space-y-1.5">
          <Label
            htmlFor="kas-bank-memo"
            className="text-xs font-medium text-ink"
          >
            Keterangan
          </Label>
          <Textarea
            id="kas-bank-memo"
            data-testid="kas-bank-memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Contoh: Beli ATK kantor"
            className="text-xs bg-canvas"
            rows={2}
          />
        </div>
      </div>
    </form>
  );
}
