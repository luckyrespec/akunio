import { db } from "@/server/db";
import { eq } from "drizzle-orm";
import { accounts } from "@/server/db/schema/org";
import {
  postMonthlyDepreciation,
  listFixedAssets,
  getFixedAssetDetail,
} from "@/server/db/repos/assets.repo";
import {
  evaluatePeriodReadiness,
  closePeriod,
} from "@/server/db/repos/periods-closing.repo";
import type { ToolDefinition, ToolHandler } from "./types";

export const assetsAndClosingToolDefs: ToolDefinition[] = [
  {
    type: "function",
    name: "recommend_asset_depreciation",
    description:
      "Berikan rekomendasi masa manfaat (bulan/tahun), tarif, dan metode penyusutan berdasarkan aturan SAK EMKM dan klasifikasi pajak Indonesia.",
    parameters: {
      type: "object",
      properties: {
        assetName: { type: "string", description: "Nama aset, misal: 'Mobil Operasional', 'Laptop', 'Gedung Kantor'" },
        category: {
          type: "string",
          enum: ["KENDARAAN", "MESIN_PERALATAN", "INVENTARIS_KANTOR", "BANGUNAN", "TANAH"],
          description: "Kategori aset jika sudah diketahui",
        },
      },
      required: ["assetName"],
    },
  },
  {
    type: "function",
    name: "run_monthly_depreciation",
    description:
      "Jalankan dan posting beban penyusutan bulanan untuk seluruh aset tetap yang aktif ke Buku Besar.",
    parameters: {
      type: "object",
      properties: {
        periodName: { type: "string", description: "Nama periode YYYY-MM, misal '2026-01'" },
      },
      required: ["periodName"],
    },
  },
  {
    type: "function",
    name: "check_period_closing_readiness",
    description:
      "Periksa checklist kesiapan penutupan buku (period closing) untuk suatu periode fiskal (rekonsiliasi bank, draf tertunda, depresiasi aset, faktur, neraca saldo).",
    parameters: {
      type: "object",
      properties: {
        periodName: { type: "string", description: "Nama periode YYYY-MM, misal '2026-01'" },
      },
      required: ["periodName"],
    },
  },
  {
    type: "function",
    name: "close_fiscal_period",
    description:
      "Tutup dan kunci periode akuntansi agar tidak bisa diubah lagi. Jika bulan Desember, otomatis membuat jurnal penutup laba/rugi ke Laba Ditahan.",
    parameters: {
      type: "object",
      properties: {
        periodName: { type: "string", description: "Nama periode YYYY-MM, misal '2026-01'" },
        retainedEarningsAccountId: {
          type: "string",
          description: "ID akun Laba Ditahan (diperlukan jika periode akhir tahun Desember)",
        },
      },
      required: ["periodName"],
    },
  },
];

