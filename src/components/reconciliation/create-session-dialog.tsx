"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, Sparkles, Loader2 } from "lucide-react";
import { startReconciliationSessionAction } from "@/server/actions/reconciliation.actions";
import { useRouter } from "next/navigation";

export interface BankAccountOption {
  id: string;
  code: string;
  name: string;
}

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccounts: BankAccountOption[];
  onSuccess?: () => void;
}

export function CreateSessionDialog({
  open,
  onOpenChange,
  bankAccounts,
  onSuccess,
}: CreateSessionDialogProps) {
  const router = useRouter();
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [statementDate, setStatementDate] = React.useState(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [closingBalance, setClosingBalance] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccountId) {
      setBankAccountId(bankAccounts[0].id);
    }
    setError(null);
    setSelectedFile(null);
    setClosingBalance("");
  }, [bankAccounts, open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bankAccountId) {
      setError("Silakan pilih akun kas / bank.");
      return;
    }
    if (!statementDate) {
      setError("Silakan masukkan tanggal cut-off rekening koran.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("bankAccountId", bankAccountId);
      formData.append("statementDate", statementDate);
      if (selectedFile) {
        formData.append("file", selectedFile);
      }
      if (closingBalance) {
        formData.append("closingBalance", closingBalance);
      }

      const res = await startReconciliationSessionAction(formData);
      if (!res.ok) {
        throw new Error(res.error);
      }

      onOpenChange(false);
      onSuccess?.();
      if (res.data?.id) {
        router.push(`/kas-bank/rekonsiliasi/${res.data.id}`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memulai sesi rekonsiliasi."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-paper text-ink border-rule">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold flex items-center gap-2">
            <span>Mulai Sesi Rekonsiliasi Bank Baru</span>
          </DialogTitle>
          <p className="text-xs text-ink-soft">
            Unggah rekening koran bank atau masukkan saldo cut-off untuk mencocokkan mutasi kas.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rec-bank-account" className="text-xs font-medium text-ink">
              Pilih Akun Bank *
            </Label>
            <select
              id="rec-bank-account"
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full rounded-md border border-rule bg-canvas px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
              required
            >
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-date" className="text-xs font-medium text-ink">
              Tanggal Cut-Off Rekening Koran *
            </Label>
            <Input
              id="rec-date"
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="text-xs bg-canvas"
              required
            />
          </div>

          {/* Upload Area */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-ink flex items-center justify-between">
              <span>File Rekening Koran (PDF, Gambar, CSV, XLSX)</span>
              <span className="flex items-center gap-1 text-[11px] text-terra">
                <Sparkles className="size-3" /> Ekstraksi Otomatis AI
              </span>
            </Label>
            <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rule bg-canvas/40 p-5 cursor-pointer hover:bg-canvas transition-colors">
              <Upload className="size-6 text-ink-soft mb-2" />
              {selectedFile ? (
                <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                  <FileText className="size-4 text-terra" />
                  <span className="truncate max-w-xs">{selectedFile.name}</span>
                </div>
              ) : (
                <div className="text-center">
                  <span className="text-xs font-medium text-ink">Klik untuk memilih file</span>
                  <p className="text-[11px] text-ink-soft mt-0.5">Mendukung PDF mutasi BCA, Mandiri, BRI, BNI, dll.</p>
                </div>
              )}
              <input
                type="file"
                accept=".pdf,image/*,.csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-balance" className="text-xs font-medium text-ink">
              Saldo Akhir Rekening Koran (Opsional jika upload file)
            </Label>
            <Input
              id="rec-balance"
              type="number"
              placeholder="Contoh: 15000000"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              className="text-xs bg-canvas"
            />
            <p className="text-[11px] text-ink-soft">
              Jika file diunggah, AI Gemini akan otomatis mengekstrak saldo akhir rekening koran Anda.
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="text-xs border-rule"
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="text-xs bg-terra hover:bg-terra/90 text-white"
            >
              {loading && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              {selectedFile ? "Unggah & Ekstrak dengan Gemini" : "Mulai Sesi Rekonsiliasi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
