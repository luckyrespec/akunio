import { describe, it, expect } from "vitest";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table/data-table";
import type { DataTableFeatures } from "@/components/ui/data-table/data-table-features";

type Row = { id: string; memo: string; total: bigint };

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  { id: "memo", header: "Keterangan", accessorFn: (r) => r.memo },
  { id: "total", header: "Total", accessorFn: (r) => r.total },
];

const rows: Row[] = [{ id: "1", memo: "Setoran modal", total: 10000000000n }];

describe("DataTable slot opsional", () => {
  it("meneruskan topRows + footer + renderMobileCard tanpa mengubah default", () => {
    const topRows = React.createElement("tr", null, "saldo-awal");
    const footer = React.createElement("tr", null, "total");
    const renderMobileCard = (r: Row) => React.createElement("div", { key: r.id }, r.memo);
    const el = React.createElement(DataTable<Row>, {
      columns,
      data: rows,
      topRows,
      footer,
      renderMobileCard,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.topRows).toBe(topRows);
    expect(el.props.footer).toBe(footer);
    expect(el.props.renderMobileCard).toBe(renderMobileCard);
    // Default lama utuh: search/pagination/sorting tetap opsional.
    const plain = React.createElement(DataTable<Row>, { columns, data: rows });
    expect(plain.props.topRows).toBeUndefined();
    expect(plain.props.footer).toBeUndefined();
    expect(plain.props.renderMobileCard).toBeUndefined();
    expect(plain.props.pagination).toBeUndefined();
  });
});
