import { type ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { DataTable } from './DataTable'

interface Props<T extends { id: string }> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  selectedItem: T | null
  onSelect: (item: T | null) => void
  renderPanel: (item: T) => React.ReactNode
  panelWidth?: number   // clamped: min 320 / max 520 / default 400
  pageSize?: number
}

export function TableWithSidePanel<T extends { id: string }>({
  data, columns, selectedItem, onSelect, renderPanel,
  panelWidth = 400, pageSize,
}: Props<T>) {
  const clampedWidth = Math.min(520, Math.max(320, panelWidth))
  const isOpen = selectedItem !== null

  // P1-HIGH: Reset selection when selectedItem is filtered out of the current dataset.
  // Prevents stale detail panels showing data for rows no longer visible in the table.
  useEffect(() => {
    if (selectedItem && !data.find(d => d.id === selectedItem.id)) {
      onSelect(null)
    }
  }, [data, selectedItem, onSelect])

  return (
    // CSS Grid: minmax(0, 1fr) is CRITICAL — prevents table column from overflowing when panel is open.
    // Plain '1fr' = minmax(auto, 1fr) which can grow beyond available space.
    // min-h-0 prevents grid height from escaping parent flex container.
    <div
      className="grid min-h-0 h-full"
      style={{
        gridTemplateColumns: isOpen
          ? `minmax(0, 1fr) ${clampedWidth}px`
          : 'minmax(0, 1fr)',
        columnGap: isOpen ? '16px' : '0',
      }}
    >
      {/* Table area — min-w-0 prevents horizontal blowout; overflow-auto allows its own H-scroll */}
      <div className="min-w-0 overflow-auto">
        <DataTable
          data={data}
          columns={columns}
          onRowClick={(row) => onSelect(row.id === selectedItem?.id ? null : row)}
          selectedId={selectedItem?.id ?? null}
          pageSize={pageSize}
        />
      </div>

      {/* Panel area — only rendered when open. SidePanelLayout uses ScrollArea for independent V-scroll. */}
      {isOpen && (
        <div
          className="min-w-0 overflow-hidden"
          style={{ width: `${clampedWidth}px` }}
        >
          {renderPanel(selectedItem)}
        </div>
      )}
    </div>
  )
}
