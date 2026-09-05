import { GoogleGenAI } from "@google/genai";
import { and, eq } from "drizzle-orm";
import type { Queryable } from "@/server/db/repos/queryable";
import { accounts, organizations } from "@/server/db/schema/org";
import { getProfile } from "@/server/db/repos/onboarding.repo";
import { reportMetaMap } from "@/server/db/repos/accounts.repo";
import { postedLinesThrough } from "@/server/reports/build";
import { aggregateFromLines } from "@/core/reports/aggregates";
import { buildSakEmkmBalanceSheet, buildSakEmkmIncomeStatement } from "@/core/reports/sak-emkm";
import { getTaxSettings, getTaxSummariesByYear } from "@/server/db/repos/tax.repo";
import { Money } from "@/core/money/money";
import { BUSINESS_TYPE_LABELS, type BusinessType } from "@/core/accounts/business-types";
import type { CalkNarrative, CalkFinancialData } from "./calk-types";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

export const calkNarrativeJsonSchema = {
  type: "object",
  properties: {
    generalInfo: {
      type: "string",
      description: "Narasi Bab 1: Informasi umum entitas, domisili, bidang usaha, dan sifat operasional.",
    },
    accountingBasis: {
      type: "string",
      description: "Narasi Bab 2: Pernyataan kepatuhan pada SAK EMKM, asumsi kelangsungan usaha, dan basis akrual biaya historis.",
    },
    policies: {
      type: "object",
      properties: {
        cash: { type: "string", description: "Kebijakan kas dan setara kas." },
        receivables: { type: "string", description: "Kebijakan piutang usaha neto." },
        inventory: { type: "string", description: "Kebijakan persediaan barang (FIFO/rata-rata)." },
        fixedAssets: { type: "string", description: "Kebijakan aset tetap dan penyusutan garis lurus." },
        revenueExpense: { type: "string", description: "Kebijakan pengakuan pendapatan dan beban." },
      },
      required: ["cash", "receivables", "inventory", "fixedAssets", "revenueExpense"],
    },
    accountNotes: {
      type: "object",
      properties: {
        cashAndBank: { type: "string", description: "Catatan rincian posisi kas dan bank." },
        receivables: { type: "string", description: "Catatan piutang usaha." },
        inventory: { type: "string", description: "Catatan persediaan barang dagang/bahan." },
        fixedAssets: { type: "string", description: "Catatan nilai buku aset tetap dan akumulasi penyusutan." },
        liabilities: { type: "string", description: "Catatan kewajiban jangka pendek dan panjang." },
      },
      required: ["cashAndBank", "receivables", "inventory", "fixedAssets", "liabilities"],
    },
    incomeTaxNote: {
      type: "string",
      description: "Narasi Bab 15: Catatan pajak penghasilan UMKM PP 55/2022 (tarif 0,5%), batas fasilitas bebas pajak Rp 500 juta, dan kepatuhan penyetoran dengan NTPN tanpa pengakuan pajak tangguhan.",
    },
  },
  required: ["generalInfo", "accountingBasis", "policies", "accountNotes", "incomeTaxNote"],
};

