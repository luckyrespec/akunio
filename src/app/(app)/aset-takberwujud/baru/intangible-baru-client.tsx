"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Sparkles, Scale, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  createIntangibleWithAcquisitionAction,
  recommendIntangibleSakAction,
} from "@/server/actions/intangible.actions";
import type { IntangibleCategory } from "@/server/db/repos/intangible-assets.repo";

type Category = IntangibleCategory;

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
  LISENSI_SOFTWARE: "Lisensi Software",
  HAK_CIPTA: "Hak Cipta",
  PATEN: "Paten",
  MEREK_DAGANG: "Merek Dagang",
  GOODWILL: "Goodwill",
  LAINNYA: "Lainnya",
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

export function IntangibleBaruClient({ accounts }: { accounts: AccountOption[] }) {
  const router = useRouter();

  const leaves = useMemo(
    () => accounts.filter((a) => !accounts.some((c) => c.parentCode === a.code)),
    [accounts],
  );
  const assetAccounts = useMemo(
    () => leaves.filter((a) => a.type === "ASET" && a.code.startsWith("17")),
    [leaves],
  );
  const accumAccounts = useMemo(
    () => leaves.filter((a) => a.type === "ASET" && a.code.startsWith("18")),
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
  const [category, setCategory] = useState<Category>("LISENSI_SOFTWARE");
  const [acquisitionDate, setAcquisitionDate] = useState(todayISO);
  const [inServiceDate, setInServiceDate] = useState(todayISO);
  const [acquisitionCostText, setAcquisitionCostText] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(48);
  const [assetAccountId, setAssetAccountId] = useState(
    assetAccounts[0]?.id || leaves[0]?.id || "",
  );
  const [accumulatedAccountId, setAccumulatedAccountId] = useState(
    accumAccounts[0]?.id || leaves[0]?.id || "",
  );
  const [amortizationExpenseAccountId, setAmortizationExpenseAccountId] = useState(
    expAccounts[0]?.id || leaves[0]?.id || "",
  );
  const [postAcquisition, setPostAcquisition] = useState(true);
  const [counterAccountId, setCounterAccountId] = useState(
    cashBank[0]?.id || leaves[0]?.id || "",
  );
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recLoading, setRecLoading] = useState(false);
  const [recAnalysis, setRecAnalysis] = useState<{
    text: string;
    sakRef: string;
    heuristic: boolean;
  } | null>(null);

  const costMinor = tryParseIdr(acquisitionCostText);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const assetAccount = accountById.get(assetAccountId);
  const counterAccount = accountById.get(counterAccountId);

  const monthlyMinor = useMemo(() => {
    if (costMinor === null || costMinor <= 0n) return null;
    const life = Number(usefulLifeMonths);
    if (!Number.isFinite(life) || life <= 0) return null;
    return costMinor / BigInt(Math.floor(life));
  }, [costMinor, usefulLifeMonths]);

  const journalValid =
    postAcquisition && costMinor !== null && costMinor > 0n && !!assetAccount && !!counterAccount && assetAccountId !== counterAccountId;

  const handleSmartRecommendation = async () => {
    if (!name.trim()) {
      setRecAnalysis(null);
      setError("Isi nama aset terlebih dahulu agar rekomendasi bisa menganalisis kategori dan masa manfaat.");
      return;
    }
    setRecLoading(true);
    setError(null);
    try {
      const res = await recommendIntangibleSakAction({ name: name.trim(), category });
      if (!res.ok || !res.data) {
        setRecAnalysis(null);
        setError(res.error || "Rekomendasi gagal. Atur kategori dan masa manfaat manual.");
        return;
      }
      const rec = res.data;
      setCategory(rec.category as Category);
      setUsefulLifeMonths(rec.usefulLifeMonths);
      setRecAnalysis({ text: rec.analysis, sakRef: rec.sakRef, heuristic: rec.heuristic });
    } catch (err) {
      setRecAnalysis(null);
      setError(err instanceof Error ? err.message : "Rekomendasi gagal.");
    } finally {
      setRecLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await createIntangibleWithAcquisitionAction({
        name,
        category,
        acquisitionDate,
        inServiceDate,
        acquisitionCostText,
        usefulLifeMonths: Number(usefulLifeMonths),
        assetAccountId,
        accumulatedAccountId,
        amortizationExpenseAccountId,
        notes,
        postAcquisition,
        counterAccountId: postAcquisition ? counterAccountId : undefined,
      });
      if (!res.ok || !res.data) {
        setError(res.error || "Gagal menyimpan aset.");
        return;
      }
      router.push(`/aset-takberwujud/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title="Tambah Aset Takberwujud"
        eyebrow="Daftarkan lisensi/merek, atur amortisasi SAK EMKM Bab 12, dan otomatis catat jurnal perolehan."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push("/aset-takberwujud")}
              className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
            >
              Batal
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="h-9 rounded-xl px-5 bg-terra text-white hover:bg-terra/90 text-xs font-semibold transition-transform active:scale-[0.98] disabled:transform-none shadow-none"
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
          </div>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <Stagger className="flex flex-col gap-6" staggerDelay={0.07}>
          {/* Section 1 — Informasi Aset */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Informasi Aset</CardTitle>
                <CardDescription>Identitas dan nilai perolehan aset takberwujud.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {error && (
                    <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="itb-nama">Nama Aset</Label>
                    <Input
                      id="itb-nama"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Lisensi Akuntansi Awan Tahunan"
                      required
                      aria-invalid={!!error && !name.trim()}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="itb-kategori">Kategori Aset</Label>
                      <select
                        id="itb-kategori"
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
                      <Label htmlFor="itb-tgl-beli">Tanggal Perolehan</Label>
                      <Input
                        id="itb-tgl-beli"
                        type="date"
                        value={acquisitionDate}
                        onChange={(e) => setAcquisitionDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="itb-tgl-pakai">Tanggal Mulai Dimanfaatkan</Label>
                      <Input
                        id="itb-tgl-pakai"
                        type="date"
                        value={inServiceDate}
                        onChange={(e) => setInServiceDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="itb-harga">Harga Perolehan (Rp)</Label>
                      <Input
                        id="itb-harga"
                        value={acquisitionCostText}
                        onChange={(e) => setAcquisitionCostText(e.target.value)}
                        placeholder="Contoh: 12.000.000"
                        inputMode="numeric"
                        required
                        aria-invalid={!!error && costMinor === null}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 md:col-span-2">
                      <Label htmlFor="itb-catatan">Catatan (Opsional)</Label>
                      <Textarea
                        id="itb-catatan"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Masa berlaku lisensi, nomor sertifikat merek…"
                        rows={2}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Section 2 — Amortisasi */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Amortisasi</CardTitle>
                <CardDescription>Masa manfaat garis lurus sesuai SAK EMKM Bab 12.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex flex-col gap-2.5">
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSmartRecommendation}
                      disabled={recLoading}
                      className="h-8 border-terra/40 text-xs text-terra hover:bg-terra/10"
                    >
                      {recLoading ? (
                        <Loader2 data-icon="inline-start" className="animate-spin" />
                      ) : (
                        <Sparkles data-icon="inline-start" />
                      )}
                      {recLoading ? "Menganalisis…" : "Rekomendasi Cerdas SAK EMKM"}
                    </Button>
                  </div>
                  {recAnalysis && (
                    <div
                      role="status"
                      className="rounded-xl border border-terra/25 bg-terra/[0.07] p-3.5 text-xs leading-relaxed"
                    >
                      <p className="font-semibold text-ink">
                        Hasil analisis
                        <span className="ml-2 rounded-full border border-rule bg-paper px-2 py-0.5 text-[10px] font-medium text-ink-soft">
                          {recAnalysis.sakRef}
                        </span>
                        {recAnalysis.heuristic && (
                          <span className="ml-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            Mode luring
                          </span>
                        )}
                      </p>
                      <p className="mt-1.5 text-ink-soft">{recAnalysis.text}</p>
                      <p className="mt-1.5 text-[11px] text-ink-soft">
                        Nilai di atas sudah diterapkan ke formulir — sesuaikan bila perlu.
                      </p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="itb-masa">Masa Manfaat (Bulan)</Label>
                    <Input
                      id="itb-masa"
                      type="number"
                      min={1}
                      value={usefulLifeMonths}
                      onChange={(e) => setUsefulLifeMonths(parseInt(e.target.value, 10))}
                      required
                    />
                    <span className="text-[11px] text-ink-soft">
                      {Math.floor((Number(usefulLifeMonths) || 0) / 12)} tahun {(Number(usefulLifeMonths) || 0) % 12} bulan · garis lurus
                    </span>
                  </div>
                </div>
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
                  <label htmlFor="itb-post-jurnal" className="flex cursor-pointer items-start gap-3 rounded-xl border border-rule bg-canvas/60 p-3.5">
                    <input
                      id="itb-post-jurnal"
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
                        <Label htmlFor="itb-lawan">Akun Lawan (Sumber Dana)</Label>
                        <select
                          id="itb-lawan"
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
                        <Label htmlFor="itb-coa-aset" className="text-[11px]">Akun Aset</Label>
                        <select
                          id="itb-coa-aset"
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
                        <Label htmlFor="itb-coa-akum" className="text-[11px]">Akun Akumulasi</Label>
                        <select
                          id="itb-coa-akum"
                          value={accumulatedAccountId}
                          onChange={(e) => setAccumulatedAccountId(e.target.value)}
                          className="w-full rounded-md border border-rule bg-canvas px-2.5 py-1.5 text-xs text-ink"
                        >
                          {(accumAccounts.length > 0 ? accumAccounts : leaves).map((a) => (
                            <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="itb-coa-beban" className="text-[11px]">Akun Beban Amortisasi</Label>
                        <select
                          id="itb-coa-beban"
                          value={amortizationExpenseAccountId}
                          onChange={(e) => setAmortizationExpenseAccountId(e.target.value)}
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
                  Ringkasan Amortisasi
                </CardTitle>
              </CardHeader>
              <CardContent>
                {monthlyMinor !== null ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="tnum font-display text-2xl font-semibold tracking-tight text-ink">
                      <AnimatedNumber minor={monthlyMinor} />
                    </span>
                    <span className="text-[11px] text-ink-soft">
                      beban per bulan · {Math.floor((Number(usefulLifeMonths) || 0) / 12)} thn {(Number(usefulLifeMonths) || 0) % 12} bln · garis lurus
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="border-rule text-[11px] text-ink-soft">
                        {CATEGORY_LABEL[category]}
                      </Badge>
                      <Badge variant="outline" className="border-rule text-[11px] text-ink-soft">
                        SAK EMKM Bab 12
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
