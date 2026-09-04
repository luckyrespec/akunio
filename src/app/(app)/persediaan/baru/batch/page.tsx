import { BatchItemClient } from "./batch-item-client";

export const metadata = {
  title: "Input Cepat Barang Persediaan (Batch / Grid) | Akunio",
  description: "Input massal banyak SKU barang sekaligus seperti spreadsheet Excel.",
};

export default function BatchItemPage() {
  return <BatchItemClient />;
}
