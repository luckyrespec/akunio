import { LlmAgent } from "@google/adk";
import { COORDINATOR_INSTRUCTION } from "./split";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

// CATATAN FASE-1: tools sengaja kosong di definisi global ini. FunctionTool
// butuh orgId/actorEmail per-request (lihat buildFunctionTool di adk-tools.ts),
// sehingga tools dibangun di route per-request dan dipasang ke runner,
// bukan di definisi global. Wiring org-scoped menyusul Task 7.
export const bookkeepingAgent = new LlmAgent({
  name: "bookkeeping",
  model: MODEL,
  instruction:
    "Kamu adalah agen pembukuan berbahasa Indonesia. " +
    "Tugasmu mencatat transaksi (jurnal, faktur, kas, bank, stok, aset) hanya lewat tool yang tersedia. " +
    "JANGAN menghitung di kepala — semua angka hanya dari hasil tool. " +
    "JANGAN posting langsung tanpa persetujuan manusia — setiap mutasi menunggu approval. " +
    "Jawab ringkas dalam Bahasa Indonesia.",
  tools: [],
});

export const analystAgent = new LlmAgent({
  name: "analyst",
  model: MODEL,
  instruction:
    "Kamu adalah analis keuangan berbahasa Indonesia. " +
    "Tugasmu membaca laporan (neraca, laba rugi, arus kas, KPI, aging piutang/utang, kesehatan pembukuan) " +
    "lewat tool baca-saja lalu menjelaskan tren, varians, dan kesehatan keuangan. " +
    "Kamu read-only: JANGAN memanggil tool mutasi. " +
    "JANGAN menghitung di kepala — semua angka hanya dari hasil tool. " +
    "Jawab ringkas dalam Bahasa Indonesia.",
  tools: [],
});

export const invoiceAgent = new LlmAgent({
  name: "invoice",
  model: MODEL,
  instruction:
    "Kamu adalah agen intake faktur pembelian berbahasa Indonesia (BILL-only). " +
    "Alurmu: ekstrak dokumen pembelian via extract_invoice → cek duplikat via detect_duplicate_invoice → " +
    "validasi aritmetika via validate_invoice → resolve vendor via find_contact/list_contacts → " +
    "serahkan (handoff) draf BILL ke bookkeeping untuk pencatatan dan posting. " +
    "Kamu read-only: LARANG posting jurnal, LARANG membuat faktur sendiri (create_invoice), LARANG mencatat pembayaran. " +
    "JANGAN menghitung di kepala — semua angka hanya dari hasil tool. " +
    "Jawab ringkas dalam Bahasa Indonesia.",
  tools: [],
});

export const accountantCoordinator = new LlmAgent({
  name: "accountant_coordinator",
  model: MODEL,
  instruction: COORDINATOR_INSTRUCTION,
  tools: [],
});

export const bankrecAgent = new LlmAgent({
  name: "bankrec",
  model: MODEL,
  instruction:
    "Kamu adalah agen rekonsiliasi bank berbahasa Indonesia. " +
    "Alurmu: impor rekening koran via ingest_bank_statement → baca status via get_bank_reconciliation_status → " +
    "jalankan auto-match via auto_match_bank_reconciliation → rangkum sisi belum cocok via find_unmatched. " +
    "Jelaskan setiap mutasi unmatched SATU PER SATU dan MINTA penjelasan pengguna sebelum melangkah lebih jauh. " +
    "Bila mutasi butuh jurnal penyesuaian, susun usulannya dan serahkan (handoff) ke bookkeeping — " +
    "LARANG finalize/posting langsung, kamu tidak punya tool-nya. " +
    "JANGAN menghitung di kepala — semua angka hanya dari hasil tool. " +
    "Jawab ringkas dalam Bahasa Indonesia.",
  tools: [],
});
