-- Perf: última posição por motorista em driver_positions (~970k linhas).
--
-- A query recorrente (syncPositions, job 'positions' a cada 3min +
-- getFleetPositions do LiveMap):
--
--   SELECT DISTINCT ON (motorista_norm) motorista_norm, lat, lng
--   FROM driver_positions
--   ORDER BY motorista_norm, data_posicao DESC
--
-- levava 10-12s: o plano era Incremental Sort sobre
-- idx_driver_positions_motorista_norm + fetch de heap das ~970k linhas.
-- O UNIQUE (motorista_norm, data_posicao) existente NÃO atende o ORDER BY
-- misto (ASC, DESC), e Postgres não faz loose index scan em DISTINCT ON —
-- por isso o índice precisa (a) casar a ordenação exata e (b) COBRIR as
-- colunas lidas (INCLUDE lat, lng) para virar Index-Only Scan sem heap.
--
-- Aplicar no banco (Torre Supabase prod ocgifdytaqlubuokjkwv) como statement
-- ÚNICO, FORA de transação — CREATE INDEX CONCURRENTLY não roda em bloco de
-- transação (MCP: usar execute_sql, NÃO apply_migration; psql: sem -1):
--
--   psql "$DATABASE_URL_DIRECT" -f api/drizzle/perf-driver-positions-last-pos.sql
--
-- Idempotente — safe re-rodar (IF NOT EXISTS).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_positions_norm_data
  ON driver_positions (motorista_norm, data_posicao DESC)
  INCLUDE (lat, lng);

-- Se CONCURRENTLY falhar no meio, o índice fica INVALID — dropar e re-rodar:
--   DROP INDEX IF EXISTS idx_driver_positions_norm_data;
