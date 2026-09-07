"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type { ReactTable, RowData } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DataTableFeatures } from "./data-table-features";

interface DataTablePaginationProps<TData extends RowData> {
  table: ReactTable<DataTableFeatures, TData>;
  pageSizeOptions: number[];
}

/** Kontrol paginasi Bahasa Indonesia: limit, posisi halaman, navigasi. */
export function DataTablePagination<TData extends RowData>({
  table,
  pageSizeOptions,
}: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.state.pagination;
  const pageCount = table.getPageCount();
  const total = table.getFilteredRowModel().rows.length;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite" className="text-xs text-ink-soft">
        Menampilkan {from}–{to} dari {total} baris
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          Baris per halaman
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger aria-label="Baris per halaman" className="h-8 w-[72px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <p className="text-xs font-medium text-ink">
          Halaman {pageCount === 0 ? 0 : pageIndex + 1} dari {pageCount}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="Ke halaman pertama"
          >
            <ChevronsLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Ke halaman terakhir"
          >
            <ChevronsRight aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
