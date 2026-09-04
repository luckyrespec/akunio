"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Search, Phone, Mail, MapPin, Edit, Users, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CreateContactDialog, type ContactFormData } from "./create-contact-dialog";
import { type ContactType } from "@/server/db/schema/invoicing";
import { normalizeIndonesianPhone } from "@/core/invoicing/whatsapp";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Reveal } from "@/components/motion";

export interface ContactRow {
  id: string;
  name: string;
  type: ContactType;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  paymentTermsDays: number;
  notes: string | null;
  createdAt: string | Date;
}

interface ContactDirectoryProps {
  initialContacts: ContactRow[];
}

export function ContactDirectory({ initialContacts }: ContactDirectoryProps) {
  const router = useRouter();
  const [contactsList, setContactsList] = React.useState<ContactRow[]>(initialContacts);
  const [search, setSearch] = React.useState("");
  const [filterType, setFilterType] = React.useState<"ALL" | ContactType>("ALL");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState<ContactFormData | null>(null);

  React.useEffect(() => {
    setContactsList(initialContacts);
  }, [initialContacts]);

  const filtered = React.useMemo(() => {
    return contactsList.filter((c) => {
      const matchType = filterType === "ALL" || c.type === filterType || c.type === "BOTH";
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q));
      return matchType && matchSearch;
    });
  }, [contactsList, filterType, search]);

  const customerCount = contactsList.filter((c) => c.type === "CUSTOMER" || c.type === "BOTH").length;
  const vendorCount = contactsList.filter((c) => c.type === "VENDOR" || c.type === "BOTH").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Buku Direktori Kontak"
        eyebrow="Kelola data pelanggan, vendor, dan termin penagihan bisnis Anda."
        actions={
          <Button
            onClick={() => {
              setEditingContact(null);
              setDialogOpen(true);
            }}
            className="bg-terra hover:bg-terra/90 text-white text-xs h-9 rounded-xl shadow-2xs transition-[color,background-color,border-color,transform] duration-150 ease-out active:scale-[0.98]"
          >
            <Plus className="size-4 mr-1.5" />
            Tambah Kontak Baru
          </Button>
        }
      />

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Type Tabs */}
        <div className="flex items-center gap-1.5 rounded-lg border border-rule bg-canvas p-1 text-xs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filterType === "ALL"}
            onClick={() => setFilterType("ALL")}
            className={`relative rounded-md px-3 py-1 font-medium transition-colors ${
              filterType === "ALL"
                ? "text-ink"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {filterType === "ALL" && (
              <motion.span
                layoutId="kontak-type-pill"
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-0 rounded-md bg-paper shadow-2xs"
              />
            )}
            <span className="relative z-10">Semua ({contactsList.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterType === "CUSTOMER"}
            onClick={() => setFilterType("CUSTOMER")}
            className={`relative rounded-md px-3 py-1 font-medium transition-colors ${
              filterType === "CUSTOMER"
                ? "text-ink"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {filterType === "CUSTOMER" && (
              <motion.span
                layoutId="kontak-type-pill"
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-0 rounded-md bg-paper shadow-2xs"
              />
            )}
            <span className="relative z-10">Pelanggan ({customerCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterType === "VENDOR"}
            onClick={() => setFilterType("VENDOR")}
            className={`relative rounded-md px-3 py-1 font-medium transition-colors ${
              filterType === "VENDOR"
                ? "text-ink"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            {filterType === "VENDOR" && (
              <motion.span
                layoutId="kontak-type-pill"
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                className="absolute inset-0 rounded-md bg-paper shadow-2xs"
              />
            )}
            <span className="relative z-10">Pemasok ({vendorCount})</span>
          </button>
        </div>

        {/* Search Box */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 size-3.5 text-ink-soft" />
          <Input
            placeholder="Cari nama, telepon, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs bg-paper border-rule"
          />
        </div>
      </div>

      {/* Contacts Table */}
      <Reveal delay={0.08}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${filterType}-${search}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        >
      <div className="rounded-xl border border-rule bg-paper shadow-2xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-ink-soft">
            <motion.span
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              className="inline-block"
            >
              <Users className="size-8 mx-auto mb-2 text-ink-soft/40" />
            </motion.span>
            <p>Tidak ada kontak yang ditemukan.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-rule bg-canvas/50 text-ink-soft">
                <tr>
                  <th className="px-4 py-3 font-medium">Nama Kontak</th>
                  <th className="px-4 py-3 font-medium">Tipe</th>
                  <th className="px-4 py-3 font-medium">No. WhatsApp / HP</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Termin Tempo</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">
                      <div>{c.name}</div>
                      {c.address && (
                        <div className="text-[11px] text-ink-soft font-normal truncate max-w-xs flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">{c.address}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.type === "CUSTOMER" && (
                        <Badge variant="outline" className="border-blue-500/30 text-blue-700 bg-blue-50/50 text-[10px]">
                          Pelanggan
                        </Badge>
                      )}
                      {c.type === "VENDOR" && (
                        <Badge variant="outline" className="border-purple-500/30 text-purple-700 bg-purple-50/50 text-[10px]">
                          Pemasok
                        </Badge>
                      )}
                      {c.type === "BOTH" && (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 bg-emerald-50/50 text-[10px]">
                          Mitra Penuh
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink">
                      {c.phone ? (
                        <div className="flex items-center gap-2">
                          <span>{c.phone}</span>
                          <a
                            href={`https://wa.me/${normalizeIndonesianPhone(c.phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="Kirim pesan WhatsApp"
                          >
                            <MessageSquare className="size-3.5" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-ink-soft">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">{c.email || "-"}</td>
                    <td className="px-4 py-3 text-ink">{c.paymentTermsDays} Hari</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-ink-soft hover:text-ink"
                        onClick={() => {
                          setEditingContact(c);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="size-3.5 mr-1" />
                        Ubah
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </motion.div>
      </AnimatePresence>
      </Reveal>

      {/* Dialog Form */}
      <CreateContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialData={editingContact}
        onSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
