"use client";

import { CsvImportCard } from "@/components/import/csv-import-card";
import { importProductsCsvAction } from "@/server/actions/pos.actions";

const TEMPLATE = "nama;harga_jual;stok_awal;harga_beli;barcode\nTeh Botol;5000;24;3500;\n";

export function BatchImportCard() {
  return (
    <CsvImportCard
      title="Impor Produk dari CSV"
      desc="Pindahan dari spreadsheet: nama, harga_jual, stok_awal, harga_beli, barcode. Baris gagal dilaporkan per baris."
      templateCsv={TEMPLATE}
      templateName="template-produk.csv"
      testId="import-produk-csv"
      onImport={importProductsCsvAction}
    />
  );
}
