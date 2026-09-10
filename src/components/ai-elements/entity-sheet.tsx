"use client";

import * as React from "react";
import { AccountDetailSheet, type AccountDetailData } from "@/components/accounts/account-detail-sheet";
import { AssetDetailSheet, type AssetDetailData } from "@/components/assets/asset-detail-sheet";
import { JournalDetailSheet, type JournalDetailData } from "@/components/journal/journal-detail-sheet";
import { ContactDetailSheet, type ContactDetailData } from "@/components/contacts/contact-detail-sheet";
import { InvoiceDetailSheet, type InvoiceDetailData } from "@/components/invoicing/invoice-detail-sheet";
import { getAccountDetailAction } from "@/server/actions/account.actions";
import { getFixedAssetSheetAction } from "@/server/actions/assets.actions";
import { getJournalDetailAction } from "@/server/actions/journal.actions";
import { getContactDetailAction } from "@/server/actions/contact.actions";
import { getInvoiceDetailAction } from "@/server/actions/invoice.actions";

export type EntitySheetKind = "akun" | "aset" | "jurnal" | "kontak" | "faktur";

interface EntitySheetApi {
  openAccount: (code: string) => void;
  openAsset: (code: string) => void;
  openJournal: (number: string) => void;
  openContact: (id: string) => void;
  openInvoice: (number: string) => void;
}

const EntitySheetContext = React.createContext<EntitySheetApi | null>(null);

export function useEntitySheet(): EntitySheetApi | null {
  return React.useContext(EntitySheetContext);
}

/**
 * Provider + drawer rujukan entitas (akun/aset/jurnal) untuk chat.
 * Pola sama seperti CitationSheetProvider/ItemSheetProvider:
 * buka dulu (loading), isi via action.
 */
export function EntitySheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<EntitySheetKind>("akun");
  const [loading, setLoading] = React.useState(false);
  const [account, setAccount] = React.useState<AccountDetailData | null>(null);
  const [asset, setAsset] = React.useState<AssetDetailData | null>(null);
  const [entry, setEntry] = React.useState<JournalDetailData | null>(null);
  const [contact, setContact] = React.useState<ContactDetailData | null>(null);
  const [invoice, setInvoice] = React.useState<InvoiceDetailData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fallbackKey, setFallbackKey] = React.useState("");

  const openWith = React.useCallback(
    async (nextKind: EntitySheetKind, key: string, loader: () => Promise<unknown>) => {
      const clean = key.trim();
      setKind(nextKind);
      setFallbackKey(clean);
      setAccount(null);
      setAsset(null);
      setEntry(null);
      setContact(null);
      setInvoice(null);
      setError(null);
      setLoading(true);
      setOpen(true);
      try {
        const res = (await loader()) as
          | { ok: true; data: AccountDetailData & AssetDetailData & JournalDetailData & ContactDetailData & InvoiceDetailData }
          | { ok: false; error?: string };
        if (res.ok && res.data) {
          if (nextKind === "akun") setAccount(res.data);
          else if (nextKind === "aset") setAsset(res.data);
          else if (nextKind === "kontak") setContact(res.data);
          else if (nextKind === "faktur") setInvoice(res.data);
          else setEntry(res.data);
        } else {
          setError(!res.ok ? (res.error ?? "Rincian tidak dapat dimuat.") : "Rincian tidak dapat dimuat.");
        }
      } catch {
        setError("Terjadi kesalahan jaringan saat memuat rujukan.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const api = React.useMemo<EntitySheetApi>(
    () => ({
      openAccount: (code) => void openWith("akun", code, () => getAccountDetailAction(code)),
      openAsset: (code) => void openWith("aset", code, () => getFixedAssetSheetAction(code)),
      openJournal: (number) => void openWith("jurnal", number, () => getJournalDetailAction(number)),
      openContact: (id) => void openWith("kontak", id, () => getContactDetailAction(id)),
      openInvoice: (number) => void openWith("faktur", number, () => getInvoiceDetailAction(number)),
    }),
    [openWith],
  );

  return (
    <EntitySheetContext.Provider value={api}>
      {children}
      <AccountDetailSheet
        open={open && kind === "akun"}
        onOpenChange={setOpen}
        loading={loading}
        account={account}
        error={error ?? (fallbackKey ? `Akun ${fallbackKey} tidak ditemukan.` : null)}
      />
      <AssetDetailSheet
        open={open && kind === "aset"}
        onOpenChange={setOpen}
        loading={loading}
        asset={asset}
        error={error ?? (fallbackKey ? `Aset ${fallbackKey} tidak ditemukan.` : null)}
      />
      <JournalDetailSheet
        open={open && kind === "jurnal"}
        onOpenChange={setOpen}
        loading={loading}
        entry={entry}
        error={error ?? (fallbackKey ? `Jurnal ${fallbackKey} tidak ditemukan.` : null)}
      />
      <ContactDetailSheet
        open={open && kind === "kontak"}
        onOpenChange={setOpen}
        loading={loading}
        contact={contact}
        error={error ?? (fallbackKey ? `Kontak tidak ditemukan.` : null)}
      />
      <InvoiceDetailSheet
        open={open && kind === "faktur"}
        onOpenChange={setOpen}
        loading={loading}
        invoice={invoice}
        error={error ?? (fallbackKey ? `Faktur ${fallbackKey} tidak ditemukan.` : null)}
      />
    </EntitySheetContext.Provider>
  );
}
