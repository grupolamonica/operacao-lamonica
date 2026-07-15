-- GR (Gerenciamento de Risco) — migration ADITIVA e idempotente.
-- Aplicar MANUALMENTE (NUNCA via drizzle-kit push — regra do projeto, protege a
-- geom PostGIS). Só CREATE TABLE IF NOT EXISTS — nenhum DROP, seguro re-rodar.
--
-- gr_vigencias: cache local das vigências de risco (Angellira/BRK/SPX) por
-- entidade (motorista por CPF, veículo por placa), puxadas do Cargas via o sync
-- do módulo gr (gr.sync). É CACHE (replace a cada run) — não é fonte de verdade.

CREATE TABLE IF NOT EXISTS gr_vigencias (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       varchar(10) NOT NULL,          -- 'driver' | 'vehicle'
  entity_key        varchar(20) NOT NULL,          -- CPF (driver) ou placa (vehicle), normalizado
  display_name      text,
  plate_role        varchar(12),                   -- HORSE | TRAILER_1 | TRAILER_2 (só vehicle)
  provider          varchar(12) NOT NULL,          -- 'angellira' | 'brk' | 'spx'
  raw_status        text,
  status_text       text,
  valid_until       date,
  conjunto_apto     boolean,                       -- só BRK (aptidão do conjunto)
  status            varchar(14) NOT NULL,          -- 'OK' | 'EXPIRING_SOON' | 'EXPIRED' | 'STATE' | 'UNKNOWN'
  days_until_expiry integer,
  checked_at        timestamptz,
  linked_driver_cpf varchar(14),                   -- veículo → motorista vinculado
  source            varchar(10) NOT NULL DEFAULT 'cargas',   -- 'cargas' | 'own'
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_gr_vigencias_entity_provider
  ON gr_vigencias (entity_type, entity_key, provider);
CREATE INDEX IF NOT EXISTS idx_gr_vigencias_status ON gr_vigencias (status);
CREATE INDEX IF NOT EXISTS idx_gr_vigencias_entity ON gr_vigencias (entity_type);
