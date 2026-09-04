import { ItemBaruClient } from "./item-baru-client";

export const metadata = {
  title: "Tambah Barang Persediaan | Akunio",
  description: "Daftarkan SKU baru dan saldo awal persediaan barang dagang.",
};

export default function ItemBaruPage() {
  return <ItemBaruClient />;
}
