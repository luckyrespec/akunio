"use client";

import * as React from "react";
import { Plus, Loader2, AlertCircle, Coins, CreditCard, Scale, TrendingUp, TrendingDown, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccountAction, type CreateAccountInput } from "@/server/actions/account.actions";
import { cn } from "@/lib/utils";

interface AccountOption {
  code: string;
  name: string;
  type: "ASET" | "LIABILITAS" | "EKUITAS" | "PENDAPATAN" | "BEBAN";
  normal: string;
}

interface CreateAccountDialogProps {
  existingAccounts: AccountOption[];
  disabled?: boolean;
}

const TYPE_CONFIG = {
  ASET: {
    label: "Aset",
    icon: Coins,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    defaultNormal: "D" as const,
    defaultPrefix: "1",
  },
  LIABILITAS: {
    label: "Liabilitas",
    icon: CreditCard,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    defaultNormal: "K" as const,
    defaultPrefix: "2",
  },
  EKUITAS: {
    label: "Ekuitas",
    icon: Scale,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/20",
    defaultNormal: "K" as const,
    defaultPrefix: "3",
  },
  PENDAPATAN: {
    label: "Pendapatan",
    icon: TrendingUp,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    defaultNormal: "K" as const,
    defaultPrefix: "4",
  },
  BEBAN: {
    label: "Beban",
    icon: TrendingDown,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    defaultNormal: "D" as const,
    defaultPrefix: "5",
  },
} as const;

type AccountType = keyof typeof TYPE_CONFIG;

