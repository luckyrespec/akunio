export interface PageContext {
  pathname: string;
  title: string;
  label: string;
  summary?: string;
}

const PATH_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard Keuangan",
  "/jurnal": "Jurnal Umum",
  "/jurnal/baru": "Input Jurnal Baru",
  "/jurnal/ai": "Jurnal AI Draft",
  "/buku-besar": "Buku Besar",
  "/laporan": "Laporan Keuangan",
  "/laporan/laba-rugi": "Laporan Laba Rugi",
  "/laporan/neraca": "Neraca Keuangan",
  "/laporan/arus-kas": "Laporan Arus Kas",
  "/laporan/perubahan-ekuitas": "Perubahan Ekuitas",
  "/temuan": "Diagnosa & Anomali",
  "/pengaturan": "Pengaturan Akun & Periode",
  "/aturan": "Standar SAK EMKM",
  "/persediaan/daftar/baru/batch": "Input Cepat Persediaan (Grid / Batch)",
  "/persediaan/daftar/baru": "Tambah Barang Persediaan",
  "/persediaan/opname": "Sesi Stok Opname",
  "/persediaan/daftar": "Katalog & Mutasi Persediaan",
};

export function getActivePageContext(): PageContext {
  if (typeof window === "undefined") {
    return { pathname: "", title: "", label: "Aplikasi" };
  }

  const pathname = window.location.pathname;
  const title = document.title || "Akunio";

  // Match known paths or fallback to formatted pathname
  let label = PATH_LABELS[pathname];
  if (!label) {
    for (const [key, val] of Object.entries(PATH_LABELS)) {
      if (pathname.startsWith(key)) {
        label = val;
        break;
      }
    }
  }
  if (!label) {
    label = pathname.replace(/^\//, "").replace(/-/g, " ") || "Dasbor";
    label = label.charAt(0).toUpperCase() + label.slice(1);
  }

  // Extract contextual summary from DOM
  let summary: string | undefined;

  // 1. Explicit assistant context tag
  const explicitEl = document.querySelector("[data-assistant-context]");
  if (explicitEl) {
    summary = explicitEl.getAttribute("data-assistant-context") || undefined;
  }

  // 2. Active headings or filters if explicit tag not provided
  if (!summary) {
    const mainHeading = document.querySelector("main h1, main h2");
    const activeFilter = document.querySelector("[data-active-filter]");
    const parts: string[] = [];
    if (mainHeading?.textContent) {
      parts.push(mainHeading.textContent.trim());
    }
    if (activeFilter?.textContent) {
      parts.push(`Filter: ${activeFilter.textContent.trim()}`);
    }
    if (parts.length > 0) {
      summary = parts.join(" • ");
    }
  }

  return {
    pathname,
    title,
    label,
    summary,
  };
}
