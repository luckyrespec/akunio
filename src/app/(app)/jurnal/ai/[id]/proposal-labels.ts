// Label presentasi untuk usulan akun Doctor SAK + sitasi terverifikasi.
// Semua teks di sini Bahasa Indonesia; murni (tanpa DB) agar teruji unit.
// UI review-client hanya merender data yang dibawa JSON draf — tak ada
// tebakan akun di helper ini.

export function proposalChipLabel(line: {
  accountCode: string;
  proposed?: boolean;
}): string {
  return line.proposed === true ? "akun baru" : "periksa";
}

export function citationLabel(c: {
  docId: string;
  bab: string;
  paragraph: string;
}): string {
  const cleanDoc = c.docId.replace(/-/g, " ");
  return `${cleanDoc} Bab ${c.bab} Paragraf ${c.paragraph}`;
}

// Detail usulan akun baru: "kode · nama · induk <parentCode>" — hanya dari
// medan yang dibawa JSON draf (AccountProposal Task 7).
export function proposalDetailLabel(p: {
  code: string;
  name: string;
  parentCode: string;
}): string {
  return `${p.code} · ${p.name} · induk ${p.parentCode}`;
}

// Ruling R7: petakan kode SCREAMING_SNAKE mentah Task 7 ke kalimat Bahasa
// Indonesia yang ramah di jalur error detail temuan. Bentuk masukan boleh
// "KODE" atau "KODE: rincian" — kode tak dikenal dikembalikan apa adanya
// agar tak menyembunyikan informasi.
const FINDING_ERROR_MESSAGES: Record<string, string> = {
  TEMUAN_SUDAH_SELESAI:
    "Temuan ini sudah selesai — saldonya sudah pulih sehingga tak perlu draf koreksi.",
  TIPE_TEMUAN_TIDAK_DIDUKUNG:
    "Tipe temuan ini belum didukung untuk draf koreksi otomatis.",
  SITASI_TIDAK_VALID:
    "Sitasi SAK tidak valid sehingga draf tidak dibuat — coba lagi.",
  AKUN_PENAMPUNG_TIDAK_ADA:
    "Akun penampung (1600/1200) tidak ada di COA — lengkapi COA dulu sebelum membuat draf.",
  SAK_BELUM_TERSEDIA:
    "Dokumen SAK belum tersedia — jalankan ingest dokumen SAK EMKM terlebih dahulu.",
};

export function findingErrorMessage(raw: string): string {
  const code = raw.split(":")[0]?.trim() ?? "";
  return FINDING_ERROR_MESSAGES[code] ?? raw;
}
