"use client";

import * as React from "react";
import {
  useTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { Search, SearchX } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dataTableFeatures, type DataTableFeatures } from "./data-table-features";
import { DataTablePagination } from "./data-table-pagination";

export interface DataTableSearch {
  /** Id kolom yang difilter (mis. `"memo"`). */
  key: string;
  placeholder?: string;
}

export interface DataTablePaginationOptions {
  /** Jumlah baris awal. Default 10. */
  defaultPageSize?: number;
  /** Pilihan di pemilih limit. Default [10, 20, 50]. */
  pageSizeOptions?: number[];
}

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<DataTableFeatures, TData>[];
  data: TData[];
  /** Search box (filter kolom `key`). Hilangkan prop untuk tanpa search. */
  search?: DataTableSearch;
  /** Paginasi client-side. `true` = default; objek = atur limit. */
  pagination?: boolean | DataTablePaginationOptions;
  /** Sort klik-header. Default aktif; matikan per kolom via `enableSorting: false`. */
  sorting?: boolean;
  /** Urutan awal, mis. `[{ id: "date", desc: true }]`. */
  initialSorting?: SortingState;
  /** Konten tambahan di kanan toolbar (tombol aksi, filter kustom). */
  toolbar?: React.ReactNode;
  /** Teks saat data kosong. */
  emptyText?: string;
  /** Caption aksesibilitas (sr-only bila perlu). */
  caption?: string;
  getRowId?: (row: TData, index: number) => string;
}

/**
 * DataTable generik gaya Paper & Ink: header kecil uppercase,
 * angka tabular rata kanan (via `meta.numeric`), paginasi + search opsional.
 *
 * Contoh:
 * ```tsx
 * const columns = columnHelper.columns([
 *   columnHelper.accessor("memo", { header: "Keterangan" }),
 *   columnHelper.accessor("total", {
 *     header: () => <div className="text-right">Total</div>,
 *     cell: ({ row }) => <div className="text-right tnum">{Money.formatIdr(row.original.totalMinor)}</div>,
 *     meta: { numeric: true },
 *   }),
 * ]);
 * <DataTable columns={columns} data={rows}
 *   search={{ key: "memo", placeholder: "Cari keterangan..." }}
 *   pagination={{ defaultPageSize: 20 }} />
 * ```
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  search,
  pagination = true,
  sorting = true,
  initialSorting = [],
  toolbar,
  emptyText = "Belum ada data.",
  caption,
  getRowId,
}: DataTableProps<TData>) {
  const pageSize =
    typeof pagination === "object" ? (pagination.defaultPageSize ?? 10) : 10;

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    initialState: {
      sorting: initialSorting,
      pagination: { pageIndex: 0, pageSize },
    },
    ...(sorting ? {} : { enableSorting: false }),
  });

  const showToolbar = search ?? toolbar;
  const searchColumn = search ? table.getColumn(search.key) : undefined;
  const searchValue = (searchColumn?.getFilterValue() as string | undefined) ?? "";
  const isFiltered = table.state.columnFilters.length > 0;
  const pageSizeOptions =
    typeof pagination === "object" ? (pagination.pageSizeOptions ?? [10, 20, 50]) : [10, 20, 50];

  return (
    <div className="space-y-3">
      {showToolbar ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {search && searchColumn ? (
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft"
              />
              <Input
                aria-label={search.placeholder ?? "Cari"}
                placeholder={search.placeholder ?? "Cari..."}
                value={searchValue}
                onChange={(e) => searchColumn.setFilterValue(e.target.value)}
                className="pl-9"
              />
            </div>
          ) : null}
          {toolbar ? <div className="sm:ml-auto">{toolbar}</div> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-rule bg-paper shadow-2xs">
        <Table>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHeader className="bg-canvas/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                    className={cn(
                      "text-[11px] font-semibold tracking-wider text-ink-soft uppercase",
                      header.column.columnDef.meta?.numeric && "text-right",
                    )}
                  >
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-canvas/30">
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "text-xs",
                        cell.column.columnDef.meta?.numeric && "tnum text-right tabular-nums",
                      )}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="px-4 py-12 text-center">
                  <SearchX aria-hidden className="mx-auto mb-3 size-8 text-ink-soft/40" />
                  <p className="text-sm font-medium text-ink">{emptyText}</p>
                  {isFiltered ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => table.resetColumnFilters()}
                    >
                      Atur ulang pencarian
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {pagination ? (
        <DataTablePagination table={table} pageSizeOptions={pageSizeOptions} />
      ) : null}
    </div>
  );
}
