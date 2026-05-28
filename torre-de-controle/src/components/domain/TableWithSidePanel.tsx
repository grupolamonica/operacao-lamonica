import { type ColumnDef } from '@tanstack/react-table'
import { useEffect } from 'react'
import { DataTable } from './DataTable'
import { FixedPanel } from './FixedPanel'

interface Props<T extends { id: string }> {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  selectedItem: T | null
  onSelect: (item: T | null) => void
  renderPanel: (item: T) => React.ReactNode
  panelWidth?: number   // clamped: min 320 / max 520 / default 400
  pageSize?: number
  toolbar?: React.ReactNode
}

export function TableWithSidePanel<T extends { id: string }>({
  data, columns, selectedItem, onSelect, renderPanel,
  panelWidth = 400, pageSize, toolbar,
}: Props<T>) {
  const clampedWidth = Math.min(520, Math.max(320, panelWidth))
  const isOpen = selectedItem !== null

  useEffect(() => {
    if (selectedItem && !data.find(d => d.id === selectedItem.id)) {
      onSelect(null)
    }
  }, [data, selectedItem, onSelect])

  return (
    <div className="flex gap-4 items-start">
      <div className="flex-1 min-w-0">
        <DataTable
          data={data}
          columns={columns}
          onRowClick={(row) => onSelect(row.id === selectedItem?.id ? null : row)}
          selectedId={selectedItem?.id ?? null}
          pageSize={pageSize}
          toolbar={toolbar}
        />
      </div>

      {isOpen && (
        <FixedPanel width={clampedWidth}>
          {renderPanel(selectedItem)}
        </FixedPanel>
      )}
    </div>
  )
}
