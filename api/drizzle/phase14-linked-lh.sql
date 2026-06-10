-- Phase 14 — elo NÃO-único entre a viagem-painel (PNLA/PNLC, dona do code numérico)
-- e a carga do Cargas (CRG, dona do sheet_lh único uq_trips_sheet_lh). Permite o
-- listTrips fundir as duas representações da MESMA viagem numa linha só.
-- Aditiva, idempotente — NÃO usar db:push (protege o geom PostGIS).
ALTER TABLE trips ADD COLUMN IF NOT EXISTS linked_lh varchar(50);
CREATE INDEX IF NOT EXISTS idx_trips_linked_lh ON trips(linked_lh) WHERE linked_lh IS NOT NULL;
