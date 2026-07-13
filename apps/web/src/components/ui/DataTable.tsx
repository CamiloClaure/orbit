import { useState } from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface DataTableProps<T> {
  columns: ColumnDef<T, any>[]
  data: T[]
  globalFilter?: string
  onRowClick?: (row: T) => void
  /** Ancho mínimo de la tabla: por debajo, el contenedor hace scroll horizontal (móvil). */
  minWidth?: number
  /** Activa la paginación con controles prev/next. */
  paginated?: boolean
  /** Filas por página cuando paginated está activo. */
  pageSize?: number
}

export function DataTable<T>({
  columns,
  data,
  globalFilter,
  onRowClick,
  minWidth = 640,
  paginated = false,
  pageSize = 12,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(paginated ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: paginated ? { pagination: { pageSize } } : undefined,
  })

  return (
    <div className="-mx-px overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-line">
              {hg.headers.map((header) => {
                const sortable = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                return (
                  <th
                    key={header.id}
                    className="bg-panel/40 px-4 py-3 text-left text-[12px] font-medium tracking-wide text-faint whitespace-nowrap uppercase"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        disabled={!sortable}
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1.5',
                          sortable && 'transition-colors hover:text-muted',
                        )}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortable &&
                          (sorted === 'asc' ? (
                            <ChevronUp size={13} className="text-accent" />
                          ) : sorted === 'desc' ? (
                            <ChevronDown size={13} className="text-accent" />
                          ) : (
                            <ChevronsUpDown size={13} className="opacity-40" />
                          ))}
                      </button>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className={cn(
                'group border-b border-line-soft transition-colors',
                onRowClick && 'cursor-pointer hover:bg-white/[0.025]',
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3 align-middle whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.getRowModel().rows.length === 0 && (
        <div className="py-16 text-center text-sm text-faint">Sin resultados para la búsqueda.</div>
      )}
      {paginated && table.getFilteredRowModel().rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="font-mono text-[12px] text-faint">
            {(() => {
              const { pageIndex, pageSize: ps } = table.getState().pagination
              const totalRows = table.getFilteredRowModel().rows.length
              const from = pageIndex * ps + 1
              const to = Math.min(from + ps - 1, totalRows)
              return `${from}–${to} de ${totalRows}`
            })()}
          </span>
          <div className="flex items-center gap-1 text-[13px] text-muted">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="flex size-8 items-center justify-center rounded-lg border border-line transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="px-2 font-mono text-[12.5px]">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="flex size-8 items-center justify-center rounded-lg border border-line transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
