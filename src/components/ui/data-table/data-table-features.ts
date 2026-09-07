import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * Fitur TanStack Table v9 yang dipakai semua DataTable.
 * Daftarkan di sini (bukan per tabel) agar tree-shaking konsisten:
 * filter kolom + search, sort, dan paginasi client-side.
 * Perlu row selection / visibility? Tambahkan feature-nya di sini.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
  // Slot meta kolom: `meta.numeric` = kolom angka (rata kanan + tabular).
  columnMeta: {} as { numeric?: boolean },
});

/** Teruskan sebagai generic pertama ke `ColumnDef`, `Column`, `Table`, `Row`. */
export type DataTableFeatures = typeof dataTableFeatures;
