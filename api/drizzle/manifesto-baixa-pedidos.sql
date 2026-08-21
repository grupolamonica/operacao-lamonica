-- Fila de pedidos de baixa de manifesto (20/08/2026).
--
-- PARA QUE SERVE: o operador aperta um botão na tela e o robô de baixa
-- (repo robo-baixa-manifesto) executa. Esta tabela é a fila entre os dois.
--
-- POR QUE UMA FILA, E NÃO UMA CHAMADA DIRETA: o robô não é uma API. Ele dirige o
-- Rodopar pelo canvas do RemoteApp (OCR + CDP), roda numa máquina Windows com
-- Chrome, e o fluxo leva dezenas de segundos até o banco do Rodopar confirmar.
-- Requisição síncrona esperando isso daria timeout e mentiria para o operador.
--
-- ⚠️ ESTA TABELA CONSERTA UM DEFEITO QUE EXISTE HOJE, não introduz um risco novo.
-- O robô guarda em SQLite local (%LOCALAPPDATA%) a memória de "Efetuar clicado e
-- não confirmado". Com três operadores rodando cada um no seu PC, essa memória
-- está PARTIDA EM TRÊS: um clique em aberto no PC de A é invisível para o robô no
-- PC de B, que então clica de novo — aconteceu em 17/08/2026 com o manifesto
-- 69240. Uma fila central é a memória compartilhada que o %LOCALAPPDATA% não
-- consegue ser.
--
-- POR QUE O BANCO DO RODOPAR NÃO RESPONDE ISSO: `SITUAC='E'` com `DATBAI` nula
-- significa tanto "ninguém tocou" quanto "o Efetuar foi clicado e o processo do
-- Rodopar ainda não efetivou". São indistinguíveis lá. Quem repetir olhando só
-- para "continua 'E'" clica duas vezes.
--
-- QUEM PEDIU A BAIXA SÓ EXISTE AQUI: o Rodopar carimba `USUEFE='AGENDADOR'` em
-- toda baixa efetivada pelo processo dele — do robô E de pessoa clicando Efetuar.
-- O ERP não distingue. Se esta tabela não guardar o operador, ninguém guarda.
--
-- Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS manifesto_baixa_pedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- chave natural do manifesto no Rodopar (igual manifesto_tratativas/validacoes)
  codman          integer      NOT NULL,
  filial          integer      NOT NULL,
  serie           varchar(10)  NOT NULL DEFAULT '',

  -- na_fila | executando | concluido | falhou | conferencia | cancelado
  --
  -- `conferencia` é o estado que justifica a tabela: rc 6 e 11 do robô significam
  -- "pode ter gravado, uma PESSOA precisa conferir no Rodopar". Nunca volta para a
  -- fila sozinho, e bloqueia pedido novo do mesmo manifesto (índice abaixo).
  situacao        varchar(20)  NOT NULL DEFAULT 'na_fila',

  -- ── quem pediu ──────────────────────────────────────────────────────────────
  operator_id     uuid REFERENCES users(id),
  author_name     varchar(120),
  created_at      timestamptz  NOT NULL DEFAULT now(),

  -- ── execução ────────────────────────────────────────────────────────────────
  reivindicado_em timestamptz,             -- quando o agente pegou da fila
  agente          varchar(120),            -- máquina/usuário que executou
  concluido_em    timestamptz,
  rc              integer,                 -- código de saída do robô
  mensagem        text,                    -- a mensagem DELE, sem reescrever
  -- veio do registro do robô: houve clique em Efetuar nesta tentativa? É o que
  -- decide se repetir é seguro — ver docs/CONVENCAO-ROBO.md §3 no repo do robô.
  efetuar_clicado boolean,

  -- ── foto do momento do pedido (o snapshot do Redis é sobrescrito a cada 5 min) ─
  placa           varchar(10),
  destino         varchar(120),
  estado_sistema  varchar(30)
);

-- UM pedido ativo por manifesto. É o guard-rail principal, e mora no BANCO de
-- propósito: regra de unicidade em código de aplicação perde para corrida entre
-- dois operadores clicando junto. `conferencia` entra na lista porque manifesto
-- com dúvida aberta não pode receber pedido novo.
CREATE UNIQUE INDEX IF NOT EXISTS manifesto_baixa_pedidos_ativo_idx
  ON manifesto_baixa_pedidos (codman, filial, serie)
  WHERE situacao IN ('na_fila', 'executando', 'conferencia');

-- UM executando no mundo. O Rodopar é sessão única por usuário: duas execuções
-- simultâneas derrubam uma à outra (rc=8). A serialização é requisito, não
-- otimização — e como todas as máquinas usam o MESMO login do robô, ela é global.
CREATE UNIQUE INDEX IF NOT EXISTS manifesto_baixa_pedidos_um_por_vez_idx
  ON manifesto_baixa_pedidos (situacao)
  WHERE situacao = 'executando';

-- leitura da tela: pedido mais recente de cada manifesto
CREATE INDEX IF NOT EXISTS manifesto_baixa_pedidos_chave_idx
  ON manifesto_baixa_pedidos (codman, filial, serie, created_at DESC);

-- o agente pede "o próximo da fila"
CREATE INDEX IF NOT EXISTS manifesto_baixa_pedidos_fila_idx
  ON manifesto_baixa_pedidos (situacao, created_at)
  WHERE situacao = 'na_fila';
