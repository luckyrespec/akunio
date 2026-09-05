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
  parentCode?: string | null;
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

  // Suggest next code based on parent or category
  const suggestNextCode = React.useCallback((targetParentCode: string, targetType: AccountType) => {
    if (targetParentCode) {
      // Find all sibling accounts with this parent
      const siblings = existingAccounts.filter((a) => a.parentCode === targetParentCode || a.code.startsWith(targetParentCode));
      const numericSiblings = siblings
        .map((s) => parseInt(s.code.replace(/\D/g, ""), 10))
        .filter((n) => !isNaN(n) && n > 0);

      const parentNum = parseInt(targetParentCode.replace(/\D/g, ""), 10);
      if (numericSiblings.length > 0) {
        const maxSibling = Math.max(...numericSiblings);
        // If parent is e.g. 1100 and siblings are 1110, 1120 -> next 1130 (or +10 or +1)
        const diff = maxSibling - parentNum;
        if (diff >= 10 && maxSibling % 10 === 0) {
          return String(maxSibling + 10);
        }
        return String(maxSibling + 1);
      }

      // No sibling yet, create first child (e.g. 1100 -> 1110 or 1101)
      if (!isNaN(parentNum)) {
        if (parentNum % 100 === 0) {
          return String(parentNum + 10);
        }
        return String(parentNum + 1);
      }
      return `${targetParentCode}1`;
    }

    // No parent: root level (e.g. 1000, 2000, etc.)
    const prefix = TYPE_CONFIG[targetType].defaultPrefix;
    const sameTypeRoots = existingAccounts.filter((a) => a.type === targetType && !a.parentCode);
    const numericRoots = sameTypeRoots
      .map((s) => parseInt(s.code.replace(/\D/g, ""), 10))
      .filter((n) => !isNaN(n) && n > 0);

    if (numericRoots.length > 0) {
      const maxRoot = Math.max(...numericRoots);
      return String(maxRoot + 1000);
    }
    return `${prefix}000`;
  }, [existingAccounts]);

  // When type changes, auto-set default normal balance, reset parent, and suggest code
  const handleTypeChange = (newType: AccountType) => {
    setType(newType);
    setNormal(TYPE_CONFIG[newType].defaultNormal);
    setParentCode("");
    setIsCash(false);
    setIsBank(false);
    setContra(false);
    setError(null);
    setCode(suggestNextCode("", newType));
  };

  // When parent changes, suggest code automatically
  const handleParentChange = (newParentCode: string) => {
    setParentCode(newParentCode);
    if (newParentCode) {
      const parent = existingAccounts.find((a) => a.code === newParentCode);
      if (parent) {
        const pType = parent.type as AccountType;
        setType(pType);
        setNormal(parent.normal === "K" ? "K" : "D");
        setCode(suggestNextCode(newParentCode, pType));
      }
    } else {
      setCode(suggestNextCode("", type));
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

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && !code) {
      setCode(suggestNextCode(parentCode, type));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-xl bg-terra text-white text-xs px-3.5 shadow-2xs hover:bg-terra/90 transition-[transform,background-color] active:scale-[0.98]"
          disabled={disabled}
        >
          <Plus className="size-3.5" />
          <span>Tambah Akun Baru</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl p-6 sm:p-7 flex flex-col justify-between min-h-[580px]">
        <DialogHeader className="space-y-1 shrink-0">
          <DialogTitle className="font-display text-lg font-bold text-ink">
            Tambah Akun Baru (Chart of Accounts)
          </DialogTitle>
          <DialogDescription className="text-xs text-ink-soft">
            Daftarkan akun baru ke dalam Bagan Akun perusahaan Anda dengan klasifikasi IFRS/SAK EMKM yang terstruktur.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive shrink-0">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between space-y-5 py-1 text-xs">
          <div className="space-y-4">
            {/* 1. Kategori Akun (Type Selector) */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-ink">Kategori Akun</Label>
              <div className="grid grid-cols-5 gap-2">
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
                        "flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-colors",
                        isSelected
                          ? cn(conf.bg, "font-bold shadow-2xs", conf.color)
                          : "border-rule bg-canvas/40 text-ink-soft hover:bg-canvas hover:text-ink",
                      )}
                    >
                      <Icon className="size-4.5 mb-1.5" />
                      <span>{conf.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Grid Akun Induk & Saldo Normal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Akun Induk */}
              <div className="sm:col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-ink">Akun Induk (Leveling)</Label>
                  <span className="text-[11px] text-ink-soft">Opsional untuk sub-akun</span>
                </div>
                <select
                  value={parentCode}
                  onChange={(e) => handleParentChange(e.target.value)}
                  className="h-9 w-full rounded-xl border border-rule bg-paper px-3 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
                >
                  <option value="">-- Tanpa Induk (Level 1: Akun Utama / Header) --</option>
                  {availableParents.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-soft">
                  {parentCode
                    ? `Sub-akun di bawah kode ${parentCode}.`
                    : "Tanpa induk akan otomatis menjadi Akun Utama Level 1."}
                </p>
              </div>

              {/* Saldo Normal */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-ink">Saldo Normal</Label>
                <div className="grid grid-cols-2 gap-1.5 h-9">
                  <button
                    type="button"
                    onClick={() => setNormal("D")}
                    className={cn(
                      "flex items-center justify-center rounded-xl border text-xs font-medium transition-colors",
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
                      "flex items-center justify-center rounded-xl border text-xs font-medium transition-colors",
                      normal === "K"
                        ? "border-terra/60 bg-terra/10 text-terra font-semibold"
                        : "border-rule bg-canvas/40 text-ink-soft hover:bg-canvas",
                    )}
                  >
                    <span>Kredit (K)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 3. Kode Akun & Nama Akun */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-ink">Kode Akun</Label>
                  <span className="text-[11px] text-terra font-medium">Otomatis/Bebas</span>
                </div>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={parentCode ? `${parentCode.slice(0, 2)}xx` : `${TYPE_CONFIG[type].defaultPrefix}xxx`}
                  maxLength={8}
                  className="font-mono text-xs h-9 rounded-xl font-bold text-ink"
                  required
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold text-ink">Nama Akun</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Kas Operasional Toko / Bank BCA Rekening Koran"
                  className="text-xs h-9 rounded-xl"
                  required
                />
              </div>
            </div>

            {/* 4. Opsi Karakteristik Akun - Fixed height container */}
            <div className="pt-2 border-t border-rule/60 space-y-2">
              <Label className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider">
                Karakteristik Khusus Akun
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 min-h-[96px]">
                {type === "ASET" ? (
                  <>
                    <label className="flex items-center gap-2.5 rounded-xl border border-rule/80 bg-canvas/30 p-2.5 text-xs text-ink cursor-pointer hover:bg-canvas transition-colors h-[46px]">
                      <input
                        type="checkbox"
                        checked={isCash}
                        onChange={(e) => setIsCash(e.target.checked)}
                        className="rounded size-3.5 border-rule text-terra focus:ring-terra"
                      />
                      <div className="min-w-0">
                        <span className="font-semibold block leading-tight">Akun Kas Tunai</span>
                        <span className="text-[11px] text-ink-soft block leading-tight truncate">Petty cash, uang kas di tangan</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 rounded-xl border border-rule/80 bg-canvas/30 p-2.5 text-xs text-ink cursor-pointer hover:bg-canvas transition-colors h-[46px]">
                      <input
                        type="checkbox"
                        checked={isBank}
                        onChange={(e) => setIsBank(e.target.checked)}
                        className="rounded size-3.5 border-rule text-terra focus:ring-terra"
                      />
                      <div className="min-w-0">
                        <span className="font-semibold block leading-tight">Akun Rekening Bank</span>
                        <span className="text-[11px] text-ink-soft block leading-tight truncate">Digunakan pada rekonsiliasi</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2.5 rounded-xl border border-rule/80 bg-canvas/30 p-2.5 text-xs text-ink cursor-pointer hover:bg-canvas transition-colors sm:col-span-2 h-[46px]">
                      <input
                        type="checkbox"
                        checked={contra}
                        onChange={(e) => setContra(e.target.checked)}
                        className="rounded size-3.5 border-rule text-terra focus:ring-terra"
                      />
                      <div className="min-w-0">
                        <span className="font-semibold block leading-tight">Akun Kontra</span>
                        <span className="text-[11px] text-ink-soft block leading-tight truncate">
                          Mengurangi saldo akun induk terkait (misal: Akumulasi Penyusutan)
                        </span>
                      </div>
                    </label>
                  </>
                ) : (
                  <div className="sm:col-span-2 flex flex-col gap-2">
                    <label className="flex items-center gap-2.5 rounded-xl border border-rule/80 bg-canvas/30 p-2.5 text-xs text-ink cursor-pointer hover:bg-canvas transition-colors h-[46px]">
                      <input
                        type="checkbox"
                        checked={contra}
                        onChange={(e) => setContra(e.target.checked)}
                        className="rounded size-3.5 border-rule text-terra focus:ring-terra"
                      />
                      <div className="min-w-0">
                        <span className="font-semibold block leading-tight">Akun Kontra</span>
                        <span className="text-[11px] text-ink-soft block leading-tight truncate">
                          Mengurangi saldo kategori {TYPE_CONFIG[type].label} (misal: Retur Penjualan, Potongan, atau Prive)
                        </span>
                      </div>
                    </label>
                    <div className="flex items-center rounded-xl border border-dashed border-rule/80 p-2.5 text-[11px] text-ink-soft h-[42px]">
                      <span>Akun Kas dan Bank hanya berlaku untuk kategori Aset.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="h-9 text-xs rounded-xl px-4"
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-9 text-xs rounded-xl bg-terra text-white hover:bg-terra/90 px-5 shadow-2xs"
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
