"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Sparkles, Scale, ReceiptText, Info, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber, Reveal, Stagger, StaggerItem } from "@/components/motion";
import { Money } from "@/core/money/money";
import { calculateDepreciationSchedule } from "@/core/assets/depreciation";
import { createAssetWithAcquisitionAction } from "@/server/actions/assets.actions";

type Category = "TANAH" | "BANGUNAN" | "KENDARAAN" | "MESIN_PERALATAN" | "INVENTARIS_KANTOR";
type Method = "STRAIGHT_LINE" | "DECLINING_BALANCE";

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
  isCash: boolean;
  isBank: boolean;
  parentCode: string | null;
}

const CATEGORY_LABEL: Record<Category, string> = {
  INVENTARIS_KANTOR: "Inventaris / Peralatan Kantor",
  KENDARAAN: "Kendaraan",
  MESIN_PERALATAN: "Mesin & Peralatan",
  BANGUNAN: "Bangunan",
  TANAH: "Tanah (Tidak Disusutkan)",
};

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tryParseIdr(text: string): bigint | null {
  try {
    if (!text.trim()) return null;
    return Money.parseIdr(text).minor;
  } catch {
    return null;
  }
}

export function AsetBaruClient({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();

  const leaves = useMemo(
    () => accounts.filter((a) => !accounts.some((c) => c.parentCode === a.code)),
    [accounts],
  );

  const assetAccounts = useMemo(
    () => leaves.filter((a) => a.type === "ASET" && a.code.startsWith("15")),
    [leaves],
  );
  const depAccounts = useMemo(
    () => leaves.filter((a) => a.type === "ASET" && a.code.startsWith("16")),
    [leaves],
  );
  const expAccounts = useMemo(
    () => leaves.filter((a) => a.type === "BEBAN" && a.code.startsWith("6")),
    [leaves],
  );
  const cashBank = useMemo(
    () => leaves.filter((a) => a.isCash || a.isBank),
    [leaves],
  );
  const payable = useMemo(
    () => leaves.filter((a) => a.type === "LIABILITAS"),
    [leaves],
  );
  const equity = useMemo(
    () => leaves.filter((a) => a.type === "EKUITAS"),
    [leaves],
  );
  const otherCounter = useMemo(
    () =>
      leaves.filter(
        (a) => !a.isCash && !a.isBank && a.type !== "LIABILITAS" && a.type !== "EKUITAS",
      ),
    [leaves],
  );

  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("INVENTARIS_KANTOR");
  const [acquisitionDate, setAcquisitionDate] = useState(todayISO);
  const [inServiceDate, setInServiceDate] = useState(todayISO);
  const [acquisitionCostText, setAcquisitionCostText] = useState("");
  const [salvageValueText, setSalvageValueText] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(48);
  const [depreciationMethod, setDepreciationMethod] = useState<Method>("STRAIGHT_LINE");
  const [decliningRateText, setDecliningRateText] = useState("");
  const [assetAccountId, setAssetAccountId] = useState(
    assetAccounts[0]?.id || leaves[0]?.id || "",
  );
  const [accumulatedDepAccountId, setAccumulatedDepAccountId] = useState(
    depAccounts[0]?.id || leaves[0]?.id || "",
  );
  const [depreciationExpenseAccountId, setDepreciationExpenseAccountId] = useState(
    expAccounts[0]?.id || leaves[0]?.id || "",
  );
  const [postAcquisition, setPostAcquisition] = useState(true);
  const [counterAccountId, setCounterAccountId] = useState(
    cashBank[0]?.id || leaves[0]?.id || "",
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; name: string } | null>(null);

  const isTanah = category === "TANAH";
  const costMinor = tryParseIdr(acquisitionCostText);
  const salvageMinor = tryParseIdr(salvageValueText) ?? 0n;

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const assetAccount = accountById.get(assetAccountId);
  const counterAccount = accountById.get(counterAccountId);

  const monthlyMinor = useMemo(() => {
    if (isTanah || costMinor === null || costMinor <= 0n) return null;
    const life = Number(usefulLifeMonths);
    if (!Number.isFinite(life) || life <= 0) return null;
    try {
      const schedule = calculateDepreciationSchedule({
        acquisitionCostMinor: costMinor,
        salvageValueMinor: salvageMinor,
        usefulLifeMonths: Math.floor(life),
        inServiceDate,
        method: depreciationMethod,
        decliningRatePercent: decliningRateText ? Number(decliningRateText) : undefined,
      });
      return schedule[0]?.depreciationAmountMinor ?? null;
    } catch {
      return null;
    }
  }, [isTanah, costMinor, salvageMinor, usefulLifeMonths, inServiceDate, depreciationMethod, decliningRateText]);

  const depreciableBasis = costMinor !== null ? costMinor - salvageMinor : null;
  const journalValid =
    postAcquisition && costMinor !== null && costMinor > 0n && !!assetAccount && !!counterAccount && assetAccountId !== counterAccountId;

  const handleSmartRecommendation = () => {
    const lower = name.toLowerCase();
    if (lower.includes("mobil") || lower.includes("motor") || lower.includes("truk") || lower.includes("kendaraan")) {
      setCategory("KENDARAAN");
      setUsefulLifeMonths(96);
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("komputer") || lower.includes("laptop") || lower.includes("printer") || lower.includes("hp")) {
      setCategory("INVENTARIS_KANTOR");
      setUsefulLifeMonths(48);
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("gedung") || lower.includes("kantor") || lower.includes("ruko")) {
      setCategory("BANGUNAN");
      setUsefulLifeMonths(240);
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("mesin") || lower.includes("genset") || lower.includes("alat")) {
      setCategory("MESIN_PERALATAN");
      setUsefulLifeMonths(96);
      setDepreciationMethod("STRAIGHT_LINE");
    } else if (lower.includes("tanah")) {
      setCategory("TANAH");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitWithMode("save");
  };

  function resetForm() {
    setName("");
    setAcquisitionCostText("");
    setSalvageValueText("");
    setNotes("");
    setError(null);
  }

  const submitWithMode = async (mode: "save" | "save-new") => {
    setError(null);
    setFlash(null);
    setLoading(true);
    try {
      const res = await createAssetWithAcquisitionAction({
        name,
        category,
        acquisitionDate,
        inServiceDate,
        acquisitionCostText,
        salvageValueText,
        usefulLifeMonths: isTanah ? 0 : Number(usefulLifeMonths),
        depreciationMethod,
        depreciationRatePercent: decliningRateText ? Number(decliningRateText) : undefined,
        assetAccountId,
        accumulatedDepAccountId,
        depreciationExpenseAccountId,
        notes,
        postAcquisition,
        counterAccountId: postAcquisition ? counterAccountId : undefined,
      });
      if (!res.ok || !res.data) {
        setError(res.error || "Gagal menyimpan aset.");
        return;
      }
      if (mode === "save-new") {
        setFlash({ id: res.data.asset.id, name });
        resetForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        router.push(`/aset/${res.data.asset.id}`);
      }
    } catch (err: any) {
      setError(err.message || "Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title="Tambah Aset Tetap"
        eyebrow="Daftarkan aset, atur penyusutan SAK EMKM, dan otomatis catat jurnal perolehan."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/aset")}
              className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
            >
              Batal
            </Button>

            <div className="flex items-stretch shadow-xs rounded-xl overflow-hidden">
              <Button
                type="submit"
                size="sm"
                disabled={loading}
                className="h-9 rounded-l-xl rounded-r-none px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold transition-transform active:scale-[0.98] disabled:transform-none shadow-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    Menyimpan...
                  </>
                ) : (
                  "Daftarkan Aset"
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    disabled={loading}
                    aria-label="Opsi penyimpanan lainnya"
                    className="h-9 rounded-l-none rounded-r-xl border-l border-l-white/25 px-2.5 bg-terra text-white hover:bg-terra/90 shadow-none disabled:transform-none"
                  >
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48 rounded-xl border-rule bg-paper shadow-md">
                  <DropdownMenuItem
                    onClick={() => void submitWithMode("save")}
                    className="text-xs font-medium cursor-pointer py-2"
                  >
                    Daftarkan Aset
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void submitWithMode("save-new")}
                    className="text-xs font-medium cursor-pointer py-2"
                  >
                    Daftarkan &amp; Tambah Lagi
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        }
      />

      {flash?.id && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-debit/25 bg-debit/10 px-4 py-3 text-xs">
          <span className="text-ink">
            Aset <strong className="font-semibold">{flash.name}</strong> terdaftar. Formulir sudah dikosongkan untuk aset berikutnya.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] border-rule bg-paper" onClick={() => router.push(`/aset/${flash.id}`)}>
              Lihat Detail
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setFlash(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <Stagger className="flex flex-col gap-6" staggerDelay={0.07}>
          {/* Section 1 — Informasi Aset */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Informasi Aset</CardTitle>
                <CardDescription>Identitas dan nilai perolehan aset tetap.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {error && (
                    <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="aset-nama">Nama Aset</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSmartRecommendation}
                        className="h-6 px-2 text-[11px] text-terra hover:bg-terra/10"
                      >
                        <Sparkles data-icon="inline-start" />
                        Rekomendasi Cerdas SAK EMKM
                      </Button>
                    </div>
                    <Input
                      id="aset-nama"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Laptop MacBook Pro M3 Kantor"
                      required
                      aria-invalid={!!error && !name.trim()}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aset-kategori">Kategori Aset</Label>
                      <select
                        id="aset-kategori"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as Category)}
                        className="h-9 w-full rounded-lg border border-rule bg-canvas px-3 text-xs text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra"
                      >
                        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
                          <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aset-tgl-beli">Tanggal Pembelian</Label>
                      <Input
                        id="aset-tgl-beli"
                        type="date"
                        value={acquisitionDate}
                        onChange={(e) => setAcquisitionDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aset-tgl-pakai">Tanggal Mulai Digunakan</Label>
                      <Input
                        id="aset-tgl-pakai"
                        type="date"
                        value={inServiceDate}
                        onChange={(e) => setInServiceDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aset-harga">Harga Perolehan (Rp)</Label>
                      <Input
                        id="aset-harga"
                        value={acquisitionCostText}
                        onChange={(e) => setAcquisitionCostText(e.target.value)}
                        placeholder="Contoh: 15.000.000"
                        inputMode="numeric"
                        required
                        aria-invalid={!!error && costMinor === null}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aset-residu">Nilai Residu / Sisa (Rp)</Label>
                      <Input
                        id="aset-residu"
                        value={salvageValueText}
                        onChange={(e) => setSalvageValueText(e.target.value)}
                        placeholder="0"
                        inputMode="numeric"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aset-catatan">Catatan (Opsional)</Label>
                      <Textarea
                        id="aset-catatan"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="No. seri, lokasi barang, no. faktur pembelian…"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Section 2 — Penyusutan */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Penyusutan</CardTitle>
                <CardDescription>Masa manfaat dan metode sesuai SAK EMKM.</CardDescription>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="popLayout" initial={false}>
                  {isTanah ? (
                    <motion.div
                      key="tanah-note"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="flex items-start gap-2.5 rounded-xl border border-rule bg-canvas/60 p-3.5 text-xs text-ink-soft"
                    >
                      <Info className="size-4 shrink-0 text-terra" />
                      <span>Tanah tidak disusutkan — nilai buku mengikuti harga perolehan sampai dilepas.</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="susut-form"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="grid grid-cols-1 gap-4 md:grid-cols-2"
                    >
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="aset-metode">Metode Penyusutan</Label>
                        <select
                          id="aset-metode"
                          value={depreciationMethod}
                          onChange={(e) => setDepreciationMethod(e.target.value as Method)}
                          className="h-9 w-full rounded-lg border border-rule bg-canvas px-3 text-xs text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra"
                        >
                          <option value="STRAIGHT_LINE">Garis Lurus (Straight-Line)</option>
                          <option value="DECLINING_BALANCE">Saldo Menurun (Declining Balance)</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="aset-masa">Masa Manfaat (Bulan)</Label>
                        <Input
                          id="aset-masa"
                          type="number"
                          min={1}
                          value={usefulLifeMonths}
                          onChange={(e) => setUsefulLifeMonths(parseInt(e.target.value, 10))}
                          required
                        />
                        <span className="text-[11px] text-ink-soft">
                          {Math.floor((Number(usefulLifeMonths) || 0) / 12)} tahun {(Number(usefulLifeMonths) || 0) % 12} bulan
                        </span>
                      </div>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {depreciationMethod === "DECLINING_BALANCE" && (
                          <motion.div
                            key="declining-rate"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.2, ease: EASE_OUT }}
                            className="flex flex-col gap-1.5"
                          >
                            <Label htmlFor="aset-tarif">Tarif Saldo Menurun (% / Tahun)</Label>
                            <Input
                              id="aset-tarif"
                              type="number"
                              step="0.01"
                              value={decliningRateText}
                              onChange={(e) => setDecliningRateText(e.target.value)}
                              placeholder="Contoh: 25.00"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Section 3 — Jurnal Perolehan + COA */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Jurnal Perolehan Otomatis</CardTitle>
                <CardDescription>
                  Sistem memposting Dr Akun Aset / Cr akun lawan dalam satu transaksi atomik bersama pendaftaran aset.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  <label htmlFor="aset-post-jurnal" className="flex cursor-pointer items-start gap-3 rounded-xl border border-rule bg-canvas/60 p-3.5">
                    <input
                      id="aset-post-jurnal"
                      type="checkbox"
                      checked={postAcquisition}
                      onChange={(e) => setPostAcquisition(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-terra"
                    />
                    <span>
                      <span className="block text-xs font-semibold text-ink">Catat jurnal perolehan saat menyimpan</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-soft">
                        Matikan jika pembelian sudah terjurnal manual — aset hanya masuk register tanpa menyentuh buku besar.
                      </span>
                    </span>
                  </label>

                  <AnimatePresence mode="popLayout" initial={false}>
                    {postAcquisition && (
                      <motion.div
                        key="akun-lawan"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: EASE_OUT }}
                        className="flex flex-col gap-1.5"
                      >
                        <Label htmlFor="aset-lawan">Akun Lawan (Sumber Dana)</Label>
                        <select
                          id="aset-lawan"
                          value={counterAccountId}
                          onChange={(e) => setCounterAccountId(e.target.value)}
                          className="h-9 w-full rounded-lg border border-rule bg-canvas px-3 text-xs text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra"
                        >
                          {cashBank.length > 0 && (
                            <optgroup label="Kas & Bank (tunai)">
                              {cashBank.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {payable.length > 0 && (
                            <optgroup label="Utang Usaha (kredit)">
                              {payable.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {equity.length > 0 && (
                            <optgroup label="Ekuitas / Modal (migrasi saldo awal)">
                              {equity.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </optgroup>
                          )}
                          {otherCounter.length > 0 && (
                            <optgroup label="Akun lain">
                              {otherCounter.map((a) => (
                                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Separator />

                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold text-ink">Pemetaan Akun Buku Besar (COA)</span>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="aset-coa-aset" className="text-[11px]">Akun Aset</Label>
                        <select
                          id="aset-coa-aset"
                          value={assetAccountId}
                          onChange={(e) => setAssetAccountId(e.target.value)}
                          className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink"
                        >
                          {(assetAccounts.length > 0 ? assetAccounts : leaves).map((a) => (
                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="aset-coa-akum" className="text-[11px]">Akun Akumulasi</Label>
                        <select
                          id="aset-coa-akum"
                          value={accumulatedDepAccountId}
                          onChange={(e) => setAccumulatedDepAccountId(e.target.value)}
                          className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink"
                        >
                          {(depAccounts.length > 0 ? depAccounts : leaves).map((a) => (
                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="aset-coa-beban" className="text-[11px]">Akun Beban Penyusutan</Label>
                        <select
                          id="aset-coa-beban"
                          value={depreciationExpenseAccountId}
                          onChange={(e) => setDepreciationExpenseAccountId(e.target.value)}
                          className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink"
                        >
                          {(expAccounts.length > 0 ? expAccounts : leaves).map((a) => (
                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        </Stagger>

        {/* Panel pratinjau live */}
        <Reveal delay={0.12} className="lg:sticky lg:top-6">
          <div className="flex flex-col gap-4">
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-ink">
                  <Scale className="size-4 text-terra" />
                  Pratinjau Jurnal
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="popLayout" initial={false}>
                  {!postAcquisition ? (
                    <motion.p
                      key="jurnal-off"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="text-xs leading-relaxed text-ink-soft"
                    >
                      Jurnal perolehan dimatikan — aset hanya masuk register tanpa menyentuh buku besar.
                    </motion.p>
                  ) : !journalValid ? (
                    <motion.p
                      key="jurnal-empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="text-xs leading-relaxed text-ink-soft"
                    >
                      Lengkapi harga perolehan serta akun aset & lawan untuk melihat jurnal.
                    </motion.p>
                  ) : (
                    <motion.div
                      key="jurnal-lines"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0">
                          <span className="mr-1.5 inline-block w-4 font-mono font-bold text-emerald-600">D</span>
                          <span className="font-mono font-medium text-ink">{assetAccount?.code}</span>
                          <span className="mx-1 text-ink-soft">·</span>
                          <span className="truncate text-ink">{assetAccount?.name}</span>
                        </span>
                        <span className="tnum shrink-0 font-medium text-ink">
                          {costMinor !== null ? Money.fromMinor(costMinor).formatIdr() : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="min-w-0">
                          <span className="mr-1.5 inline-block w-4 pl-4 font-mono font-bold text-terra">K</span>
                          <span className="font-mono font-medium text-ink">{counterAccount?.code}</span>
                          <span className="mx-1 text-ink-soft">·</span>
                          <span className="truncate text-ink">{counterAccount?.name}</span>
                        </span>
                        <span className="tnum shrink-0 font-medium text-ink">
                          {costMinor !== null ? Money.fromMinor(costMinor).formatIdr() : "—"}
                        </span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-ink-soft">Tanggal: {acquisitionDate || "—"}</span>
                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-700">
                          Seimbang
                        </Badge>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-ink">
                  <ReceiptText className="size-4 text-terra" />
                  Ringkasan Penyusutan
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isTanah ? (
                  <p className="text-xs leading-relaxed text-ink-soft">Tanah tidak disusutkan.</p>
                ) : monthlyMinor !== null ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="tnum font-display text-2xl font-semibold tracking-tight text-ink">
                      <AnimatedNumber minor={monthlyMinor} />
                    </span>
                    <span className="text-[11px] text-ink-soft">
                      beban per bulan · {Math.floor((Number(usefulLifeMonths) || 0) / 12)} thn {(Number(usefulLifeMonths) || 0) % 12} bln
                      {depreciableBasis !== null && depreciableBasis > 0n && (
                        <> · dasar susut {Money.fromMinor(depreciableBasis).formatIdr()}</>
                      )}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="border-rule text-[11px] text-ink-soft">
                        {CATEGORY_LABEL[category]}
                      </Badge>
                      <Badge variant="outline" className="border-rule text-[11px] text-ink-soft">
                        {depreciationMethod === "STRAIGHT_LINE" ? "Garis Lurus" : "Saldo Menurun"}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-ink-soft">
                    Isi harga, masa manfaat, dan tanggal pakai untuk estimasi beban bulanan.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </Reveal>
      </div>
    </form>
  );
}
