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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { createInvoiceAction } from "@/server/actions/invoice.actions";
import { calculateInvoiceTotals } from "@/core/invoicing/calculations";
import { Money } from "@/core/money/money";
import type { InvoiceType } from "@/server/db/schema/invoicing";

export interface ContactOption {
  id: string;
  name: string;
  type: string;
  paymentTermsDays: number;
}

interface CreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultType?: InvoiceType;
  contactsList: ContactOption[];
  onSuccess?: () => void;
}

interface ItemRow {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  defaultType = "INVOICE",
  contactsList,
  onSuccess,
}: CreateInvoiceDialogProps) {
  const [type, setType] = React.useState<InvoiceType>(defaultType);
  const [contactId, setContactId] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [items, setItems] = React.useState<ItemRow[]>([
    { id: "1", description: "", quantity: "1", unitPrice: "", discount: "0", taxRate: "0" },
  ]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setType(defaultType);
    setIssueDate(new Date().toISOString().slice(0, 10));
    setItems([
      { id: "1", description: "", quantity: "1", unitPrice: "", discount: "0", taxRate: "0" },
    ]);
    setError(null);

    const filteredContacts = contactsList.filter(
      (c) => defaultType === "INVOICE" ? (c.type === "CUSTOMER" || c.type === "BOTH") : (c.type === "VENDOR" || c.type === "BOTH")
    );

    if (filteredContacts.length > 0) {
      const first = filteredContacts[0];
      setContactId(first.id);
      const days = first.paymentTermsDays || 30;
      const d = new Date();
      d.setDate(d.getDate() + days);
      setDueDate(d.toISOString().slice(0, 10));
    } else if (contactsList.length > 0) {
      setContactId(contactsList[0].id);
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setDueDate(d.toISOString().slice(0, 10));
    }
  }, [defaultType, contactsList, open]);

  // When contact changes, update default due date
  function handleContactChange(newContactId: string) {
    setContactId(newContactId);
    const selected = contactsList.find((c) => c.id === newContactId);
    if (selected) {
      const days = selected.paymentTermsDays || 30;
      const d = new Date(issueDate);
      d.setDate(d.getDate() + days);
      setDueDate(d.toISOString().slice(0, 10));
    }
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        description: "",
        quantity: "1",
        unitPrice: "",
        discount: "0",
        taxRate: "0",
      },
    ]);
  }

  function removeItem(id: string) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  function updateItem(id: string, field: keyof ItemRow, val: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: val } : it))
    );
  }

  // Calculate live preview totals
  const totals = React.useMemo(() => {
    const formatted = items.map((it) => ({
      quantity: parseFloat(it.quantity) || 1,
      unitPriceMinor: BigInt(Math.round((parseFloat(it.unitPrice) || 0) * 100)),
      discountMinor: BigInt(Math.round((parseFloat(it.discount) || 0) * 100)),
      taxRatePercent: parseFloat(it.taxRate) || 0,
    }));
    return calculateInvoiceTotals(formatted, 0n);
  }, [items]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactId) {
      setError("Silakan pilih mitra kontak.");
      return;
    }
    if (items.some((it) => !it.description.trim() || !it.unitPrice)) {
      setError("Semua baris item wajib memiliki deskripsi dan harga satuan.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const itemsPayload = items.map((it) => ({
        description: it.description.trim(),
        quantity: it.quantity,
        unitPriceMinor: BigInt(Math.round(parseFloat(it.unitPrice) * 100)),
        discountMinor: BigInt(Math.round((parseFloat(it.discount) || 0) * 100)),
        taxRatePercent: it.taxRate,
      }));

      const res = await createInvoiceAction(
        {
          type,
          contactId,
          issueDate,
          dueDate: dueDate || issueDate,
          notes: notes.trim() || null,
        },
        itemsPayload
      );

      if (!res.ok) {
        throw new Error(res.error);
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat faktur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto bg-paper text-ink border-rule">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">
            {type === "INVOICE" ? "Buat Faktur Penjualan Baru" : "Buat Tagihan Pembelian Baru"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Top Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-contact" className="text-xs font-medium text-ink">
                {type === "INVOICE" ? "Pelanggan *" : "Pemasok / Vendor *"}
              </Label>
              <select
                id="inv-contact"
                value={contactId}
                onChange={(e) => handleContactChange(e.target.value)}
                className="w-full rounded-md border border-rule bg-canvas px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
                required
              >
                <option value="" disabled>Pilih Kontak</option>
                {contactsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-issue-date" className="text-xs font-medium text-ink">
                Tanggal Terbit
              </Label>
              <Input
                id="inv-issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="text-xs bg-canvas"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-due-date" className="text-xs font-medium text-ink">
                Jatuh Tempo
              </Label>
              <Input
                id="inv-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="text-xs bg-canvas"
                required
              />
            </div>
          </div>

          {/* Dynamic Items Table */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">Rincian Barang / Jasa</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                className="h-7 text-xs border-rule text-ink"
              >
                <Plus className="size-3.5 mr-1" />
                Tambah Baris
              </Button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div
                  key={it.id}
                  className="grid grid-cols-12 gap-2 items-center rounded-lg border border-rule/70 bg-canvas/40 p-2 text-xs"
                >
                  <div className="col-span-5">
                    <Input
                      placeholder="Deskripsi barang/jasa"
                      value={it.description}
                      onChange={(e) => updateItem(it.id, "description", e.target.value)}
                      className="text-xs bg-paper h-8"
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <Input
                      type="number"
                      min="1"
                      step="0.1"
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) => updateItem(it.id, "quantity", e.target.value)}
                      className="text-xs bg-paper h-8"
                      required
                    />
                  </div>

                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Harga Satuan (Rp)"
                      value={it.unitPrice}
                      onChange={(e) => updateItem(it.id, "unitPrice", e.target.value)}
                      className="text-xs bg-paper h-8"
                      required
                    />
                  </div>

                  <div className="col-span-1">
                    <select
                      value={it.taxRate}
                      onChange={(e) => updateItem(it.id, "taxRate", e.target.value)}
                      className="w-full rounded-md border border-rule bg-paper px-1 py-1.5 text-[11px] text-ink focus:outline-none"
                    >
                      <option value="0">0%</option>
                      <option value="11">11%</option>
                      <option value="12">12%</option>
                    </select>
                  </div>

                  <div className="col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      disabled={items.length <= 1}
                      className="text-ink-soft hover:text-destructive disabled:opacity-30 p-1"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Summary */}
          <div className="rounded-lg bg-canvas p-3 border border-rule space-y-1.5 text-xs text-ink">
            <div className="flex justify-between">
              <span className="text-ink-soft">Subtotal:</span>
              <span className="font-mono">{Money.fromMinor(totals.subtotalMinor).formatIdr()}</span>
            </div>
            {totals.discountMinor > 0n && (
              <div className="flex justify-between text-destructive">
                <span>Diskon:</span>
                <span className="font-mono">-{Money.fromMinor(totals.discountMinor).formatIdr()}</span>
              </div>
            )}
            {totals.taxMinor > 0n && (
              <div className="flex justify-between text-ink-soft">
                <span>PPN:</span>
                <span className="font-mono">{Money.fromMinor(totals.taxMinor).formatIdr()}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-rule/60 pt-1.5 font-semibold text-sm text-ink">
              <span>Total Tagihan:</span>
              <span className="font-mono text-terra">{Money.fromMinor(totals.totalMinor).formatIdr()}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-notes" className="text-xs font-medium text-ink">
              Catatan / Info Pembayaran Rekening
            </Label>
            <Textarea
              id="inv-notes"
              placeholder="Contoh: Pembayaran transfer ke Rekening BCA 1234567890 a/n PT Perusahaan"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs bg-canvas resize-none h-14"
            />
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
              Terbitkan Faktur
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
