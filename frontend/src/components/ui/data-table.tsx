import * as React from "react";
import {
  ColumnDef,
  RowData,
  flexRender,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const coreFeatures = tableFeatures({});

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<typeof coreFeatures, TData, any>[];
  data: TData[];
  containerClassName?: string;
  emptyMessage?: string;
  stickyHeader?: boolean;
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  containerClassName,
  emptyMessage = "Sin datos.",
  stickyHeader = true,
}: DataTableProps<TData>) {
  const table = useTable<typeof coreFeatures, TData>({
    features: coreFeatures,
    data,
    columns,
  });

  const rows = table.getRowModel().rows;

  return (
    <Table containerClassName={containerClassName}>
      <TableHeader
        className={
          stickyHeader
            ? "sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"
            : undefined
        }
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="border-b border-border hover:bg-transparent">
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className="text-[11px] font-mono text-muted-foreground whitespace-nowrap h-8 bg-card"
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((row) => (
            <TableRow key={row.id} className="border-b border-border/50">
              {row.getAllCells().map((cell) => (
                <TableCell key={cell.id} className="py-2 text-xs max-w-[260px] truncate align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
