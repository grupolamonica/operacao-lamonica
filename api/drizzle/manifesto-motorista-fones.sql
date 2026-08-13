-- Telefones do motorista gerenciados pelo operador (13/08/2026).
--
-- POR QUE UMA TABELA NOVA:
--   • O telefone hoje vem do Rodopar DENTRO do snapshot do coletor, e o snapshot vive só no
--     Redis (manifesto:pendencias:v1), SOBRESCRITO a cada 5 min por redis.set
--     (manifesto.service.ts). Número gravado nele desaparece no ciclo seguinte.
--   • NÃO escrevemos no Rodopar — é a fonte, read-only para nós.
--   • NÃO usamos drivers.phone: nenhuma rota da API escreve em `drivers` (populada por script
--     manual da migração, sem updated_by) e o snapshot não tem driver_id — o cruzamento seria
--     por NOME, texto livre, e o torre já tem um caso frágil desses (ILIKE '%nome%' LIMIT 1).
--   Então: tabela LATERAL com a chave natural do motorista no Rodopar (RODMOT.CODMOT), como
--   manifesto_tratativas faz com codman+filial+serie.
--
-- POR QUE A CHAVE É O MOTORISTA, NÃO O MANIFESTO (decisão Danilo 13/08): o número cadastrado
--   SEGUE O MOTORISTA — aparece nas viagens futuras dele, sem redigitar. Medido no Rodopar:
--   dos 87 manifestos abertos, 100% têm CODMO1 e casam com RODMOT (86 motoristas distintos).
--
-- COMO SE RISCA UM NÚMERO DO RODOPAR (ele não é uma linha nossa): a linha nasce NA HORA da
--   marcação, com origem='rodopar'. Ela é o OVERRIDE (a marca), não o cadastro do número — a
--   tela cruza por fone_digitos na exibição. Nada é escrito no Rodopar.
--
-- DEDUPLICAÇÃO: fone_digitos é a forma canônica (só dígitos, sem +55 e sem o 0 do DDD), então
--   "(081)98633-6617", "81 98633-6617" e "+5581986336617" viram todos "81986336617". A
--   normalização mora em UMA função (motorista-fones.service.ts, digitosFone) e é espelhada no
--   front (lib/telefone.ts). Se divergirem, o MESMO número aparece duas vezes na tela (uma
--   riscada, outra não) — mesmo contrato de normalizarSerie/chaveTratativa.
--
-- DESFAZER SEM PERDER O RASTRO: o estado atual é a coluna nao_funciona (uma linha por número,
--   para a tela cruzar em O(1)); a trilha de quem marcou e desmarcou vai para a tabela de
--   eventos NA MESMA TRANSAÇÃO. É o padrão gr_row_override + gr_override_events (e
--   op_status_override/op_status_event) — diferente do append-only puro de manifesto_tratativas,
--   porque ali a nota É o evento e aqui existe estado que a tela consulta a cada 30 s.
--
-- Sem CHECK em `origem`/`acao`: lista fechada é validada na API, não no banco — mesma razão do
-- `motivo` em manifesto-tratativas.sql (acrescentar valor não deve exigir migration).
--
-- Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS manifesto_motorista_fones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- chave natural do motorista no Rodopar (RODMOT.CODMOT), canonizada na API.
  -- varchar e não integer: CODMOT pode vir como char com padding.
  codmot          varchar(20)  NOT NULL,
  -- forma canônica do número (ver digitosFone) — é ela que deduplica
  fone_digitos    varchar(20)  NOT NULL,
  -- como o número foi digitado/visto: exibição e auditoria do que o operador tinha na frente
  numero          varchar(40)  NOT NULL,
  rotulo          varchar(40)  NOT NULL DEFAULT 'Celular',
  -- 'operador' = cadastrado por nós · 'rodopar' = linha existe só para carregar a marca
  origem          varchar(10)  NOT NULL DEFAULT 'operador',
  -- ESTADO ATUAL do riscado. Riscado continua VISÍVEL e clicável na tela (decisão Danilo):
  -- é aviso de "já tentaram", não bloqueio.
  nao_funciona    boolean      NOT NULL DEFAULT false,
  -- denormalizado: o snapshot é volátil e sem isto um relatório futuro não sabe de quem era o
  -- telefone (mesmo motivo de placa/destino em manifesto_tratativas)
  motorista_nome  varchar(120),
  created_by      uuid REFERENCES users(id),
  created_by_name varchar(120),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES users(id),
  updated_by_name varchar(120),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

-- Chave natural e alvo do ON CONFLICT. UNIQUE INDEX em vez de ALTER TABLE ADD CONSTRAINT:
-- só o índice tem IF NOT EXISTS, então reaplicar a migration numa tabela pré-existente passa
-- limpo. codmot é a 1ª coluna, então este índice também serve a leitura da tela (codmot IN ...).
CREATE UNIQUE INDEX IF NOT EXISTS manifesto_motorista_fones_chave_idx
  ON manifesto_motorista_fones (codmot, fone_digitos);

-- Trilha imutável: quem cadastrou, quem riscou, quem desfez. Mesmo papel de gr_override_events.
CREATE TABLE IF NOT EXISTS manifesto_motorista_fone_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codmot        varchar(20) NOT NULL,
  fone_digitos  varchar(20) NOT NULL,
  -- criou | marcou_nao_funciona | desmarcou
  acao          varchar(30) NOT NULL,
  numero        varchar(40),
  rotulo        varchar(40),
  origem        varchar(10),
  operator_id   uuid REFERENCES users(id),
  -- nome denormalizado: a trilha continua legível se o usuário for removido
  author_name   varchar(120),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manifesto_motorista_fone_eventos_chave_idx
  ON manifesto_motorista_fone_eventos (codmot, fone_digitos, created_at DESC);