export function buildDeterministicCalkMock(data: CalkFinancialData): CalkNarrative {
  const assetsFormatted = Money.fromMinor(data.totalAssetsMinor).formatIdr();
  const revFormatted = Money.fromMinor(data.totalRevenueMinor).formatIdr();
  const netIncomeFormatted = Money.fromMinor(data.netIncomeMinor).formatIdr();
  const taxDueFormatted = Money.fromMinor(data.taxDueMinor).formatIdr();
  const taxPaidFormatted = Money.fromMinor(data.taxPaidMinor).formatIdr();

  const taxFacilityText =
    data.taxpayerType === "INDIVIDUAL"
      ? "Sebagai Wajib Pajak Orang Pribadi, Entitas memanfaatkan fasilitas peredaran bruto tidak dikenai pajak sampai dengan Rp 500.000.000,00 per tahun kalender sesuai Pasal 60 PP No. 55 Tahun 2022."
      : "Sebagai Wajib Pajak Badan, Entitas dikenai tarif PPh Final 0,5% dari peredaran bruto sejak rupiah pertama sesuai ketentuan PP No. 55 Tahun 2022.";

  const ntpnSummary =
    data.ntpnList.length > 0
      ? `Pelunasan pajak telah disetorkan ke kas negara dengan bukti NTPN: ${data.ntpnList.join(", ")}.`
      : "Kewajiban pajak terutang telah dicadangkan pada pos Utang Pajak dan disetorkan sesuai batas waktu SPT Masa.";

  return {
    generalInfo: `${data.entityName} ("Entitas") adalah entitas usaha yang bergerak di bidang ${data.businessType}${
      data.city ? ` dan berdomisili di ${data.city}` : ""
    }. Laporan keuangan ini disajikan untuk periode yang berakhir pada ${data.periodEndsOn} dengan mata uang pelaporan Rupiah (IDR).`,
    accountingBasis:
      "Laporan keuangan Entitas disusun dan disajikan sepenuhnya berpedoman pada Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM) yang disahkan oleh Dewan Standar Akuntansi Keuangan Ikatan Akuntan Indonesia (DSAK IAI). Dasar pengukuran yang digunakan adalah biaya historis (historical cost) dengan asumsi kelangsungan usaha serta dasar akrual.",
    policies: {
      cash: "Kas dan setara kas terdiri atas kas kecil untuk kebutuhan operasional harian dan simpanan pada bank yang dapat dicairkan sewaktu-waktu tanpa batasan.",
      receivables:
        "Piutang usaha disajikan sebesar nilai nominal tagihan neto berdasarkan transaksi penyerahan barang atau jasa kepada pelanggan.",
      inventory:
        "Persediaan dicatat sebesar biaya perolehan dengan menggunakan metode rata-rata tertimbang (weighted average) atau FIFO, mencakup seluruh biaya pembelian hingga siap dijual.",
      fixedAssets:
        "Aset tetap diakui sebesar harga perolehan dikurangi akumulasi penyusutan. Penyusutan dihitung secara sistematis menggunakan metode garis lurus berdasarkan estimasi masa manfaat aset.",
      revenueExpense:
        "Pendapatan diakui saat penyerahan barang atau penyelesaian jasa kepada pelanggan. Beban diakui pada saat terjadinya berdasarkan konsep akrual.",
    },
    accountNotes: {
      cashAndBank: `Posisi kas dan setara kas pada akhir periode tercatat memadai untuk mendukung perputaran modal kerja entitas. Seluruh saldo bank berada pada lembaga perbankan resmi yang terdaftar di OJK.`,
      receivables:
        "Saldo piutang usaha mencerminkan tagihan berjalan atas aktivitas operasional yang memiliki tingkat ketertagihan tinggi dalam tempo normal usaha.",
      inventory:
        "Persediaan dinilai dalam kondisi baik dan siap digunakan atau dipasarkan guna memenuhi kebutuhan pesanan pelanggan.",
      fixedAssets: `Total aset entitas per tanggal neraca tercatat sebesar ${assetsFormatted}, mencerminkan kapasitas sarana operasional dan peralatan pendukung usaha.`,
      liabilities: `Kewajiban entitas terdiri dari utang usaha lancar dan kewajiban jangka pendek operasional, yang dikelola secara tertib sesuai termin pembayaran mitra.`,
    },
    incomeTaxNote: `Beban pajak penghasilan dihitung dan diakui berpedoman pada SAK EMKM Bab 15 (Pajak Penghasilan) serta Peraturan Pemerintah Republik Indonesia No. 55 Tahun 2022 jo. UU Harmonisasi Peraturan Perpajakan (UU HPP). Entitas membukukan peredaran bruto kumulatif sebesar ${revFormatted} dengan laba/rugi neto sebesar ${netIncomeFormatted}. ${taxFacilityText} Total beban PPh Final 0,5% yang terutang tercatat sebesar ${taxDueFormatted}, dengan realisasi penyetoran sebesar ${taxPaidFormatted}. ${ntpnSummary} Sesuai ketentuan SAK EMKM Bab 15, Entitas tidak mengakui aset atau liabilitas pajak tangguhan.`,
  };
}

