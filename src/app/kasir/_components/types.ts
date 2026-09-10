export interface KasirCatalogItem {
  id: string;
  code: string;
  name: string;
  barcode: string | null;
  appBarcode: string | null;
  unit: string;
  category: string | null;
  qty: string;
  price: string;
  minStock: string;
}

export interface KasirCashAccount {
  id: string;
  code: string;
  name: string;
}

export interface KasirShift {
  id: string;
  cashAccountId: string;
  cashCode: string;
  cashName: string;
  openedAt: string | null;
}

export interface CartRow {
  id: string;
  qty: number;
  unitPriceMinor: bigint;
  discountMinor: bigint;
}
