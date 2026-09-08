/**
 * Kapan pengingat tutup tahun muncul di dasbor (pure, unit-tested).
 * Aturan: hanya bulan Desember kalender dan periode Desember masih OPEN.
 * - Banner: sepanjang Desember (tutup manual per sesi di klien).
 * - Modal: bila belum "jangan tampilkan periode ini", atau paksa di
 *   7 hari terakhir Desember walau sudah di-dismiss.
 */
export interface YearEndPromptInput {
  todayISO: string;
  decPeriodStatus: "OPEN" | "CLOSED" | "LOCKED" | null;
  dismissedPeriod: string | null;
}

export interface YearEndPromptState {
  active: boolean;
  year: number;
  periodName: string;
  daysLeftInYear: number;
  showBanner: boolean;
  showModal: boolean;
  forceModal: boolean;
}

export function getYearEndPromptState(input: YearEndPromptInput): YearEndPromptState {
  const year = Number(input.todayISO.slice(0, 4));
  const month = input.todayISO.slice(5, 7);
  const day = Number(input.todayISO.slice(8, 10));
  const periodName = `${year}-12`;
  const base = {
    active: false,
    year,
    periodName,
    daysLeftInYear: 0,
    showBanner: false,
    showModal: false,
    forceModal: false,
  };
  if (month !== "12" || !Number.isInteger(year)) return base;
  if (input.decPeriodStatus !== "OPEN") return { ...base, active: true };
  const dismissed = input.dismissedPeriod === periodName;
  const forceModal = Number.isFinite(day) && day >= 25;
  return {
    active: true,
    year,
    periodName,
    daysLeftInYear: Math.max(0, 31 - (Number.isFinite(day) ? day : 31)),
    showBanner: true,
    showModal: forceModal || !dismissed,
    forceModal,
  };
}