export async function aggregateCalkFinancialData(
  q: Queryable,
  orgId: string,
  periodEndsOn: string
): Promise<CalkFinancialData> {
  const [org] = await q.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  const profile = await getProfile(q, orgId);
  const accRows = await q.select().from(accounts).where(eq(accounts.orgId, orgId));
  const lines = await postedLinesThrough(q, orgId, periodEndsOn);

  const metas = reportMetaMap(accRows);
  const aggs = aggregateFromLines(lines, metas);
  const is = buildSakEmkmIncomeStatement(aggs);
  const bs = buildSakEmkmBalanceSheet(aggs, is.netIncomeMinor);

  const year = parseInt(periodEndsOn.slice(0, 4), 10);
  const taxSettings = await getTaxSettings(q, orgId);
  const taxSummaries = await getTaxSummariesByYear(q, orgId, year);

  const totalGrossRevenueMinor = taxSummaries.reduce((acc, s) => acc + s.grossRevenueMinor, 0n);
  const taxableRevenueMinor = taxSummaries.reduce((acc, s) => acc + s.taxableRevenueMinor, 0n);
  const taxDueMinor = taxSummaries.reduce((acc, s) => acc + s.taxDueMinor, 0n);
  const taxPaidMinor = taxSummaries.reduce(
    (acc, s) => acc + (s.status === "PAID" ? s.taxDueMinor : 0n),
    0n
  );
  const ntpnList = taxSummaries.map((s) => s.ntpn).filter((n): n is string => Boolean(n));

  const entityName = profile?.businessName || org?.name || "Entitas Usaha Akunio";
  const businessType =
    profile?.businessType && BUSINESS_TYPE_LABELS[profile.businessType as BusinessType]
      ? BUSINESS_TYPE_LABELS[profile.businessType as BusinessType]
      : "Usaha Mikro, Kecil, dan Menengah (UMKM)";

  return {
    entityName,
    businessType,
    city: profile?.city ?? undefined,
    periodName: periodEndsOn.slice(0, 7),
    periodEndsOn,
    totalAssetsMinor: bs.totalAssetsMinor,
    totalLiabilitiesMinor: bs.totalLiabilitiesMinor,
    totalEquityMinor: bs.totalEquityMinor,
    totalRevenueMinor: is.totalRevenueMinor,
    grossProfitMinor: is.grossProfitMinor,
    netIncomeMinor: is.netIncomeMinor,
    taxpayerType: taxSettings.taxpayerType,
    npwp: taxSettings.npwp,
    totalGrossRevenueMinor,
    taxableRevenueMinor,
    taxDueMinor,
    taxPaidMinor,
    ntpnList,
  };
}

