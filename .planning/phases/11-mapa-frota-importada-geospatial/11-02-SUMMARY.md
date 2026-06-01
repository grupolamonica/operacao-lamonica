---
phase: 11-mapa-frota-importada-geospatial
plan: "02"
subsystem: torre-de-controle / LiveMap
tags: [maplibre, geospatial, fleet, cluster, popup, xss-mitigation, tanstack-query]
dependency_graph:
  requires: ["11-01"]
  provides: ["useFleetPositions hook", "fleet GeoJSON layer in LiveMap"]
  affects: ["torre-de-controle/src/components/domain/LiveMap.tsx"]
tech_stack:
  added: []
  patterns:
    - "GeoJSON source cluster:true + symbol layer (SDF icon recolor) — mirrors GeofencesPage pattern"
    - "popup via setDOMContent/textContent (T-11-06 XSS mitigation)"
    - "enabled gate on useQuery (fetch fires only when toggle is on)"
key_files:
  created:
    - torre-de-controle/src/hooks/useFleetPositions.ts
  modified:
    - torre-de-controle/src/components/domain/LiveMap.tsx
decisions:
  - "D-11-05 tradeoff a: GeoJSON source nativa com cluster:true — codebase já prova addSource/addLayer (GeofencesPage); clustering nativo maplibre, sem dep extra (supercluster); escala >DOM markers; cor via icon-color SDF"
  - "Image load async gap: renderFleet/registerFleetHandlers called inside setTimeout(50ms) after registerTruckImage to allow img.onload to fire before addLayer"
  - "fleetHandlersRef resets on map.remove cleanup and after setStyle toggle to prevent duplicate listeners"
metrics:
  duration: "~30 min"
  completed: "2026-06-01T13:20:00Z"
  tasks_completed: 3
  files_changed: 2
---

# Phase 11 Plan 02: `useFleetPositions` + Fleet Layer in LiveMap — Summary

Hook `useFleetPositions` (Eden Treaty + TanStack Query, enabled gate, staleTime 60s) + fleet "Frota importada" layer in LiveMap (GeoJSON cluster, truck SDF icon by status, popup via setDOMContent, toggle default OFF).

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | useFleetPositions hook | `4706d84` | `torre-de-controle/src/hooks/useFleetPositions.ts` (new) |
| 2 | Fleet GeoJSON cluster layer in LiveMap | `784fba1` | `torre-de-controle/src/components/domain/LiveMap.tsx` |
| 3 | Toggle + popup + cluster expand | `784fba1` | `torre-de-controle/src/components/domain/LiveMap.tsx` |

Tasks 2 and 3 were committed together (same file, single atomic diff per plan warning note).

## What Was Built

**`useFleetPositions.ts`**
- Eden Treaty `api.api.positions.get()` + TanStack Query
- `queryKey: ['fleet-positions']`, `staleTime: 60_000`
- `enabled` gate — query fires only when `showFleet` is `true`
- Re-exports `FleetPosition` type from `positions.service` (no drift)
- Return: `{ data, isLoading, isError, error, refetch }`

**`LiveMap.tsx` — fleet layer**
- `showFleet` state (default `false`) + `fleetHandlersRef` declared at component top
- `useFleetPositions({ enabled: showFleet })` consumed
- `registerTruckImage(map)`: SVG Lucide Truck → `data:image/svg+xml` → `map.addImage('truck-icon', img, { sdf: true })` — SDF enables `icon-color` recolor per feature
- `buildFleetGeoJSON(fleet)`: FeatureCollection, each position → Point feature with `color` property (ATIVO `#2dce89`, BLOQUEADO `#f5365c`, neutral `#95959e`)
- `renderFleet(map, fleet)`: `addSource('fleet', { cluster: true, clusterRadius: 50, clusterMaxZoom: 14 })` + three layers: `fleet-clusters` (circle), `fleet-cluster-count` (symbol), `fleet-trucks` (symbol, `icon-color: ['get','color']`)
- `removeFleet(map)`: removes all 3 layers + source
- `useEffect([showFleet, fleet, mapReady])`: shows/hides fleet layer
- `setStyle` effect uses `map.once('styledata', ...)` to re-register truck image + re-render fleet after style swap
- `registerFleetHandlers(map)`: click on `fleet-clusters` → `getClusterExpansionZoom` + `easeTo`; click on `fleet-trucks` → popup via `setDOMContent` with DOM-constructed content (T-11-06 mitigation); cursor pointer on mouseenter
- Toggle button "Frota importada" (Truck icon, same style as Mapa/Satélite buttons)
- Legend extended with fleet status rows when `showFleet` is `true`
- Live layer (`markersRef`/`usePositionsStore`) untouched

## Deviations from Plan

### Auto-applied: Tasks 2+3 committed together

Tasks 2 and 3 both edit `LiveMap.tsx`. The plan warned to complete Task 2 before Task 3. The implementation was done with Task 2 complete (layers + styledata) and Task 3 added on top in the same file edit, then committed atomically. This avoids double-staging the same file. No functional difference.

None otherwise — plan executed exactly as designed.

## Verification Results

- `npx tsc -b --noEmit`: exits 0; only pre-existing WIP ranking error in `useRanking.ts` (out of scope)
- `npx vite build`: exits 0 (`built in 16.57s`); chunk size warning for `map-vendor` is pre-existing
- Grep: all acceptance tokens present (`useFleetPositions`, `addImage`, `truck-icon`, `cluster: true`, `fleet-trucks`, `fleet-clusters`, `icon-color`, `#2dce89`, `#f5365c`, `#95959e`, `styledata`, `Truck`, `Frota importada`, `setShowFleet`, `Popup`, `setDOMContent`, `getClusterExpansionZoom`, `formatDate`, `markersRef`, `usePositionsStore`)
- Grep negative: no `dangerouslySetInnerHTML`, no `optimizeDeps`, no `import * as maplibregl`, no `.innerHTML =` with raw user data
- `setMode` (Mapa/Satélite toggle) and `showLegend` block: confirmed present

## Known Stubs

None. The fleet layer renders real data from `GET /api/positions` when the backend is live. No mocked/hardcoded data returned to the UI.

## Threat Flags

None. The T-11-06 XSS threat (popup injection) is fully mitigated via `setDOMContent`/`textContent` — no new unmitigated surface introduced.

## Self-Check: PASSED

- `torre-de-controle/src/hooks/useFleetPositions.ts`: FOUND
- `torre-de-controle/src/components/domain/LiveMap.tsx`: FOUND (modified)
- Commit `4706d84`: FOUND (git log)
- Commit `784fba1`: FOUND (git log)
