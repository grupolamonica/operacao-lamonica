-- GR — COFRE de credenciais do rastreador (PR3). Migration ADITIVA e idempotente.
-- Aplicar MANUALMENTE (nunca db:push). Substitui a aba BaseRatreador da planilha
-- (login/senha em texto puro) por armazenamento CIFRADO em repouso.
--
-- Cifra: pgcrypto pgp_sym_encrypt/decrypt. A chave NUNCA fica no banco: vem do
-- backend (env RASTREADOR_VAULT_KEY) e entra como PARÂMETRO nas queries do
-- gr.vault.ts — jamais literal no SQL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Uma credencial por PLACA DE CAVALO (chave da BaseRatreador: placa → login).
CREATE TABLE IF NOT EXISTS rastreador_credentials (
  plate           varchar(10) PRIMARY KEY,          -- placa do cavalo (normalizada, sem hífen)
  provider        text NOT NULL DEFAULT '',          -- Sascar / Omnilink / Autotrac / ...
  login           text NOT NULL DEFAULT '',
  username        text NOT NULL DEFAULT '',
  password_cipher bytea,                             -- pgp_sym_encrypt(senha, :key). NUNCA texto puro.
  rastreador_id   text,                              -- ID/MCT do aparelho
  embarcador      text,
  notes           text,
  updated_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Trilha de auditoria do cofre (revelar/salvar/excluir) — o feed de auditoria do
-- Torre é read-only sobre tabelas-fonte; esta é a fonte do cofre. O REVELAR grava
-- aqui NA MESMA TRANSAÇÃO da decifra (fail-closed: sem trilha, sem senha).
CREATE TABLE IF NOT EXISTS gr_vault_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate       varchar(10) NOT NULL,
  action      varchar(10) NOT NULL,                  -- 'reveal' | 'upsert' | 'delete'
  operator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gr_vault_events_plate ON gr_vault_events (plate);
CREATE INDEX IF NOT EXISTS idx_gr_vault_events_occurred ON gr_vault_events (occurred_at);

-- RLS ligada SEM policies: nega anon/authenticated no PostgREST do Supabase.
-- A API do Torre conecta via DATABASE_URL (owner) e não é afetada. Inclui a
-- gr_vigencias (PR1, contém CPF/nome) que nasceu sem RLS.
ALTER TABLE rastreador_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE gr_vault_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gr_vigencias ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE rastreador_credentials IS
  'Cofre GR: credenciais do rastreador por placa de cavalo. Senha cifrada (pgcrypto; chave em RASTREADOR_VAULT_KEY, so no backend).';
COMMENT ON COLUMN rastreador_credentials.password_cipher IS
  'pgp_sym_encrypt(senha, :key) -> bytea. NUNCA texto puro; NUNCA selecionar no list (so IS NOT NULL).';
