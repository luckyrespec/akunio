"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateOrganizationProfileAction } from "@/server/actions/organization.actions";

export interface OrganizationProfileData {
  businessName: string | null;
  city: string | null;
  address: string | null;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function OrganizationProfileTab({
  organization,
  profile,
  canEdit,
}: {
  organization: { id: string; name: string; baseCurrency: string; fiscalYearStartMonth: number };
  profile: OrganizationProfileData | null;
  canEdit: boolean;
}) {
  const [name, setName] = useState(organization.name);
  const [businessName, setBusinessName] = useState(profile?.businessName ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const initial = (name.trim() || "O").charAt(0).toUpperCase();
  const fiscalMonth = MONTHS[organization.fiscalYearStartMonth - 1] ?? `Bulan ${organization.fiscalYearStartMonth}`;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await updateOrganizationProfileAction({ name, businessName, city, address });
      if (res.ok) {
        setFeedback({ type: "success", message: "Perubahan tersimpan." });
      } else {
        setFeedback({ type: "error", message: res.error });
      }
    } catch {
      setFeedback({ type: "error", message: "Gagal menyimpan. Coba lagi." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <div>
        <h2 className="font-display text-base font-bold text-ink">Profil Organisasi</h2>
        <p className="mt-0.5 text-xs text-ink-soft">
          ID tidak bisa diganti. Nama dan alamat boleh diubah kapan saja.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-paper p-5 shadow-2xs sm:flex-row sm:items-center">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-terra font-display text-2xl font-bold text-white shadow-xs">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-semibold tracking-tight text-ink truncate" title={organization.name}>
            {organization.name}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-soft">ID {organization.id}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Badge variant="outline">{organization.baseCurrency}</Badge>
          <Badge variant="outline">Fiskal {fiscalMonth}</Badge>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10">
            SAK EMKM
          </Badge>
        </div>
      </div>

      <form onSubmit={handleSave} className="rounded-2xl border border-rule bg-paper p-5 shadow-2xs space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-name" className="text-xs text-ink-soft">Nama organisasi *</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit || saving}
              maxLength={120}
              placeholder="cth: Pakein.AI"
              className="bg-paper text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-biz" className="text-xs text-ink-soft">Nama bisnis / brand</Label>
            <Input
              id="org-biz"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={!canEdit || saving}
              maxLength={120}
              placeholder="cth: Pakein.AI Store"
              className="bg-paper text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-city" className="text-xs text-ink-soft">Kota</Label>
            <Input
              id="org-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={!canEdit || saving}
              maxLength={120}
              placeholder="cth: Yogyakarta"
              className="bg-paper text-xs"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="org-address" className="text-xs text-ink-soft">Alamat</Label>
            <textarea
              id="org-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!canEdit || saving}
              maxLength={500}
              rows={2}
              placeholder="cth: Jl. Malioboro No. 1, Yogyakarta"
              className="w-full rounded-xl border border-rule bg-paper px-3 py-2 text-xs text-ink placeholder:text-ink-soft/60 focus:outline-none focus:ring-1 focus:ring-terra transition-[border-color,box-shadow] disabled:opacity-60"
            />
          </div>
        </div>

        {feedback && (
          <p role="status" className={`text-xs ${feedback.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {feedback.message}
          </p>
        )}

        {canEdit ? (
          <Button type="submit" size="sm" disabled={saving} className="bg-terra text-white hover:bg-terra/90 text-xs gap-1.5 shadow-xs">
            <Building2 className="size-3.5" />
            <span>{saving ? "Menyimpan…" : "Simpan Profil"}</span>
          </Button>
        ) : (
          <p className="text-xs text-ink-soft">Anda masuk sebagai Viewer sehingga hanya bisa melihat. Minta Owner untuk mengubah data.</p>
        )}
      </form>
    </div>
  );
}
