-- Phase 14 — autor externo (operador do painel) nas tratativas/histórico.
-- Operadores do painel GAS (Filipe, Kevin, SISTEMA...) não são usuários do sistema,
-- então operator_id (FK users) fica NULL e o nome vem aqui. Aditivo e idempotente.
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS author_name varchar(120);
