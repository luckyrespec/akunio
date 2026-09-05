/**
 * Engine Perhitungan PPh Final UMKM sesuai PP No. 55 Tahun 2022 jo. UU Harmonisasi Peraturan Perpajakan (UU HPP).
 * SAK EMKM Bab 15 (Pajak Penghasilan) mengatur bahwa beban pajak diakui berdasarkan peraturan perpajakan
 * yang berlaku tanpa mengakui aset atau liabilitas pajak tangguhan.
 */

export type TaxpayerType = "INDIVIDUAL" | "CORPORATE";

export interface TaxSettings {
  taxpayerType: TaxpayerType;
  npwp?: string;
  taxPeriodYear: number;
  pphFinalEnabled: boolean;
  autoMonthlyAccrual: boolean;
  ppnEnabled: boolean;
  ppnRatePercent: number;
  withholdingTaxEnabled: boolean;
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  taxpayerType: "INDIVIDUAL",
  taxPeriodYear: new Date().getFullYear(),
  pphFinalEnabled: true,
  autoMonthlyAccrual: true,
  ppnEnabled: false,
  ppnRatePercent: 12,
  withholdingTaxEnabled: false,
};

/**
 * Batas peredaran bruto tidak dikenai pajak bagi Wajib Pajak Orang Pribadi:
 * Rp 500.000.000,00 per tahun kalender (PP 55/2022 Pasal 60 ayat 2).
 * Representasi dalam minor units (dikali 100n): 50.000.000.000n.
 */
export const ANNUAL_INDIVIDUAL_THRESHOLD_MINOR = 50_000_000_000n;

/**
 * Tarif PPh Final UMKM: 0,5% (5 per mil).
 */
export const PPH_FINAL_RATE_NUMERATOR = 5n;
export const PPH_FINAL_RATE_DENOMINATOR = 1000n;

export interface CalculatePphFinalInput {
  monthlyRevenueMinor: bigint;
  cumulativePriorRevenueMinor: bigint;
  taxpayerType: TaxpayerType;
}

export interface PphFinalResult {
  monthlyRevenueMinor: bigint;
  cumulativePriorRevenueMinor: bigint;
  cumulativeNewRevenueMinor: bigint;
  taxableRevenueMinor: bigint;
  exemptRevenueMinor: bigint;
  taxDueMinor: bigint;
  isExemptLimitReached: boolean;
}

/**
 * Menghitung PPh Final 0,5% bulanan berdasarkan peredaran bruto dan fasilitas per tahun pajak.
 */
export function calculatePphFinal(input: CalculatePphFinalInput): PphFinalResult {
  const rawMonthly = input.monthlyRevenueMinor;
  const monthlyRevenueMinor = rawMonthly > 0n ? rawMonthly : 0n;
  const cumulativePriorRevenueMinor = input.cumulativePriorRevenueMinor > 0n ? input.cumulativePriorRevenueMinor : 0n;
  const cumulativeNewRevenueMinor = cumulativePriorRevenueMinor + monthlyRevenueMinor;

  let taxableRevenueMinor = 0n;
  let exemptRevenueMinor = 0n;
  let isExemptLimitReached = false;

  if (input.taxpayerType === "CORPORATE") {
    // Wajib Pajak Badan (PT, CV, Koperasi, Firma) tidak memperoleh fasilitas batas Rp 500 juta.
    // Dikenakan tarif 0,5% langsung dari rupiah pertama.
    taxableRevenueMinor = monthlyRevenueMinor;
    exemptRevenueMinor = 0n;
    isExemptLimitReached = true;
  } else {
    // Wajib Pajak Orang Pribadi: Mendapat fasilitas pembebasan hingga omzet kumulatif Rp 500 juta setahun.
    if (cumulativePriorRevenueMinor >= ANNUAL_INDIVIDUAL_THRESHOLD_MINOR) {
      // Batas 500jt telah terlampaui di bulan-bulan sebelumnya
      taxableRevenueMinor = monthlyRevenueMinor;
      exemptRevenueMinor = 0n;
      isExemptLimitReached = true;
    } else if (cumulativeNewRevenueMinor <= ANNUAL_INDIVIDUAL_THRESHOLD_MINOR) {
      // Kumulatif masih di dalam batas Rp 500jt, bebas pajak penuh
      taxableRevenueMinor = 0n;
      exemptRevenueMinor = monthlyRevenueMinor;
      isExemptLimitReached = cumulativeNewRevenueMinor === ANNUAL_INDIVIDUAL_THRESHOLD_MINOR;
    } else {
      // Bulan transisi: omzet kumulatif baru saja melampaui batas Rp 500jt.
      // Hanya selisih di atas Rp 500jt yang dikenai pajak.
      exemptRevenueMinor = ANNUAL_INDIVIDUAL_THRESHOLD_MINOR - cumulativePriorRevenueMinor;
      taxableRevenueMinor = cumulativeNewRevenueMinor - ANNUAL_INDIVIDUAL_THRESHOLD_MINOR;
      isExemptLimitReached = true;
    }
  }

  const taxDueMinor = (taxableRevenueMinor * PPH_FINAL_RATE_NUMERATOR) / PPH_FINAL_RATE_DENOMINATOR;

  return {
    monthlyRevenueMinor,
    cumulativePriorRevenueMinor,
    cumulativeNewRevenueMinor,
    taxableRevenueMinor,
    exemptRevenueMinor,
    taxDueMinor,
    isExemptLimitReached,
  };
}
