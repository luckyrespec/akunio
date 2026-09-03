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
import { createContactAction, updateContactAction } from "@/server/actions/contact.actions";
import { type ContactType } from "@/server/db/schema/invoicing";
import { Loader2 } from "lucide-react";

export interface ContactFormData {
  id?: string;
  name: string;
  type: ContactType;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  paymentTermsDays?: number;
  notes?: string | null;
}

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: ContactFormData | null;
  onSuccess?: () => void;
}

export function CreateContactDialog({
  open,
  onOpenChange,
  initialData,
  onSuccess,
}: CreateContactDialogProps) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<ContactType>("CUSTOMER");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [taxId, setTaxId] = React.useState("");
  const [paymentTermsDays, setPaymentTermsDays] = React.useState(30);
  const [notes, setNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setType(initialData.type || "CUSTOMER");
      setPhone(initialData.phone || "");
      setEmail(initialData.email || "");
      setAddress(initialData.address || "");
      setTaxId(initialData.taxId || "");
      setPaymentTermsDays(initialData.paymentTermsDays ?? 30);
      setNotes(initialData.notes || "");
    } else {
      setName("");
      setType("CUSTOMER");
      setPhone("");
      setEmail("");
      setAddress("");
      setTaxId("");
      setPaymentTermsDays(30);
      setNotes("");
    }
    setError(null);
  }, [initialData, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nama kontak wajib diisi.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (initialData?.id) {
        const res = await updateContactAction(initialData.id, {
          name: name.trim(),
          type,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          taxId: taxId.trim() || null,
          paymentTermsDays,
          notes: notes.trim() || null,
        });
        if (!res.ok) throw new Error(res.error);
      } else {
        const res = await createContactAction({
          name: name.trim(),
          type,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          taxId: taxId.trim() || null,
          paymentTermsDays,
          notes: notes.trim() || null,
        });
        if (!res.ok) throw new Error(res.error);
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan kontak.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] bg-paper text-ink border-rule">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">
            {initialData ? "Ubah Kontak" : "Tambah Kontak Baru"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="contact-name" className="text-xs font-medium text-ink">
              Nama Kontak / Perusahaan *
            </Label>
            <Input
              id="contact-name"
              placeholder="Contoh: Toko Berkah Mandiri / Pak Budi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xs bg-canvas"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contact-type" className="text-xs font-medium text-ink">
                Tipe Kontak
              </Label>
              <select
                id="contact-type"
                value={type}
                onChange={(e) => setType(e.target.value as ContactType)}
                className="w-full rounded-md border border-rule bg-canvas px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-terra"
              >
                <option value="CUSTOMER">Pelanggan (Customer)</option>
                <option value="VENDOR">Pemasok (Vendor)</option>
                <option value="BOTH">Keduanya (Pelanggan & Pemasok)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-terms" className="text-xs font-medium text-ink">
                Termin Tempo (Hari)
              </Label>
              <Input
                id="contact-terms"
                type="number"
                min="0"
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(parseInt(e.target.value, 10) || 0)}
                className="text-xs bg-canvas"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone" className="text-xs font-medium text-ink">
                Nomor WhatsApp / HP
              </Label>
              <Input
                id="contact-phone"
                placeholder="08123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="text-xs bg-canvas"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-email" className="text-xs font-medium text-ink">
                Email
              </Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="kontak@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-xs bg-canvas"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-address" className="text-xs font-medium text-ink">
              Alamat Lengkap
            </Label>
            <Textarea
              id="contact-address"
              placeholder="Alamat kantor / pengiriman"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="text-xs bg-canvas resize-none h-16"
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
              {initialData ? "Simpan Perubahan" : "Simpan Kontak"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
