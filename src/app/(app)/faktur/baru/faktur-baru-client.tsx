"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Plus, Trash2, FileText, Scale, ArrowLeft, ArrowRight, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SplitButton } from "@/components/ui/split-button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion";
import { TemplateFormal, type InvoiceDetailData } from "@/components/invoicing/template-formal";
import { Money } from "@/core/money/money";
import { calculateInvoiceTotals } from "@/core/invoicing/calculations";
import { createInvoiceWithPostingAction } from "@/server/actions/invoice.actions";
import type { InvoiceType } from "@/server/db/schema/invoicing";
import { cn } from "@/lib/utils";

export interface ContactOption {
  id: string;
  name: string;
  type: string;
  paymentTermsDays: number;
}

export interface CatalogOption {
  id: string;
  name: string;
  itemType: "BARANG" | "JASA";
  priceMinor: string;
  qty: string;
  unit: string;
}

interface ItemRow {
  id: string;
  description: string;
  catalogItemId: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function dueFromTerms(fromISO: string, days: number) {
  const d = new Date(fromISO || todayISO());
  d.setDate(d.getDate() + (days || 30));
  return d.toISOString().slice(0, 10);
}

function emptyRow(): ItemRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: "",
    catalogItemId: null,
    quantity: "1",
    unitPrice: "",
    discount: "0",
    taxRate: "0",
  };
}

/** Teks rupiah desimal ("500000", "10000.55") → minor eksak. Tanpa parseFloat. */
function toMinorSafe(numText: string): bigint {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(numText.trim().replace(",", "."));
  if (!m) return 0n;
  const sign = m[1] ? -1n : 1n;
  const frac3 = (m[3] ?? "").padEnd(3, "0").slice(0, 3);
  let minor = BigInt(m[2]) * 100n + BigInt(frac3.slice(0, 2));
  if (frac3[2]! >= "5") minor += 1n;
  return sign * minor;
}

