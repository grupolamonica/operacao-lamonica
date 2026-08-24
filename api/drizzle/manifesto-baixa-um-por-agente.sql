-- A trava "um executando" passa de GLOBAL para POR AGENTE (24/08/2026).
--
-- POR QUE MUDA: o índice original (`manifesto-baixa-pedidos.sql:76-78`) serializava
-- o mundo inteiro, e o comentário dele dizia a premissa em voz alta:
--
--     "o Rodopar é sessão única por usuário (...) e como todas as máquinas usam o
--      MESMO login do robô, ela é global."
--
-- A premissa caiu. A partir de agora cada operador instala o robô na própria máquina
-- com a PRÓPRIA conta do portal Datapar e do Rodopar. Sessão única por usuário deixa
-- de implicar serialização global: dois logins diferentes não se derrubam.
--
-- O QUE NÃO MUDA: continua UM por máquina. Esse limite não veio do Rodopar, veio do
-- robô — ele dirige um Chrome visível numa sessão interativa, e dois de uma vez na
-- mesma máquina disputariam o mesmo canvas.
--
-- POR QUE `coalesce(agente, '')` E NÃO `agente` DIRETO: no Postgres NULL nunca é igual
-- a NULL, então um índice único sobre a coluna crua deixaria passar vários
-- `executando` com agente nulo — exatamente o caso de um cliente que reivindicou sem
-- se identificar. `coalesce` faz os nulos colidirem entre si e o guard-rail continua
-- valendo no pior cenário, que é para o que ele existe.
--
-- ORDEM IMPORTA: cria o novo ANTES de derrubar o antigo. Entre um comando e outro a
-- tabela nunca fica sem trava — se este script morrer no meio, o pior resultado é ter
-- as duas ao mesmo tempo, que é restritivo demais, não permissivo demais.
--
-- Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS manifesto_baixa_pedidos_um_por_agente_idx
  ON manifesto_baixa_pedidos (coalesce(agente, ''))
  WHERE situacao = 'executando';

DROP INDEX IF EXISTS manifesto_baixa_pedidos_um_por_vez_idx;

-- O "próximo da fila" agora é consultado junto com "este agente já tem algo em curso?".
-- O índice parcial de fila continua servindo; este ajuda a checagem por agente.
CREATE INDEX IF NOT EXISTS manifesto_baixa_pedidos_executando_agente_idx
  ON manifesto_baixa_pedidos (agente)
  WHERE situacao = 'executando';
