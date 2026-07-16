-- GR / SPX — override manual + Observação do operador (col AA + dropdowns do PainelGR).
-- Aditivo e idempotente (padrão do projeto: aplicado manualmente, NUNCA via db:push).
--
-- gr_row_override: 1 linha por viagem (lh). O operador pode:
--   (a) só anotar (liberado=false + observacao) — equivalente à col. AA da planilha;
--   (b) liberar com ressalva (liberado=true) — override do gate calculado, como os
--       dropdowns editáveis da planilha ("libero mesmo vencido porque X").
-- gr_override_events: trilha imutável (quem/quando/o quê) — mesmo padrão de
-- op_status_event e gr_vault_events.

CREATE TABLE IF NOT EXISTS gr_row_override (
  lh          text PRIMARY KEY,
  liberado    boolean NOT NULL DEFAULT false,
  observacao  text,
  updated_by  uuid NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gr_override_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lh          text NOT NULL,
  action      text NOT NULL, -- upsert | delete
  liberado    boolean,
  observacao  text,
  operator_id uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gr_override_events_lh ON gr_override_events (lh);

-- RLS service-role only (o front NUNCA acessa direto; só o backend da Torre).
ALTER TABLE gr_row_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE gr_override_events ENABLE ROW LEVEL SECURITY;
