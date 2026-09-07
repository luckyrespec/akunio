"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { Column, RowData } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DataTableFeatures } from "./data-table-features";

interface DataTableColumnHeaderProps<TData extends RowData, TValue> {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
  className?: string;
}

/**
 * Header kolom sortable: klik untuk asc → desc → mati.
 * Non-sortable otomatis jadi teks biasa (hormati `enableSorting: false`).
 */
export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <span className={cn(className)}>{title}</span>;
  }
  const sorted = column.getIsSorted();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === "asc")}
      aria-label={`Urutkan kolom ${title}`}
      className={cn("-ml-2 h-7 gap-1 px-2 text-[11px] font-semibold tracking-wider text-ink-soft uppercase hover:text-ink", className)}
    >
      {title}
      {sorted === "desc" ? (
        <ArrowDown aria-hidden />
      ) : sorted === "asc" ? (
        <ArrowUp aria-hidden />
      ) : (
        <ChevronsUpDown aria-hidden className="opacity-50" />
      )}
    </Button>
  );
}
