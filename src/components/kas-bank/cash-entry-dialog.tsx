"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { ChevronDown, Loader2, Plus } from "lucide-react";
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

interface CashEntryDialogProps {
  kind: CashKind;
  title: string;
  triggerLabel: string;
  cashAccounts: AccountOption[];
  counterAccounts: AccountOption[];
  contacts: Array<{ id: string; name: string }>;
  quickPicks: QuickPick[];
  transferMode?: boolean;
}

const COUNTER_HINT: Record<CashKind, string> = {
  BAYAR: "Beban atau tujuan pengeluaran — mis. Beban Gaji.",
  TERIMA: "Sumber pemasukan — mis. Pendapatan Usaha.",
  TRANSFER: "Rekening tujuan — harus berbeda dari rekening asal.",
};

const FRIENDLY_ERROR: Record<string, string> = {
  AKUN_SAMA: "Akun asal dan tujuan sama — pilih dua akun yang berbeda.",
  BUKAN_AKUN_KAS: "Akun pertama harus Kas atau Bank.",
  TRANSFER_HARUS_ANTAR_KAS: "Transfer hanya antar Kas/Bank — pilih dua rekening kas.",
  NOMINAL_HARUS_POSITIF: "Nominal harus lebih dari Rp0.",
  TANGGAL_TIDAK_VALID: "Tanggal tidak valid — gunakan format kalender.",
  AKUN_TIDAK_DITEMUKAN: "Akun tidak ditemukan — muat ulang halaman.",
  AKUN_DIARSIPKAN: "Akun sudah diarsipkan — pilih akun aktif lain.",
  PERIODE_TUTUP: "Periode tanggal itu sudah ditutup — pilih tanggal di periode berjalan.",
  PERIODE_TIDAK_DITEMUKAN: "Tidak ada periode untuk tanggal itu — periksa Pengaturan.",
};

function friendlyError(raw: string): string {
  return FRIENDLY_ERROR[raw] ?? raw;
}

export function CashEntryDialog({
  kind,
  title,
  triggerLabel,
  cashAccounts,
  counterAccounts,
  contacts,
  quickPicks,
  transferMode = false,
}: CashEntryDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [cashId, setCashId] = React.useState("");
  const [counterId, setCounterId] = React.useState("");
  const [contactId, setContactId] = React.useState("");
  const [date, setDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setCashId(cashAccounts[0]?.id ?? "");
      setCounterId(transferMode ? (cashAccounts[1]?.id ?? "") : "");
      setContactId("");
      setDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setMemo("");
      setError(null);
    }
  }, [open, cashAccounts, transferMode]);

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
      setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="h-9 rounded-xl bg-terra px-3.5 text-xs font-medium text-white shadow-none transition-all hover:bg-terra/90 active:scale-[0.98]"
        >
          <Plus className="size-4 mr-1.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[440px] bg-paper text-ink border-rule">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">
            {title}
          </DialogTitle>
          <p className="text-xs text-ink-soft">
            Otomatis menjadi jurnal seimbang — Anda tidak perlu menghafal
            debit-kredit.
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              {error}
            </div>
          )}

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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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

          <p className="text-[11px] leading-relaxed text-ink-soft">
            Posting langsung mengunci jurnal; Draft bisa dicek dulu sebelum
            dicatat.
          </p>

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="text-xs border-rule"
            >
              Batal
            </Button>
            <div className="flex items-center">
              <Button
                type="button"
                size="sm"
                disabled={loading}
                data-testid="kas-bank-submit-post"
                onClick={() => doSubmit(true)}
                className="rounded-l-xl rounded-r-none bg-terra px-3.5 text-xs font-medium text-white shadow-none transition-all hover:bg-terra/90 active:scale-[0.98]"
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
                    className="rounded-l-none rounded-r-xl border-l border-white/20 bg-terra px-2 text-xs text-white shadow-none transition-colors hover:bg-terra/90"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid="kas-bank-submit-draft"
                    onSelect={() => doSubmit(false)}
                  >
                    Simpan sebagai Draft
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
