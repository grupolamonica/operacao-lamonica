/**
 * Hook for triggering server-side CSV exports.
 *
 * Per phase 6 plan 06-07 (D-06, D-07, D-09):
 *   - Operator clicks "Exportar CSV" on a page (Viagens / Alertas / Tratativas / Motoristas)
 *   - Currently-applied filters are forwarded as URL query string parameters
 *   - Trigger uses `window.location.href`: the browser carries the HttpOnly
 *     auth cookie automatically. Backend responds with
 *     `Content-Disposition: attachment`, so the page does NOT actually
 *     navigate — the browser starts a download and the user stays put.
 *
 * Threat coverage:
 *   - T-06.07-02 (open redirect) — URL is constructed from compile-time
 *     `VITE_API_URL` + literal `/api/exports/${entity}` where `entity` is a
 *     TypeScript literal union; no portion is user-controlled.
 */

export type ExportEntity = 'viagens' | 'alertas' | 'tratativas' | 'motoristas'

/**
 * Loose shape accepted as filters input. Specific domain types
 * (`TripFilters`, `AlertFilters`, `DriverFilters`) lack an index signature
 * so we accept any object and serialise its enumerable own properties.
 */
export type ExportFilters = Record<string, unknown> | object

export function useExportCsv() {
  return (entity: ExportEntity, filters: ExportFilters = {}) => {
    const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

    // Drop undefined / empty filter values so we don't serialise "status=undefined".
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(filters as Record<string, unknown>)) {
      if (value === undefined || value === null || value === '') continue
      cleaned[key] = String(value)
    }

    const qs = new URLSearchParams(cleaned).toString()
    window.location.href = `${apiUrl}/api/exports/${entity}.csv${qs ? `?${qs}` : ''}`
  }
}
