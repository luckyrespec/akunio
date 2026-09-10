"use client";

import { CsvImportCard } from "@/components/import/csv-import-card";
import { importContactsCsvAction } from "@/server/actions/pos.actions";

const TEMPLATE = "nama;tipe;telepon;email\nBudi;PELANGGAN;08123456789;\nToko Jaya;VENDOR;;jaya@toko.id\n";

export function KontakImportCard() {
  return (
    <CsvImportCard
      title="Impor Kontak dari CSV"
      desc="Kolom: nama (wajib), tipe PELANGGAN/VENDOR/BOTH, telepon, email."
      templateCsv={TEMPLATE}
      templateName="template-kontak.csv"
      testId="import-kontak-csv"
      onImport={importContactsCsvAction}
    />
  );
}
