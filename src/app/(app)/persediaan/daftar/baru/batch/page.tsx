import { BatchItemClient } from "./batch-item-client";
import { BatchImportCard } from "./batch-import-card";

export const metadata = {
  title: "Input Cepat Barang Persediaan (Batch / Grid) | Akunio",
  description: "Input massal banyak SKU barang sekaligus seperti spreadsheet Excel.",
};

export default function BatchItemPage() {
  return (
    <div className="space-y-4">
      <BatchImportCard />
      <BatchItemClient />
    </div>
  );
}
