import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { useState } from 'react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DataTableProps<T extends { id: string }> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  onRowClick?: (row: T) => void
  selectedId?: string | null
  pageSize?: number
  emptyMessage?: string
}

export function DataTable<T extends { id: string }>({
  data, columns, onRowClick, selectedId, pageSize = 20,
  emptyMessage = 'Nenhum resultado encontrado.',
}: DataTableProps<T>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })

  const table = useReactTable({
    data,
    columns,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { columnFilters, pagination },
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
  })

  return (
    <div
      className="bg-card overflow-hidden"
      style={{
        borderRadius: '1rem',
        boxShadow: '0 0 2rem 0 rgba(136, 152, 170, 0.15)',
        border: 'none',
      }}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(hg => (
              <TableRow key={hg.id} style={{ borderBottom: '1px solid var(--border)' }}>
                {hg.headers.map(h => (
                  <TableHead
                    key={h.id}
                    className="px-4 py-3"
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--muted-foreground)',
                      opacity: 0.7,
                      background: 'transparent',
                    }}
                  >
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-sm text-muted-foreground py-8"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(
                    onRowClick && 'cursor-pointer',
                  )}
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: row.id === selectedId ? 'rgba(94,114,228,0.08)' : undefined,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (row.id !== selectedId) {
                      e.currentTarget.style.background = 'var(--accent)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (row.id !== selectedId) {
                      e.currentTarget.style.background = ''
                    }
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      className="px-4 py-3 text-sm"
                      style={{ color: 'var(--foreground)' }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {table.getPageCount() > 1 && (
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-xs text-muted-foreground">
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()} ({data.length} registros)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
