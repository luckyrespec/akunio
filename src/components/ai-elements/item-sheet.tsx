"use client";

import * as React from "react";
import { ItemDetailSheet, type ItemDetailData } from "@/components/inventory/item-detail-sheet";
import { getInventoryItemDetailAction } from "@/server/actions/inventory.actions";

interface ItemSheetApi {
  openItem: (code: string) => void;
}

const ItemSheetContext = React.createContext<ItemSheetApi | null>(null);

export function useItemSheet(): ItemSheetApi | null {
  return React.useContext(ItemSheetContext);
}

/**
 * Provider + drawer barang untuk rujukan inline chat.
 * Pola sama seperti CitationSheetProvider: buka dulu (loading), isi via action.
 */
export function ItemSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [item, setItem] = React.useState<ItemDetailData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fallbackCode, setFallbackCode] = React.useState("");

  const openItem = React.useCallback(async (code: string) => {
    const clean = code.trim();
    setFallbackCode(clean);
    setItem(null);
    setError(null);
    setLoading(true);
    setOpen(true);
    try {
      const res = await getInventoryItemDetailAction(clean);
      if (res.ok && res.data) {
        setItem(res.data);
      } else {
        setError(!res.ok ? res.error : "Rincian barang tidak dapat dimuat.");
      }
    } catch {
      setError("Terjadi kesalahan jaringan saat memuat barang.");
    } finally {
      setLoading(false);
    }
  }, []);

  const api = React.useMemo(() => ({ openItem }), [openItem]);

  return (
    <ItemSheetContext.Provider value={api}>
      {children}
      <ItemDetailSheet
        open={open}
        onOpenChange={setOpen}
        loading={loading}
        item={item}
        error={error ?? (fallbackCode ? `Barang ${fallbackCode} tidak ditemukan.` : null)}
      />
    </ItemSheetContext.Provider>
  );
}
