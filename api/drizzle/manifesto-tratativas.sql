-- Tratativas de baixa de manifesto — justificativa do operador (12/08/2026).
--
-- POR QUE UMA TABELA: o snapshot de pendências vive só no Redis
-- (manifesto:pendencias:v1) e o coletor SOBRESCREVE tudo a cada ciclo de 5 min
-- (manifesto.service.ts, redis.set). Justificativa gravada junto ao snapshot seria
-- apagada em minutos — tem que ser persistida fora dele.
--
-- POR QUE NÃO REUSAR `treatments`: aquela tabela referencia alert_id/trip_id por UUID
-- e o manifesto NÃO tem entidade no banco — ele é identificado pela chave natural do
-- Rodopar (codman + filial + série). Reusar deixaria três FKs mutuamente exclusivas na
-- mesma tabela. As colunas aqui seguem o mesmo formato de `treatments` (append-only,
-- autor, texto, quando) para manter o vocabulário da casa.
--
-- APPEND-ONLY (decisão Danilo 12/08): nada é editado nem apagado. Correção se faz
-- escrevendo uma nota nova — o histórico é a auditoria de quem disse o quê e quando.
--
-- A nota SOBREVIVE à baixa do manifesto: quando ele deixa de ser SITUAC='E' sai da tela,
-- mas a linha fica aqui. É o que permite o relatório de por que a baixa demorou.
--
-- Aditivo e idempotente.
CREATE TABLE IF NOT EXISTS manifesto_tratativas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- chave natural do manifesto no Rodopar. serie NOT NULL DEFAULT '' para a chave
  -- composta nunca ter NULL (NULL nunca casa com NULL em índice/comparação).
  codman      integer      NOT NULL,
  filial      integer      NOT NULL,
  serie       varchar(10)  NOT NULL DEFAULT '',
  -- denormalizados no momento da nota: o snapshot já mudou quando alguém for ler o
  -- histórico, e sem isso o relatório não sabe de qual veículo/destino se tratava.
  placa       varchar(10),
  destino     varchar(120),
  -- motivo padronizado (lista fechada validada na API, não no banco: acrescentar um
  -- motivo novo não deve exigir migration)
  motivo      varchar(40)  NOT NULL,
  notes       text,
  operator_id uuid REFERENCES users(id),
  -- nome de quem escreveu, denormalizado: a nota tem que continuar legível mesmo que
  -- o usuário seja removido depois (mesmo motivo do author_name em treatments)
  author_name varchar(120),
  created_at  timestamptz  NOT NULL DEFAULT now()
);

-- leitura da tela: últimas notas de um manifesto, e o resumo por manifesto do snapshot
CREATE INDEX IF NOT EXISTS manifesto_tratativas_chave_idx
  ON manifesto_tratativas (codman, filial, serie, created_at DESC);

-- relatório por período (por que a baixa demorou / distribuição de motivos)
CREATE INDEX IF NOT EXISTS manifesto_tratativas_created_idx
  ON manifesto_tratativas (created_at DESC);
