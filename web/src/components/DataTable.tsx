"use client";

import { useRef, useState } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  sortField?: string;
  render: (row: T) => React.ReactNode;
  csvValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  totalCount: number;
  page: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  searchPlaceholder?: string;
  onSearchChange?: (search: string) => void;
  ordering?: string;
  onOrderingChange?: (ordering: string) => void;
  filters?: React.ReactNode;
  toolbarActions?: React.ReactNode;
  csvFilename?: string;
  loading: boolean;
  emptyMessage: string;
  onRowClick?: (row: T) => void;
  selectedRowKey?: string | null;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  totalCount,
  page,
  pageSize = 25,
  onPageChange,
  searchPlaceholder = "Search...",
  onSearchChange,
  ordering = "",
  onOrderingChange,
  filters,
  toolbarActions,
  csvFilename,
  loading,
  emptyMessage,
  onRowClick,
  selectedRowKey,
}: DataTableProps<T>) {
  const [searchInput, setSearchInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchInput = (val: string) => {
    setSearchInput(val);
    if (!onSearchChange) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(val);
    }, 300);
  };

  const handleSortClick = (field: string) => {
    if (!onOrderingChange) return;
    if (ordering === field) {
      onOrderingChange(`-${field}`);
    } else if (ordering === `-${field}`) {
      onOrderingChange("");
    } else {
      onOrderingChange(field);
    }
  };

  const handleExportCsv = () => {
    if (!csvFilename) return;
    const exportCols = columns.filter((col) => col.csvValue);
    if (exportCols.length === 0) return;

    const headerRow = exportCols.map((c) => escapeCsvCell(c.header)).join(",");
    const dataRows = rows.map((row) =>
      exportCols.map((c) => escapeCsvCell(c.csvValue!(row))).join(",")
    );
    const csvContent = [headerRow, ...dataRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const startIndex = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = Math.min(totalCount, page * pageSize);

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-md overflow-hidden">
      {/* Unified Toolbar */}
      {(onSearchChange || filters || csvFilename || toolbarActions) && (
        <div className="p-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
            {onSearchChange && (
              <input
                type="search"
                value={searchInput}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder={searchPlaceholder}
                className="border border-[#CBD5E1] rounded px-3 py-1.5 text-xs bg-white w-64 max-w-full focus:outline-none focus:border-[#0F5338]"
              />
            )}
            {filters}
          </div>

          <div className="flex items-center gap-2">
            {csvFilename && rows.length > 0 && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 text-xs font-medium border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] text-[#0F172A] rounded"
              >
                Export CSV
              </button>
            )}
            {toolbarActions}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-xs font-medium text-[#475569]">
              {columns.map((col) => {
                const isSortedAsc = col.sortField && ordering === col.sortField;
                const isSortedDesc = col.sortField && ordering === `-${col.sortField}`;
                return (
                  <th
                    key={col.key}
                    className={`py-2.5 px-4 whitespace-nowrap ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.sortField && onOrderingChange ? (
                      <button
                        type="button"
                        onClick={() => handleSortClick(col.sortField!)}
                        className="inline-flex items-center gap-1 hover:text-[#0F172A] font-medium"
                      >
                        <span>{col.header}</span>
                        <span className="font-mono text-[10px] text-[#64748B]">
                          {isSortedAsc ? "↑" : isSortedDesc ? "↓" : "↕"}
                        </span>
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 px-4 text-center text-xs text-[#64748B]"
                >
                  Loading records...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 px-4 text-center text-xs text-[#64748B]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                const isSelected = selectedRowKey === id;
                return (
                  <tr
                    key={id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`${onRowClick ? "cursor-pointer" : ""} ${
                      isSelected ? "bg-[#ECFDF5]/60" : "hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`py-2.5 px-4 ${
                          col.align === "right" ? "text-right" : "text-left"
                        }`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3 text-xs text-[#475569]">
        <div className="font-mono tabular-nums">
          Showing {startIndex}&ndash;{endIndex} of {totalCount} records
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            className="px-2.5 py-1 border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] rounded disabled:opacity-40"
          >
            Previous
          </button>
          <span className="font-mono tabular-nums px-1">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
            className="px-2.5 py-1 border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
