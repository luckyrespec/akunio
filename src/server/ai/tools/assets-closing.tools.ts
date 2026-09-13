import { db } from "@/server/db";
import { withOrg } from "@/server/db/repos/with-org";
import {
  postMonthlyDepreciation,
  listFixedAssets,
  createFixedAsset,
} from "@/server/db/repos/assets.repo";
import { postJournalEntry } from "@/server/db/repos/journals.repo";
import { buildAcquisitionJournal } from "@/core/assets/acquisition";
import { Money } from "@/core/money/money";
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
  {
    type: "function",
    name: "list_fixed_assets",
    description:
      "Ambil daftar aset tetap beserta kode, kategori, status, dan harga perolehan. Gunakan untuk 'aset apa saja yang dimiliki'.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Filter kata kunci nama atau kode (opsional)" },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "register_fixed_asset",
    description:
      "Daftarkan aset tetap baru beserta jadwal penyusutannya (kecuali TANAH yang tidak disusutkan). Akun aset/akumulasi/beban wajib akun valid — cari dulu via list_accounts. Wajib konfirmasi user sebelum eksekusi.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nama aset" },
        category: {
          type: "string",
          enum: ["TANAH", "BANGUNAN", "KENDARAAN", "MESIN_PERALATAN", "INVENTARIS_KANTOR"],
          description: "Kategori aset",
        },
        acquisitionDate: { type: "string", description: "Tanggal perolehan YYYY-MM-DD" },
        acquisitionCostText: { type: "string", description: "Harga perolehan Rupiah (misal: '120000000')" },
        usefulLifeMonths: { type: "number", description: "Masa manfaat dalam bulan" },
        depreciationMethod: {
          type: "string",
          enum: ["STRAIGHT_LINE", "DECLINING_BALANCE"],
          description: "Metode penyusutan",
        },
        assetAccountId: { type: "string", description: "Id akun aset" },
        accumulatedDepAccountId: { type: "string", description: "Id akun akumulasi penyusutan" },
        depreciationExpenseAccountId: { type: "string", description: "Id akun beban penyusutan" },
        salvageValueText: { type: "string", description: "Nilai sisa Rupiah (opsional, default 0)" },
        postAcquisition: { type: "boolean", description: "Posting jurnal perolehan atomik Dr akun aset / Cr akun lawan (default true). Bila false, kartu aset berstatus BELUM_DIJURNAL." },
        counterAccountId: { type: "string", description: "Id akun lawan jurnal perolehan (kas/bank, utang, atau modal) — wajib bila postAcquisition true" },
        notes: { type: "string", description: "Catatan (opsional)" },
      },
      required: [
        "name",
        "category",
        "acquisitionDate",
        "acquisitionCostText",
        "usefulLifeMonths",
        "depreciationMethod",
        "assetAccountId",
        "accumulatedDepAccountId",
        "depreciationExpenseAccountId",
      ],
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
      const res = await withOrg(orgId, (tx) =>
        postMonthlyDepreciation(tx, {
          orgId,
          periodName,
          postedBy: actorEmail,
        }),
      );

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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memproses permintaan.";
      return { success: false, error: message };
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memproses permintaan.";
      return { success: false, error: message };
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal memproses permintaan.";
      return { success: false, error: message };
    }
  },

  list_fixed_assets: async (orgId, _actor, args) => {
    const query = String(args.query ?? "").trim();
    const rows = await listFixedAssets(db, orgId);
    const filtered = query
      ? rows.filter(
          (a) =>
            a.name.toLowerCase().includes(query.toLowerCase()) ||
            a.code.toLowerCase().includes(query.toLowerCase()),
        )
      : rows;
    return {
      success: true,
      data: {
        totalCount: filtered.length,
        assets: filtered.slice(0, 30).map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          category: a.category,
          status: a.status,
          acquisitionCost: Money.fromMinor(a.acquisitionCostMinor).formatIdr(),
        })),
      },
    };
  },

  register_fixed_asset: async (orgId, _actor, args) => {
    const categories = ["TANAH", "BANGUNAN", "KENDARAAN", "MESIN_PERALATAN", "INVENTARIS_KANTOR"] as const;
    const methods = ["STRAIGHT_LINE", "DECLINING_BALANCE"] as const;
    const category = String(args.category ?? "").toUpperCase();
    if (!(categories as readonly string[]).includes(category)) {
      return { success: false, error: "category harus salah satu: TANAH, BANGUNAN, KENDARAAN, MESIN_PERALATAN, INVENTARIS_KANTOR." };
    }
    const method = String(args.depreciationMethod ?? "").toUpperCase();
    if (!(methods as readonly string[]).includes(method)) {
      return { success: false, error: "depreciationMethod harus STRAIGHT_LINE atau DECLINING_BALANCE." };
    }
    const name = String(args.name ?? "").trim();
    if (!name) return { success: false, error: "Nama aset wajib diisi." };
    const acquisitionDate = String(args.acquisitionDate ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acquisitionDate)) {
      return { success: false, error: "acquisitionDate harus format YYYY-MM-DD." };
    }
    let acquisitionCostMinor: bigint;
    let salvageValueMinor = 0n;
    try {
      acquisitionCostMinor = Money.parseIdr(String(args.acquisitionCostText ?? "")).minor;
      if (args.salvageValueText) salvageValueMinor = Money.parseIdr(String(args.salvageValueText)).minor;
    } catch {
      return { success: false, error: "Nominal Rupiah tidak valid." };
    }
    if (acquisitionCostMinor <= 0n) {
      return { success: false, error: "Harga perolehan harus lebih dari 0." };
    }
    const usefulLifeMonths = Number(args.usefulLifeMonths);
    if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) {
      return { success: false, error: "usefulLifeMonths harus bilangan bulat > 0." };
    }
    for (const k of ["assetAccountId", "accumulatedDepAccountId", "depreciationExpenseAccountId"] as const) {
      if (!String(args[k] ?? "").trim()) {
        return { success: false, error: `${k} wajib diisi (cari id akun via list_accounts).` };
      }
    }
    // postAcquisition default true: pendaftaran + jurnal perolehan atomik.
    const postAcquisition = args.postAcquisition !== false;
    const counterAccountId = String(args.counterAccountId ?? "").trim();
    if (postAcquisition && !counterAccountId) {
      return { success: false, error: "counterAccountId wajib diisi bila postAcquisition true (cari id akun kas/bank via list_accounts)." };
    }
    try {
      const { asset, journalEntryId } = await withOrg(orgId, async (tx) => {
        const created = await createFixedAsset(tx, {
          orgId,
          name,
          category: category as (typeof categories)[number],
          acquisitionDate,
          inServiceDate: acquisitionDate,
          acquisitionCostMinor,
          salvageValueMinor,
          usefulLifeMonths,
          depreciationMethod: method as (typeof methods)[number],
          assetAccountId: String(args.assetAccountId),
          accumulatedDepAccountId: String(args.accumulatedDepAccountId),
          depreciationExpenseAccountId: String(args.depreciationExpenseAccountId),
          acquisitionPosted: postAcquisition,
          notes: args.notes ? String(args.notes) : undefined,
        });
        let jeId: string | null = null;
        if (postAcquisition) {
          const je = await postJournalEntry(
            tx,
            orgId,
            _actor,
            buildAcquisitionJournal({
              assetId: created.id,
              assetCode: created.code,
              assetName: created.name,
              assetAccountId: String(args.assetAccountId),
              counterAccountId,
              acquisitionCostMinor,
              acquisitionDate,
            }),
          );
          jeId = je.id;
        }
        return { asset: created, journalEntryId: jeId };
      });
      return {
        success: true,
        data: {
          id: asset.id,
          code: asset.code,
          name: asset.name,
          journalEntryId,
          acquisitionPosted: postAcquisition,
          status: postAcquisition ? undefined : "BELUM_DIJURNAL",
          message: postAcquisition
            ? `Aset ${asset.code} terdaftar beserta jadwal penyusutan dan jurnal perolehannya.`
            : `Aset ${asset.code} terdaftar beserta jadwal penyusutannya, tetapi BELUM_DIJURNAL (jurnal perolehan belum diposting).`,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal mendaftarkan aset";
      return { success: false, error: message };
    }
  },
};
