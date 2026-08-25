-- Token do agente: liga a PESSOA que usa a tela ao ROBÔ que roda no PC dela (25/08/2026).
--
-- O QUE ELE RESOLVE. Hoje o agente autentica com `MANIFESTO_API_KEY`, uma chave só,
-- global, e — pior — a MESMA que o coletor Sascar usa para enviar snapshot. Três
-- consequências que doem:
--
--   1. quem tiver a chave do PC de um operador também consegue injetar pendências falsas;
--   2. revogar a máquina de uma pessoa derruba todas as outras e o coletor junto;
--   3. o campo `agente` é string livre não autenticada — a máquina que aparece na tela
--      é auto-declarada, e não serve para auditoria.
--
-- Com token por usuário, o servidor sabe QUEM está pedindo trabalho, e isso é o que
-- permite a fila rotear: o pedido que a pessoa criou vai para o robô DELA. Decisão do
-- Danilo em 25/08 — a baixa roda sob a conta Rodopar de quem pediu, então o rastro no
-- ERP e o registro no torre contam a mesma história.
--
-- POR QUE SÓ O HASH. O valor aparece UMA VEZ na tela, no instante em que é gerado, e
-- nunca mais. Um cofre que devolve o segredo depois é um cofre que vaza quando o banco
-- vaza. Perdeu, gera outro — recuperar não é um recurso que valha a pena ter.
--
-- sha256 e não bcrypt de propósito: o token é aleatório de 32 bytes, não uma senha
-- escolhida por gente. Não há dicionário a defender, e este hash é conferido a cada
-- ~15s por agente — bcrypt aqui só gastaria CPU do servidor.
--
-- Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS manifesto_agente_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- sha256 do token em hex (64 chars). O valor NUNCA é gravado.
  token_hash    char(64) NOT NULL,
  -- primeiros caracteres do token, para a pessoa reconhecer qual é qual na lista
  -- sem que isso ajude a adivinhar o resto.
  prefixo       varchar(12) NOT NULL,
  -- de quem é a máquina, escrito pela pessoa ("PC da recepção"). Só para leitura humana.
  apelido       varchar(60),

  criado_em     timestamptz NOT NULL DEFAULT now(),
  -- carimbado a cada uso, mas NÃO a cada requisição: o agente pergunta a cada ~15s e
  -- um UPDATE por pergunta seria escrita constante à toa. Ver `baixa.service.ts`.
  usado_em      timestamptz,
  revogado_em   timestamptz,
  -- quem revogou: a própria pessoa ou um admin. Null enquanto ativo.
  revogado_por  uuid REFERENCES users(id)
);

-- A busca do caminho quente: token apresentado -> hash -> dono. Único porque dois
-- tokens com o mesmo hash seria colisão de sha256, e se acontecer é bug, não dado.
CREATE UNIQUE INDEX IF NOT EXISTS manifesto_agente_tokens_hash_idx
  ON manifesto_agente_tokens (token_hash);

-- UM token ativo por pessoa. É deliberado, e é o que torna o roteamento simples:
-- "o robô da Maria" precisa ser uma coisa só. Gerar um novo revoga o anterior — o
-- caminho para trocar de máquina é gerar de novo, não acumular.
CREATE UNIQUE INDEX IF NOT EXISTS manifesto_agente_tokens_ativo_idx
  ON manifesto_agente_tokens (user_id)
  WHERE revogado_em IS NULL;
