"use client";

import * as React from "react";
import { SakRuleSheet } from "@/components/sak/sak-rule-sheet";
import { getSakCitationDetailAction } from "@/server/actions/ai.actions";

interface CitationSheetApi {
  openSak: (bab: string, paragraph: string) => void;
}

const CitationSheetContext = React.createContext<CitationSheetApi | null>(null);

export function useCitationSheet(): CitationSheetApi | null {
  return React.useContext(CitationSheetContext);
}

interface SheetData {
  bab: number;
  babTitle: string;
  description: string;
  sectionTitle: string;
  paragraphRange: string;
  content: string;
}

/**
 * Provider + drawer SAK untuk sitasi inline chat.
 * Pola sama seperti halaman temuan: buka dulu (loading), isi via action.
 */
export function CitationSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<SheetData | null>(null);
  const [fallbackBab, setFallbackBab] = React.useState("");

  const openSak = React.useCallback(async (bab: string, paragraph: string) => {
    setFallbackBab(bab);
    setData(null);
    setLoading(true);
    setOpen(true);
    try {
      const res = await getSakCitationDetailAction(bab, paragraph);
      if (res.ok && res.data) {
        setData(res.data);
      } else {
        setData({
          bab: Number(bab.replace(/\D/g, "")) || 0,
          babTitle: "",
          description: "Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah",
          sectionTitle: `Bab ${bab}`,
          paragraphRange: paragraph,
          content: res.error || "Rincian standar tidak dapat dimuat.",
        });
      }
    } catch {
      setData({
        bab: Number(bab.replace(/\D/g, "")) || 0,
        babTitle: "",
        description: "Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah",
        sectionTitle: `Bab ${bab}`,
        paragraphRange: paragraph,
        content: "Terjadi kesalahan jaringan saat memuat aturan.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const api = React.useMemo(() => ({ openSak }), [openSak]);

  return (
    <CitationSheetContext.Provider value={api}>
      {children}
      <SakRuleSheet
        open={open}
        onOpenChange={setOpen}
        heading={data ? `Bab ${data.bab}: ${data.babTitle}` : `Bab ${fallbackBab}`}
        description={data?.description ?? "Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah"}
        loading={loading}
        blocks={
          data
            ? [
                {
                  title: data.sectionTitle || `Bab ${data.bab}`,
                  paragraphRange: data.paragraphRange,
                  content: data.content,
                },
              ]
            : []
        }
      />
    </CitationSheetContext.Provider>
  );
}