export function FakturBaruClient({
  contacts,
  initialType,
  orgName,
  catalog,
  recordingMethod,
}: {
  contacts: ContactOption[];
  initialType: InvoiceType;
  orgName: string;
  catalog: CatalogOption[];
  recordingMethod: "PERPETUAL" | "PERIODIC";
}) {
  const router = useRouter();

  const contactsFor = React.useCallback(
    (t: InvoiceType) =>
      contacts.filter((c) =>
        t === "INVOICE" ? c.type === "CUSTOMER" || c.type === "BOTH" : c.type === "VENDOR" || c.type === "BOTH",
      ),
    [contacts],
  );

  const [type, setType] = useState<InvoiceType>(initialType);
  const [contactId, setContactId] = useState(() => contactsFor(initialType)[0]?.id || "");
  const [issueDate, setIssueDate] = useState(todayISO);
  const [dueDate, setDueDate] = useState(() =>
    dueFromTerms(todayISO(), contactsFor(initialType)[0]?.paymentTermsDays || 30),
  );
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [postToLedger, setPostToLedger] = useState(true);
  const [view, setView] = useState<"form" | "preview">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postWarning, setPostWarning] = useState<{ id: string; message: string } | null>(null);
  const [flash, setFlash] = useState<{ id: string; number: string } | null>(null);

  const isInvoice = type === "INVOICE";

  function handleTypeChange(t: InvoiceType) {
    setType(t);
    setPostWarning(null);
    const list = contactsFor(t);
    const first = list[0];
    setContactId(first?.id || "");
    setDueDate(dueFromTerms(issueDate, first?.paymentTermsDays || 30));
    try {
      const url = t === "BILL" ? "/faktur/baru?tipe=bill" : "/faktur/baru?tipe=invoice";
      window.history.replaceState(null, "", url);
    } catch {}
  }

  function handleContactChange(id: string) {
    setContactId(id);
    const found = contacts.find((c) => c.id === id);
    if (found) setDueDate(dueFromTerms(issueDate, found.paymentTermsDays || 30));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeItem(id: string) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function updateItem(id: string, field: keyof ItemRow, val: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: val } : it)));
  }

  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  /** Ketik nama persis katalog -> tautkan (auto-harga); teks bebas -> baris manual. */
  function handleDescriptionChange(id: string, val: string) {
    const match = catalog.find((c) => c.name.toLowerCase() === val.trim().toLowerCase()) ?? null;
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              description: val,
              catalogItemId: match?.id ?? null,
              unitPrice: match ? String(Number(match.priceMinor) / 100) : it.unitPrice,
            }
          : it,
      ),
    );
  }

  function stockWarning(it: ItemRow): string | null {
    if (!it.catalogItemId || recordingMethod !== "PERPETUAL") return null;
    const entry = catalogById.get(it.catalogItemId);
    if (!entry || entry.itemType !== "BARANG") return null;
    const qty = parseFloat(it.quantity) || 0;
    const stock = parseFloat(entry.qty) || 0;
    if (qty > stock) {
      return `Stok tidak cukup (sisa ${entry.qty} ${entry.unit}) — tetap bisa simpan, stok akan minus.`;
    }
    return null;
  }

  const totals = useMemo(() => {
    return calculateInvoiceTotals(
      items.map((it) => ({
        quantity: parseFloat(it.quantity) || 0,
        unitPriceMinor: toMinorSafe(it.unitPrice),
        discountMinor: toMinorSafe(it.discount),
        taxRatePercent: parseFloat(it.taxRate) || 0,
      })),
      0n,
    );
  }, [items]);

  const selectedContact = contacts.find((c) => c.id === contactId);
  const netSubtotal = totals.subtotalMinor - totals.discountMinor;

  const draft: InvoiceDetailData = {
    id: "draft",
    type,
    invoiceNumber: isInvoice ? "INV-DRAF" : "BILL-DRAF",
    issueDate: issueDate || todayISO(),
    dueDate: dueDate || issueDate || todayISO(),
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    amountPaidMinor: 0n,
    status: "ISSUED",
    notes: notes || null,
    orgName,
    contact: {
      id: selectedContact?.id || "-",
      name: selectedContact?.name || "(Pilih kontak)",
      phone: null,
      email: null,
      address: null,
      taxId: null,
    },
    items: items.map((it, i) => ({
      id: it.id,
      description: it.description || `(Item ${i + 1})`,
      quantity: it.quantity || "0",
      unitPriceMinor: toMinorSafe(it.unitPrice),
      discountMinor: toMinorSafe(it.discount),
      taxRatePercent: it.taxRate || "0",
      totalMinor: totals.items[i]?.totalMinor ?? 0n,
    })),
    payments: [],
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitWithMode("publish");
  }

  function resetForm() {
    setItems([emptyRow()]);
    setNotes("");
    setError(null);
    setPostWarning(null);
  }

  async function submitWithMode(mode: "publish" | "publish-new") {
    setError(null);
    setPostWarning(null);
    setFlash(null);
    if (!contactId) {
      setError("Silakan pilih mitra kontak.");
      return;
    }
    if (items.some((it) => !it.description.trim() || !it.unitPrice)) {
      setError("Semua baris item wajib memiliki deskripsi dan harga satuan.");
      return;
    }
    setLoading(true);
    try {
      const res = await createInvoiceWithPostingAction(
        {
          type,
          contactId,
          issueDate,
          dueDate: dueDate || issueDate,
          notes: notes.trim() || null,
        },
        items.map((it) => ({
          description: it.description.trim(),
          catalogItemId: it.catalogItemId,
          quantity: it.quantity,
          unitPriceMinor: toMinorSafe(it.unitPrice),
          discountMinor: toMinorSafe(it.discount),
          taxRatePercent: it.taxRate,
        })),
        postToLedger,
      );
      if (!res.ok || !res.data) {
        setError(res.error || "Gagal membuat faktur.");
        return;
      }
      if (res.data.postWarning) {
        setPostWarning({ id: res.data.invoice.id, message: res.data.postWarning });
        return;
      }
      if (mode === "publish-new") {
        setFlash({ id: res.data.invoice.id, number: res.data.invoice.invoiceNumber });
        resetForm();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        router.push(`/faktur/${res.data.invoice.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat faktur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PageHeader
        title={isInvoice ? "Buat Faktur Penjualan" : "Catat Tagihan Pembelian"}
        eyebrow="Susun rincian item, pratinjau dokumen live, dan otomatis posting ke jurnal."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* View Selector Pill */}
            <div className="flex items-center rounded-xl border border-rule bg-paper p-1 shadow-xs" role="tablist" aria-label="Tampilan editor">
              {(["form", "preview"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "relative rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
                    view === v ? "text-terra font-semibold" : "text-ink-soft hover:text-ink",
                  )}
                >
                  {view === v && (
                    <motion.span
                      layoutId="faktur-baru-view-pill"
                      transition={{ duration: 0.24, ease: EASE_OUT }}
                      className="absolute inset-0 rounded-lg bg-canvas shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{v === "form" ? "Formulir" : "Pratinjau"}</span>
                </button>
              ))}
            </div>

            {/* Actions: Batal & Terbitkan */}
            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push("/faktur")}
                className="h-9 px-4 text-xs font-medium rounded-xl border-rule bg-paper hover:bg-canvas text-ink-soft hover:text-ink transition-colors shadow-xs"
              >
                Batal
              </Button>

              <SplitButton
                primaryType="submit"
                disabled={loading}
                loading={loading}
                menuLabel="Opsi penerbitan lainnya"
                items={[
                  {
                    label: isInvoice ? "Terbitkan Faktur" : "Catat Tagihan",
                    onSelect: () => void submitWithMode("publish"),
                  },
                  {
                    label: isInvoice ? "Terbitkan & Buat Lagi" : "Catat & Buat Lagi",
                    onSelect: () => void submitWithMode("publish-new"),
                  },
                ]}
              >
                {loading ? "Memproses..." : isInvoice ? "Terbitkan Faktur" : "Catat Tagihan"}
              </SplitButton>
            </div>
          </div>
        }
      />

      {flash?.id && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-debit/25 bg-debit/10 px-4 py-3 text-xs">
          <span className="text-ink">
            Faktur <strong className="tnum font-semibold">{flash.number}</strong> terbit. Formulir sudah dikosongkan untuk faktur berikutnya.
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] border-rule bg-paper" onClick={() => router.push(`/faktur/${flash.id}`)}>
              Lihat Detail
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setFlash(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}

      {/* Gerbang jenis dokumen — keputusan utama, selebar penuh */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Jenis dokumen">
        {(
          [
            {
              t: "INVOICE" as const,
              name: "Penjualan",
              desc: "Tagih pelanggan — menambah piutang usaha.",
              icon: ArrowUpRight,
              tint: "bg-terra/10 text-terra",
            },
            {
              t: "BILL" as const,
              name: "Pembelian",
              desc: "Catat tagihan vendor — menambah utang usaha.",
              icon: ArrowDownLeft,
              tint: "bg-credit/10 text-credit",
            },
          ]
        ).map((opt) => {
          const selected = type === opt.t;
          const Icon = opt.icon;
          return (
            <button
              key={opt.t}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handleTypeChange(opt.t)}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-4 text-left shadow-2xs transition-colors",
                selected
                  ? "border-terra/50 bg-terra/[0.06] ring-1 ring-terra/30"
                  : "border-rule bg-paper hover:border-terra/30 hover:bg-canvas/50",
              )}
            >
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", opt.tint)}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{opt.name}</span>
                <span className="mt-0.5 block text-xs text-ink-soft">{opt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {view === "form" ? (
          <motion.div
            key="form-view"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
      <div className="w-full">
        <Stagger className="flex min-w-0 flex-col gap-6" staggerDelay={0.07}>
          {/* Section 1 — Pihak & tanggal */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <div>
                  <CardTitle className="font-display text-base text-ink">
                    {isInvoice ? "Pelanggan & Tanggal" : "Pemasok & Tanggal"}
                  </CardTitle>
                  <CardDescription>
                    {isInvoice ? "Kepada siapa faktur ini ditagihkan." : "Dari vendor mana tagihan ini diterima."}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {error && (
                    <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
                      {error}
                    </div>
                  )}
                  {postWarning && (
                    <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-semibold">Faktur tersimpan, tetapi jurnal gagal diposting:</p>
                      <p className="mt-0.5">{postWarning.message}</p>
                      <Link href={`/faktur/${postWarning.id}`} className="mt-1.5 inline-flex items-center gap-1 font-medium text-terra hover:underline">
                        Buka faktur untuk posting manual <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="fk-kontak">{isInvoice ? "Pelanggan *" : "Pemasok *"}</Label>
                      <select
                        id="fk-kontak"
                        value={contactId}
                        onChange={(e) => handleContactChange(e.target.value)}
                        className="h-9 w-full rounded-lg border border-rule bg-canvas px-3 text-xs text-ink shadow-2xs focus:outline-none focus:ring-1 focus:ring-terra"
                        required
                      >
                        <option value="" disabled>Pilih Kontak</option>
                        {contactsFor(type).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="fk-terbit">Tanggal Terbit</Label>
                      <Input
                        id="fk-terbit"
                        type="date"
                        value={issueDate}
                        onChange={(e) => setIssueDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="fk-tempo">Jatuh Tempo</Label>
                      <Input
                        id="fk-tempo"
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fk-catatan">Catatan / Info Pembayaran</Label>
                    <Textarea
                      id="fk-catatan"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Contoh: Transfer ke BCA 1234567890 a/n Perusahaan, maksimal 30 hari"
                      rows={2}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Section 2 — Rincian item */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="font-display text-base text-ink">Rincian Barang / Jasa</CardTitle>
                    <CardDescription>{items.length} baris · total dihitung otomatis.</CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addItem}
                    className="h-8 border-rule text-xs"
                  >
                    <Plus data-icon="inline-start" />
                    Tambah Baris
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Deskripsi</TableHead>
                      <TableHead className="w-16 text-center">Qty</TableHead>
                      <TableHead className="w-32 text-right">Harga</TableHead>
                      <TableHead className="w-28 text-right">Diskon</TableHead>
                      <TableHead className="w-20 text-center">PPN</TableHead>
                      <TableHead className="w-28 text-right">Jumlah</TableHead>
                      <TableHead className="w-10"><span className="sr-only">Aksi</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout" initial={false}>
                      {items.map((it, idx) => (
                        <motion.tr
                          key={it.id}
                          layout
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.99 }}
                          transition={{ duration: 0.2, ease: EASE_OUT }}
                          className="border-b border-rule/60 last:border-0"
                        >
                          <TableCell>
                            <Input
                              placeholder={`Item ${idx + 1} — ketik / pilih barang/jasa`}
                              value={it.description}
                              onChange={(e) => handleDescriptionChange(it.id, e.target.value)}
                              list={`fk-catalog-${it.id}`}
                              data-testid="faktur-item-picker"
                              className="h-8 bg-paper text-xs"
                              aria-label={`Deskripsi baris ${idx + 1}`}
                              autoComplete="off"
                            />
                            <datalist id={`fk-catalog-${it.id}`}>
                              {catalog.map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.itemType === "BARANG" ? `Barang · ${c.qty} ${c.unit}` : "Jasa · tanpa stok"}
                                </option>
                              ))}
                            </datalist>
                            {it.catalogItemId && catalogById.get(it.catalogItemId) && (
                              <p data-testid="faktur-item-terikat" className="mt-1 text-[10px] text-ink-soft">
                                {catalogById.get(it.catalogItemId)!.itemType === "BARANG"
                                  ? `Barang · Stok: ${catalogById.get(it.catalogItemId)!.qty} ${catalogById.get(it.catalogItemId)!.unit}`
                                  : "Jasa · tanpa stok"}
                              </p>
                            )}
                            {stockWarning(it) && (
                              <p data-testid="faktur-stok-warning" role="status" className="mt-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                {stockWarning(it)}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={it.quantity}
                              onChange={(e) => updateItem(it.id, "quantity", e.target.value)}
                              className="h-8 bg-paper text-center text-xs"
                              aria-label={`Kuantitas baris ${idx + 1}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={it.unitPrice}
                              onChange={(e) => updateItem(it.id, "unitPrice", e.target.value)}
                              placeholder="Rp"
                              className="tnum h-8 bg-paper text-right text-xs"
                              aria-label={`Harga satuan baris ${idx + 1}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="0"
                              value={it.discount}
                              onChange={(e) => updateItem(it.id, "discount", e.target.value)}
                              placeholder="Rp"
                              className="tnum h-8 bg-paper text-right text-xs"
                              aria-label={`Diskon baris ${idx + 1}`}
                            />
                          </TableCell>
                          <TableCell>
                            <select
                              value={it.taxRate}
                              onChange={(e) => updateItem(it.id, "taxRate", e.target.value)}
                              className="w-full rounded-md border border-rule bg-paper px-1 py-1.5 text-center text-[11px] text-ink focus:outline-none focus:ring-1 focus:ring-terra"
                              aria-label={`PPN baris ${idx + 1}`}
                            >
                              <option value="0">0%</option>
                              <option value="11">11%</option>
                              <option value="12">12%</option>
                            </select>
                          </TableCell>
                          <TableCell className="tnum text-right text-xs font-medium text-ink">
                            {Money.fromMinor(totals.items[idx]?.totalMinor ?? 0n).formatIdr()}
                          </TableCell>
                          <TableCell className="text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(it.id)}
                              disabled={items.length <= 1}
                              className="rounded-md p-1.5 text-ink-soft transition-colors hover:bg-rose-500/10 hover:text-destructive disabled:opacity-30"
                              aria-label={`Hapus baris ${idx + 1}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </StaggerItem>

          {/* Section 3 — Posting jurnal */}
          <StaggerItem>
            <Card className="border-rule bg-paper shadow-xs">
              <CardHeader>
                <CardTitle className="font-display text-base text-ink">Posting ke Jurnal</CardTitle>
                <CardDescription>
                  {isInvoice
                    ? "Dr 1200 Piutang Usaha / Cr 4100 Pendapatan + 2200 PPN Keluaran."
                    : "Dr 5100 Beban/Pembelian + 1400 PPN Masukan / Cr 2100 Utang Usaha."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <label htmlFor="fk-posting" className="flex cursor-pointer items-start gap-3 rounded-xl border border-rule bg-canvas/60 p-3.5">
                  <input
                    id="fk-posting"
                    type="checkbox"
                    checked={postToLedger}
                    onChange={(e) => setPostToLedger(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-terra"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-ink">Langsung posting ke jurnal saat diterbitkan</span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-soft">
                      Matikan jika dokumen ini hanya arsip — Anda tetap bisa mempostingnya dari daftar faktur.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
          </StaggerItem>

          <div className="flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setView("preview")}
              className="border-terra/40 text-terra hover:bg-terra/10"
            >
              <FileText data-icon="inline-start" />
              Lihat Pratinjau
            </Button>
          </div>
        </Stagger>
      </div>
          </motion.div>
        ) : (
          <motion.div
            key="preview-view"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <TemplateFormal invoice={draft} />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          {(error || postWarning) && (
            <div className="flex flex-col gap-3">
              {error && (
                <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </div>
              )}
              {postWarning && (
                <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-semibold">Faktur tersimpan, tetapi jurnal gagal diposting:</p>
                  <p className="mt-0.5">{postWarning.message}</p>
                  <Link href={`/faktur/${postWarning.id}`} className="mt-1.5 inline-flex items-center gap-1 font-medium text-terra hover:underline">
                    Buka faktur untuk posting manual <ArrowRight className="size-3" />
                  </Link>
                </div>
              )}
            </div>
          )}
          <Card className="border-rule bg-paper shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm text-ink">
                <span className="flex items-center gap-2">
                  <Scale className="size-4 text-terra" />
                  Total Tagihan
                </span>
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[11px] text-emerald-700">
                  Seimbang
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="tnum font-display text-2xl font-semibold tracking-tight text-ink">
                <AnimatedNumber minor={totals.totalMinor} />
              </div>
              <p className="mt-1 text-[11px] text-ink-soft">
                {totals.subtotalMinor > 0n && <>Subtotal {Money.fromMinor(totals.subtotalMinor).formatIdr()}</>}
                {totals.taxMinor > 0n && <> + PPN {Money.fromMinor(totals.taxMinor).formatIdr()}</>}
                {postToLedger ? " · akan diposting ke jurnal." : " · arsip saja, tanpa jurnal."}
              </p>
            </CardContent>
          </Card>

          <Card className="border-rule bg-paper shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-ink">Jurnal yang Terbentuk</CardTitle>
            </CardHeader>
            <CardContent>
              {!postToLedger ? (
                <p className="text-xs leading-relaxed text-ink-soft">
                  Posting dimatikan — tidak ada jurnal yang terbentuk.
                </p>
              ) : totals.totalMinor <= 0n ? (
                <p className="text-xs leading-relaxed text-ink-soft">
                  Lengkapi item agar jurnal terbentuk.
                </p>
              ) : isInvoice ? (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span><span className="mr-1.5 font-mono font-bold text-emerald-600">D</span><span className="font-mono font-medium">1200</span><span className="mx-1 text-ink-soft">·</span>Piutang Usaha</span>
                    <span className="tnum shrink-0 font-medium">{Money.fromMinor(totals.totalMinor).formatIdr()}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span><span className="mr-1.5 pl-4 font-mono font-bold text-terra">K</span><span className="font-mono font-medium">4100</span><span className="mx-1 text-ink-soft">·</span>Pendapatan</span>
                    <span className="tnum shrink-0 font-medium">{Money.fromMinor(netSubtotal).formatIdr()}</span>
                  </div>
                  {totals.taxMinor > 0n && (
                    <div className="flex items-center justify-between gap-2">
                      <span><span className="mr-1.5 pl-4 font-mono font-bold text-terra">K</span><span className="font-mono font-medium">2200</span><span className="mx-1 text-ink-soft">·</span>PPN Keluaran</span>
                      <span className="tnum shrink-0 font-medium">{Money.fromMinor(totals.taxMinor).formatIdr()}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span><span className="mr-1.5 font-mono font-bold text-emerald-600">D</span><span className="font-mono font-medium">5100</span><span className="mx-1 text-ink-soft">·</span>Beban/Pembelian</span>
                    <span className="tnum shrink-0 font-medium">{Money.fromMinor(netSubtotal).formatIdr()}</span>
                  </div>
                  {totals.taxMinor > 0n && (
                    <div className="flex items-center justify-between gap-2">
                      <span><span className="mr-1.5 font-mono font-bold text-emerald-600">D</span><span className="font-mono font-medium">1400</span><span className="mx-1 text-ink-soft">·</span>PPN Masukan</span>
                      <span className="tnum shrink-0 font-medium">{Money.fromMinor(totals.taxMinor).formatIdr()}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span><span className="mr-1.5 pl-4 font-mono font-bold text-terra">K</span><span className="font-mono font-medium">2100</span><span className="mx-1 text-ink-soft">·</span>Utang Usaha</span>
                    <span className="tnum shrink-0 font-medium">{Money.fromMinor(totals.totalMinor).formatIdr()}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2.5">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-terra text-white shadow-xs hover:bg-terra/90 transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]"
            >
              {loading && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {isInvoice ? "Terbitkan Faktur" : "Catat Tagihan"}
            </Button>
            <Button type="button" variant="outline" disabled={loading} onClick={() => setView("form")} className="w-full">
              <ArrowLeft data-icon="inline-start" />
              Kembali Edit
            </Button>
          </div>
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}