export const assetsAndClosingHandlers: Record<string, ToolHandler> = {
  recommend_asset_depreciation: async (_orgId, _actor, args) => {
    const assetName = String(args.assetName || "").toLowerCase();
    let category = args.category as string;

    if (!category) {
      if (assetName.includes("mobil") || assetName.includes("motor") || assetName.includes("truk") || assetName.includes("kendaraan")) {
        category = "KENDARAAN";
      } else if (assetName.includes("laptop") || assetName.includes("komputer") || assetName.includes("printer") || assetName.includes("hp")) {
        category = "INVENTARIS_KANTOR";
      } else if (assetName.includes("gedung") || assetName.includes("kantor") || assetName.includes("ruko")) {
        category = "BANGUNAN";
      } else if (assetName.includes("mesin") || assetName.includes("genset") || assetName.includes("alat berat")) {
        category = "MESIN_PERALATAN";
      } else if (assetName.includes("tanah")) {
        category = "TANAH";
      } else {
        category = "INVENTARIS_KANTOR";
      }
    }

    if (category === "TANAH") {
      return {
        success: true,
        data: {
          category: "TANAH",
          depreciable: false,
          usefulLifeMonths: 0,
          recommendation: "Menurut SAK EMKM Bab 10, Tanah memiliki masa manfaat tidak terbatas dan tidak disusutkan, kecuali tanah tersebut memiliki kondisi khusus (seperti hak pakai berjangka waktu).",
        },
      };
    }

    if (category === "BANGUNAN") {
      return {
        success: true,
        data: {
          category: "BANGUNAN",
          depreciable: true,
          usefulLifeMonths: 240, // 20 tahun
          method: "STRAIGHT_LINE",
          ratePercent: 5.0,
          recommendation: "Bangunan permanen disusutkan selama 20 tahun (240 bulan) dengan metode Garis Lurus (5% per tahun) sesuai standar akuntansi dan fiskal.",
        },
      };
    }

    if (category === "KENDARAAN" || category === "MESIN_PERALATAN") {
      return {
        success: true,
        data: {
          category,
          depreciable: true,
          usefulLifeMonths: 96, // 8 tahun (Kelompok 2)
          method: "STRAIGHT_LINE",
          alternateMethod: "DECLINING_BALANCE",
          ratePercent: 12.5,
          decliningRatePercent: 25.0,
          recommendation: "Kendaraan operasional / mesin umumnya tergolong Aset Bukan Bangunan Kelompok 2 dengan masa manfaat 8 tahun (96 bulan). Tarif Garis Lurus: 12,5%/thn, atau Saldo Menurun: 25%/thn.",
        },
      };
    }

    // Default: INVENTARIS_KANTOR / Kelompok 1
    return {
      success: true,
      data: {
        category: "INVENTARIS_KANTOR",
        depreciable: true,
        usefulLifeMonths: 48, // 4 tahun (Kelompok 1)
        method: "STRAIGHT_LINE",
        alternateMethod: "DECLINING_BALANCE",
        ratePercent: 25.0,
        decliningRatePercent: 50.0,
        recommendation: "Peralatan kantor, komputer, dan mebel kantor tergolong Aset Bukan Bangunan Kelompok 1 dengan masa manfaat 4 tahun (48 bulan). Tarif Garis Lurus: 25%/thn, atau Saldo Menurun: 50%/thn.",
      },
    };
  },

  run_monthly_depreciation: async (orgId, actorEmail, args) => {
    const periodName = String(args.periodName || "");
    if (!periodName) {
      return { success: false, error: "Nama periode (periodName) wajib diisi." };
    }

    try {
      const res = await postMonthlyDepreciation(db, {
        orgId,
        periodName,
        postedBy: actorEmail,
      });

      return {
        success: true,
        data: {
          periodName,
          postedCount: res.postedCount,
          journalEntryId: res.journalEntryId,
          message:
            res.postedCount > 0
              ? `Berhasil memposting beban depresiasi untuk ${res.postedCount} aset pada periode ${periodName}.`
              : `Tidak ada aset yang perlu disusutkan untuk periode ${periodName}.`,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  check_period_closing_readiness: async (orgId, _actor, args) => {
    const periodName = String(args.periodName || "");
    if (!periodName) {
      return { success: false, error: "Nama periode (periodName) wajib diisi." };
    }

    try {
      const checklist = await evaluatePeriodReadiness(db, orgId, periodName);
      return {
        success: true,
        data: {
          periodName,
          isReady: checklist.isReady,
          items: checklist.items,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  close_fiscal_period: async (orgId, actorEmail, args) => {
    const periodName = String(args.periodName || "");
    const retainedEarningsAccountId = args.retainedEarningsAccountId as string | undefined;

    if (!periodName) {
      return { success: false, error: "Nama periode (periodName) wajib diisi." };
    }

    try {
      const res = await closePeriod(db, {
        orgId,
        periodName,
        actorEmail,
        retainedEarningsAccountId,
      });

      return {
        success: true,
        data: {
          periodName,
          status: res.period.status,
          closingJournalId: res.closingJournalId,
          message: `Periode ${periodName} berhasil ditutup dan dikunci.`,
        },
      };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },
};
