import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useExportCsv, type ExportEntity, type ExportFilters } from '@/hooks/useExportCsv'

interface Props {
  entity: ExportEntity
  /**
   * Filters currently applied to the page. Passed verbatim to the backend
   * via query string — `useExportCsv` strips undefined/empty values.
   */
  filters?: ExportFilters
  label?: string
  variant?:
    | 'outline'
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'ghost'
    | 'link'
  size?: 'sm' | 'default' | 'lg' | 'icon'
  className?: string
}

/**
 * Generic "Exportar CSV" button used across Viagens / Alertas / Motoristas
 * pages (Phase 6 / D-06 / D-07).
 *
 * Behaviour: on click triggers a same-origin GET to /api/exports/{entity}.csv
 * (carrying the HttpOnly auth cookie) which streams a UTF-8 BOM CSV file.
 */
export function ExportButton({
  entity,
  filters = {},
  label = 'Exportar CSV',
  variant = 'outline',
  size = 'sm',
  className,
}: Props) {
  const trigger = useExportCsv()
  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => trigger(entity, filters)}
      className={className}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
