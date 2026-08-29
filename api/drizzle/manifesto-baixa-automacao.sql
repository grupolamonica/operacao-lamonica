-- F2/F3 — baixa automática de manifesto (28/08/2026).
--
-- A regra aprovada: status TERMINAL no sistema do CLIENTE, com carimbo de hora.
--   SPX/Shopee    Status Operacional = 'DESCARREGADO' e ETA DESTINO REAL preenchido
--   Nestlé/Galileu nestle_embarques.codstatembarque = 3 (FINALIZADO) e entrega_dtahrfim
-- casados por RODCON.ORDCOM (LT… = LH Trip Number; B1… = grupos_id).
--
-- Backtest de 1.246 manifestos SPX em 55 dias: o sinal chegou DEPOIS da decisão
-- humana em 1 caso (0,1%, por 36 min). Mediana de folga: 31,5 h.
--
-- Esta migration é ADITIVA e IDEMPOTENTE. Ela NÃO liga nada: quem liga é
-- MANIFESTO_BAIXA_AUTO_ENABLED no deploy. Roda pelo workflow db-migrate.yml
-- (dry-run com `confirmar` vazio primeiro), nunca por drizzle-kit push — push não
-- recria índice parcial.

-- ── 1. Origem e prova no PEDIDO ─────────────────────────────────────────────
-- Criadas junto com a tabela de avaliações, numa migration só, porque aplicar
-- migration em produção é o passo de maior atrito do fluxo: melhor um dry-run que
-- dois. As colunas ficam inertes até F3.
--
-- `origem` com DEFAULT 'humano' e NOT NULL: todo pedido que já existe foi humano,
-- e o default garante que pedido antigo continue contando como humano em qualquer
-- consulta futura sem precisar de UPDATE.
ALTER TABLE manifesto_baixa_pedidos ADD COLUMN IF NOT EXISTS origem             varchar(12) NOT NULL DEFAULT 'humano';
-- qual regra disparou: 'spx_descarregado' | 'galileu_finalizado'. Null em pedido humano.
ALTER TABLE manifesto_baixa_pedidos ADD COLUMN IF NOT EXISTS regra              varchar(40);
-- a referência que casou (ORDCOM). É o que permite auditar um pedido meses depois,
-- quando o snapshot do Redis que o originou já foi sobrescrito mil vezes.
ALTER TABLE manifesto_baixa_pedidos ADD COLUMN IF NOT EXISTS referencia_cliente varchar(60);
-- o status LITERAL que o cliente informava no momento do pedido, e o carimbo dele.
-- Guardados como texto/timestamp e não como booleano: "por que este manifesto foi
-- baixado?" precisa da afirmação original, não da conclusão dela.
ALTER TABLE manifesto_baixa_pedidos ADD COLUMN IF NOT EXISTS cliente_status     varchar(40);
ALTER TABLE manifesto_baixa_pedidos ADD COLUMN IF NOT EXISTS cliente_carimbo    timestamptz;
-- todas as guardas avaliadas, com o valor de cada uma. jsonb porque o conjunto de
-- guardas vai crescer e uma coluna por guarda viraria migration a cada ajuste.
ALTER TABLE manifesto_baixa_pedidos ADD COLUMN IF NOT EXISTS guardas            jsonb;

-- O teto diário conta SOBRE ESTA TABELA, não em memória: contador em processo
-- zera no restart e o teto viraria decoração. Índice parcial porque a consulta é
-- sempre "quantos automáticos hoje".
CREATE INDEX IF NOT EXISTS manifesto_baixa_pedidos_auto_dia_idx
  ON manifesto_baixa_pedidos (created_at)
  WHERE origem <> 'humano';

-- ── 2. A AFIRMAÇÃO, append-only ─────────────────────────────────────────────
-- Toda avaliação do job vira uma linha aqui, INCLUSIVE as que reprovaram — e é
-- justamente isso que torna o falso positivo mensurável. A memória do projeto já
-- registra o erro oposto: gravar só o desfecho e esquecer a afirmação torna o erro
-- imensurável, porque o denominador desaparece.
--
-- Separada de manifesto_baixa_pedidos de propósito: a maioria das avaliações NUNCA
-- vira pedido (reprovou, ou o teto estava cheio, ou estava em sombra), e misturar
-- as duas faria a tabela de pedidos mentir sobre quantas baixas foram pedidas.
CREATE TABLE IF NOT EXISTS manifesto_baixa_auto_avaliacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avaliado_em   timestamptz NOT NULL DEFAULT now(),

  -- chave do manifesto, no mesmo formato dos pedidos (codman, filial, serie)
  codman        integer     NOT NULL,
  filial        integer     NOT NULL,
  serie         varchar(10) NOT NULL,

  -- 'sombra' enquanto MANIFESTO_BAIXA_AUTO_ENABLED=false; 'real' depois.
  -- A coluna existe para que a virada de F2 para F3 seja legível na própria série
  -- histórica: sem ela, "a precisão melhorou" e "mudamos de modo" ficariam
  -- indistinguíveis no gráfico.
  modo          varchar(10) NOT NULL,

  -- veredito e o porquê
  elegivel      boolean     NOT NULL,
  regra         varchar(40),
  reprovas      jsonb,

  -- a foto do que o CLIENTE dizia — a evidência que sustenta a afirmação
  referencia_cliente varchar(60),
  cliente_status     varchar(40),
  cliente_carimbo    timestamptz,
  -- frescor da fonte NO MOMENTO da avaliação. Fonte congelada responde 200 com dado
  -- velho, e sem este campo uma sequência de avaliações erradas ficaria
  -- indistinguível de uma sequência correta.
  fonte_idade_seg    integer,

  guardas       jsonb,

  -- preenchido quando a avaliação virou pedido de verdade (F3). Null em sombra e
  -- em avaliação reprovada. É o que liga afirmação -> ato -> desfecho.
  pedido_id     uuid REFERENCES manifesto_baixa_pedidos(id) ON DELETE SET NULL,

  -- Identidade do ciclo, preenchida pela aplicação (o instante de início do ciclo,
  -- truncado). Coluna explícita em vez de expressão no índice DE PROPÓSITO:
  -- date_trunc sobre timestamptz é STABLE, não IMMUTABLE — depende do TimeZone da
  -- sessão — e o Postgres recusa índice sobre ela. Com a coluna, o dono do conceito
  -- "ciclo" passa a ser quem de fato o define, que é o job.
  ciclo         timestamptz NOT NULL
);

-- "o que o job decidiu sobre este manifesto?" — a consulta da tela
CREATE INDEX IF NOT EXISTS manifesto_baixa_auto_avaliacoes_chave_idx
  ON manifesto_baixa_auto_avaliacoes (codman, filial, serie, avaliado_em DESC);

-- "quantos elegíveis por dia, por regra?" — a consulta da medição
CREATE INDEX IF NOT EXISTS manifesto_baixa_auto_avaliacoes_serie_idx
  ON manifesto_baixa_auto_avaliacoes (avaliado_em DESC)
  WHERE elegivel;

-- ── 3. Uma avaliação por manifesto por ciclo ────────────────────────────────
-- O job roda a cada 10 min sobre ~65 manifestos. Sem esta trava, um retry ou dois
-- workers sobrepostos inflariam a série histórica com duplicatas, e a taxa de acerto
-- medida sobre ela ficaria errada — silenciosamente, que é o pior modo.
CREATE UNIQUE INDEX IF NOT EXISTS manifesto_baixa_auto_avaliacoes_ciclo_idx
  ON manifesto_baixa_auto_avaliacoes (codman, filial, serie, ciclo);