export async function generateCalkNarrative(
  q: Queryable,
  orgId: string,
  periodEndsOn: string,
  options?: { forceRefresh?: boolean }
): Promise<CalkNarrative> {
  const finData = await aggregateCalkFinancialData(q, orgId, periodEndsOn);

  // 1. Cek cache narasi di settings organisasi jika tidak dipaksa refresh
  if (!options?.forceRefresh) {
    const [org] = await q
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const orgSettings = (org?.settings ?? {}) as Record<string, unknown>;
    const calkCache = (orgSettings.calkCache ?? {}) as Record<string, CalkNarrative>;
    if (calkCache[periodEndsOn]) {
      return calkCache[periodEndsOn];
    }
  }

  let resultNarrative: CalkNarrative;

  // Jika AI_MOCK=1 atau tidak ada API Key, gunakan deterministic mock yang kaya & akurat
  if (process.env.AI_MOCK === "1" || !process.env.GEMINI_API_KEY) {
    resultNarrative = buildDeterministicCalkMock(finData);
  } else {
    const prompt = `Anda adalah seorang Akuntan Publik Senior dan Auditor Berlisensi di Indonesia yang menguasai Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (SAK EMKM) 2024 serta peraturan perpajakan UMKM (PP No. 55 Tahun 2022 jo. UU HPP).

Tugas Anda: Susunlah Catatan Atas Laporan Keuangan (CALK) yang profesional, mengalir alami, tidak kaku (anti AI-slop), dan berbasis angka-angka riil berikut:

DATA ENTITAS & KEUANGAN:
- Nama Entitas: ${finData.entityName}
- Bidang Usaha: ${finData.businessType}
- Domisili: ${finData.city || "Indonesia"}
- Periode Tutup Buku: ${finData.periodEndsOn}
- Total Aset: ${Money.fromMinor(finData.totalAssetsMinor).formatIdr()}
- Total Liabilitas: ${Money.fromMinor(finData.totalLiabilitiesMinor).formatIdr()}
- Total Ekuitas: ${Money.fromMinor(finData.totalEquityMinor).formatIdr()}
- Peredaran Bruto (Pendapatan): ${Money.fromMinor(finData.totalRevenueMinor).formatIdr()}
- Laba Kotor: ${Money.fromMinor(finData.grossProfitMinor).formatIdr()}
- Laba (Rugi) Neto: ${Money.fromMinor(finData.netIncomeMinor).formatIdr()}

DATA PERPAJAKAN (SAK EMKM Bab 15 & PP 55/2022):
- Jenis Wajib Pajak: ${finData.taxpayerType === "INDIVIDUAL" ? "Orang Pribadi (Fasilitas Bebas Pajak s.d. Rp 500 Juta)" : "Badan Usaha (0,5% dari rupiah pertama)"}
- NPWP: ${finData.npwp || "Belum Terdaftar"}
- Total Omzet Kumulatif: ${Money.fromMinor(finData.totalGrossRevenueMinor).formatIdr()}
- Dasar Pengenaan Pajak (DPP): ${Money.fromMinor(finData.taxableRevenueMinor).formatIdr()}
- Beban PPh Final 0,5% Terutang: ${Money.fromMinor(finData.taxDueMinor).formatIdr()}
- PPh Telah Disetor: ${Money.fromMinor(finData.taxPaidMinor).formatIdr()}
- Daftar Bukti NTPN: ${finData.ntpnList.length > 0 ? finData.ntpnList.join(", ") : "Tidak Ada"}

ATURAN WAJIB SAK EMKM:
1. Bab 6 & Bab 15: Entitas SAK EMKM mengukur beban pajak penghasilan semata-mata sebesar jumlah yang terutang menurut peraturan perpajakan yang berlaku (PP 55/2022 tarif 0,5%). DILARANG mengakui aset atau liabilitas pajak tangguhan.
2. Gunakan gaya bahasa audit resmi Indonesia yang berwibawa, jernih, kontekstual, dan mudah dipahami oleh perbankan atau otoritas pajak.
3. Kembalikan JSON sesuai schema yang telah ditentukan.`;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.interactions.create({
        model: MODEL,
        input: [{ type: "user_input", content: [{ type: "text", text: prompt }] as never }] as never,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: calkNarrativeJsonSchema,
        },
      });

      const parsed = JSON.parse(response.output_text ?? "{}") as CalkNarrative;
      if (parsed.generalInfo && parsed.accountingBasis && parsed.incomeTaxNote) {
        resultNarrative = parsed;
      } else {
        resultNarrative = buildDeterministicCalkMock(finData);
      }
    } catch (err) {
      console.warn("AI generation failed or rate limited, falling back to deterministic mock:", err);
      resultNarrative = buildDeterministicCalkMock(finData);
    }
  }

  // 2. Simpan ke database cache organisasi agar render berikutnya cepat dan hemat API
  try {
    const [org] = await q
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    const currentSettings = ((org?.settings ?? {}) as Record<string, unknown>) || {};
    const existingCache = ((currentSettings.calkCache ?? {}) as Record<string, CalkNarrative>) || {};
    const updatedSettings = {
      ...currentSettings,
      calkCache: {
        ...existingCache,
        [periodEndsOn]: resultNarrative,
      },
    };

    await q
      .update(organizations)
      .set({ settings: updatedSettings })
      .where(eq(organizations.id, orgId));
  } catch (cacheErr) {
    console.warn("Failed to persist CALK narrative cache:", cacheErr);
  }

  return resultNarrative;
}