export function CreateAccountDialog({ existingAccounts, disabled }: CreateAccountDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<AccountType>("ASET");
  const [parentCode, setParentCode] = React.useState<string>("");
  const [code, setCode] = React.useState<string>("");
  const [name, setName] = React.useState<string>("");
  const [normal, setNormal] = React.useState<"D" | "K">("D");
  const [isCash, setIsCash] = React.useState(false);
  const [isBank, setIsBank] = React.useState(false);
  const [contra, setContra] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Filter parents matching current account type
  const availableParents = React.useMemo(() => {
    return existingAccounts.filter((a) => a.type === type);
  }, [existingAccounts, type]);

  // When type changes, auto-set default normal balance and reset parent
  const handleTypeChange = (newType: AccountType) => {
    setType(newType);
    setNormal(TYPE_CONFIG[newType].defaultNormal);
    setParentCode("");
    setIsCash(false);
    setIsBank(false);
    setContra(false);
    setError(null);
  };

  // When parent changes, suggest code prefix
  const handleParentChange = (newParentCode: string) => {
    setParentCode(newParentCode);
    if (newParentCode) {
      const parent = existingAccounts.find((a) => a.code === newParentCode);
      if (parent) {
        setType(parent.type as AccountType);
        setNormal(parent.normal === "K" ? "K" : "D");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError("Kode akun harus diisi.");
      return;
    }
    if (!name.trim()) {
      setError("Nama akun harus diisi.");
      return;
    }

    setLoading(true);
    try {
      const payload: CreateAccountInput = {
        code: code.trim(),
        name: name.trim(),
        type,
        normal,
        parentCode: parentCode || undefined,
        isCash,
        isBank,
        contra,
      };

      const res = await createAccountAction(payload);
      if (!res.ok) {
        throw new Error(res.error || "Gagal membuat akun.");
      }

      setOpen(false);
      // Reset form
      setCode("");
      setName("");
      setParentCode("");
      setIsCash(false);
      setIsBank(false);
      setContra(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat akun.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-full bg-terra text-white text-xs px-3 shadow-2xs hover:bg-terra/90 transition-transform active:scale-95"
          disabled={disabled}
        >
          <Plus className="size-3.5" />
          <span>Tambah Akun Baru</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-bold text-ink">
            Tambah Akun Baru
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft">
            Daftarkan akun baru ke dalam Bagan Akun (COA) perusahaan Anda.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2 text-xs">
          {/* 1. Kategori Akun (Type Selector) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-ink">Kategori Akun</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(TYPE_CONFIG) as AccountType[]).map((t) => {
                const conf = TYPE_CONFIG[t];
                const Icon = conf.icon;
                const isSelected = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={cn(
                      "flex flex-col items-center justify-center p-2 rounded-xl border text-[11px] font-medium transition-all",
                      isSelected
                        ? cn(conf.bg, "font-bold shadow-2xs", conf.color)
                        : "border-rule bg-canvas/40 text-ink-soft hover:bg-canvas hover:text-ink",
                    )}
                  >
                    <Icon className="size-4 mb-1" />
                    <span>{conf.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Akun Induk (Leveling / Parent Account) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-ink">Akun Induk (Leveling)</Label>
              <span className="text-[10px] text-ink-soft">Opsional untuk sub-akun</span>
            </div>
            <select
              value={parentCode}
              onChange={(e) => handleParentChange(e.target.value)}
              className="h-8 w-full rounded-xl border border-rule bg-paper px-2.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
            >
              <option value="">-- Tanpa Induk (Level 1: Akun Utama / Header) --</option>
              {availableParents.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} - {a.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-ink-soft">
              {parentCode
                ? `Akun ini akan menjadi sub-akun (Level ${parentCode.length > 3 ? "3 (Posting)" : "2 (Grup)"}) di bawah kode ${parentCode}.`
                : "Akun tanpa induk akan menjadi Akun Utama Level 1."}
            </p>
          </div>

          {/* 3. Kode Akun & Nama Akun */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs font-semibold text-ink">Kode Akun</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={parentCode ? `${parentCode.slice(0, 2)}xx` : `${TYPE_CONFIG[type].defaultPrefix}xxx`}
                maxLength={8}
                className="font-mono text-xs h-8"
                required
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-semibold text-ink">Nama Akun</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Bank Mandiri Giro"
                className="text-xs h-8"
                required
              />
            </div>
          </div>

          {/* 4. Saldo Normal & Opsi Tambahan */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-ink">Saldo Normal</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNormal("D")}
                className={cn(
                  "flex items-center justify-center gap-2 h-8 rounded-xl border text-xs font-medium transition-all",
                  normal === "D"
                    ? "border-terra/60 bg-terra/10 text-terra font-semibold"
                    : "border-rule bg-canvas/40 text-ink-soft hover:bg-canvas",
                )}
              >
                <span>Debit (D)</span>
              </button>
              <button
                type="button"
                onClick={() => setNormal("K")}
                className={cn(
                  "flex items-center justify-center gap-2 h-8 rounded-xl border text-xs font-medium transition-all",
                  normal === "K"
                    ? "border-terra/60 bg-terra/10 text-terra font-semibold"
                    : "border-rule bg-canvas/40 text-ink-soft hover:bg-canvas",
                )}
              >
                <span>Kredit (K)</span>
              </button>
            </div>
          </div>

          {/* 5. Checkbox Tambahan (Kas/Bank / Kontra) */}
          <div className="pt-1 space-y-2 border-t border-rule/50">
            {type === "ASET" && (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCash}
                    onChange={(e) => setIsCash(e.target.checked)}
                    className="rounded border-rule text-terra focus:ring-terra"
                  />
                  <span>Akun Kas Tunai</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBank}
                    onChange={(e) => setIsBank(e.target.checked)}
                    className="rounded border-rule text-terra focus:ring-terra"
                  />
                  <span>Akun Rekening Bank</span>
                </label>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={contra}
                onChange={(e) => setContra(e.target.checked)}
                className="rounded border-rule text-terra focus:ring-terra"
              />
              <span>Akun Kontra (Mengurangi saldo akun induk, e.g. Akumulasi Penyusutan / Prive)</span>
            </label>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-8 text-xs rounded-lg"
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs rounded-lg bg-terra text-white hover:bg-terra/90"
              disabled={loading}
            >
              {loading && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              <span>Simpan Akun</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
