'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface DataTableColumn<T> {
  key: string;
  header: string | React.ReactNode;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T, index: number) => void;
  sortKey?: string | null;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string, order: 'asc' | 'desc') => void;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data found',
  onRowClick,
  sortKey,
  sortOrder,
  onSort,
}: DataTableProps<T>) {
  const handleHeaderClick = (col: DataTableColumn<T>) => {
    if (!col.sortable || !onSort) return;
    if (sortKey === col.key) {
      onSort(col.key, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSort(col.key, 'asc');
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                onClick={() => handleHeaderClick(col)}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500',
                  col.sortable && onSort && 'cursor-pointer select-none hover:bg-gray-100 hover:text-gray-700 transition-colors',
                  col.className
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && onSort && (
                    sortKey === col.key ? (
                      sortOrder === 'asc' ? (
                        <ChevronUp className="h-3.5 w-3.5 text-gray-700" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-gray-700" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300" />
                    )
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 rounded bg-gray-200" />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onRowClick?.(row, rowIndex)}
                className={cn(
                  'transition-colors',
                  rowIndex % 2 === 1 && 'bg-gray-50/50',
                  onRowClick && 'cursor-pointer hover:bg-blue-50/50'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn('align-middle px-4 py-3 text-left text-sm text-gray-900', col.className)}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
