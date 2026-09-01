-- Oportunidades de Carga — DC-560 (modelo de dados) + DC-565 (margem v1).
--
-- POR QUE UMA TABELA: hoje a oportunidade chega por grupo de WhatsApp, site de frete
-- ou contato do cliente, é avaliada "no olho" e some. Sem registro não há comparação
-- entre uma oferta e outra, nem histórico de quanto se recusou e por quê. A regra do
-- setor (IMPL-5) é explícita: dado novo nasce no PostgreSQL central — planilha é
-- interface, nunca armazenamento.
--
-- SCHEMA: `public`, como TODAS as outras tabelas da torre. O DC-560 pede o schema
-- `operacao`, que NÃO EXISTE neste banco — nenhuma das ~30 tabelas usa schema
-- qualificado e o drizzle.config aponta para o default. Criar um schema só para esta
-- feature quebraria o padrão e o client do Drizzle. Ponto para a revisão da
-- Coordenação: ou a torre inteira migra para `operacao`, ou o ticket se alinha ao
-- `public`. Não dá para ser só esta tabela.
--
-- NÃO É CACHE: diferente de `cargas_open_loads` (snapshot substituído a cada sync),
-- aqui o dado é ORIGINAL — nasce na torre e não existe em lugar nenhum antes. Por isso
-- tem update (mudança de status) e não é recriada.
--
-- Aditivo e idempotente — drizzle-kit não gere estas tabelas (mesma regra da
-- phase14-cargas.sql: nada de db:push em produção).

CREATE TABLE IF NOT EXISTS oportunidades_carga (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- rota. Texto livre de propósito: a oferta chega como o remetente escreveu
  -- ("SSA x REC", "Salvador/BA → Recife"). Normalizar na escrita perderia o original;
  -- a normalização para casar distância acontece na leitura (margem.service).
  origem              varchar(160) NOT NULL,
  destino             varchar(160) NOT NULL,

  cliente             varchar(160),
  valor_frete         numeric(12,2) NOT NULL,
  data_carregamento   date,
  tipo_veiculo        varchar(40)  NOT NULL,

  -- de onde veio. Lista fechada validada na API, não no banco: acrescentar uma fonte
  -- nova não deve exigir migration (mesma decisão de manifesto_tratativas.motivo).
  fonte               varchar(20)  NOT NULL,
  -- QUAL grupo, QUAL site, QUAL contato. Sem isto "whatsapp" não diz nada quando a
  -- Fase 2 for medir qual fonte rende — e é o que liga esta linha ao DC-558.
  fonte_referencia    text,

  -- nova | analisada | aceita | descartada
  status              varchar(20)  NOT NULL DEFAULT 'nova',
  -- por que foi descartada. A oportunidade recusada é dado tão útil quanto a aceita.
  motivo_descarte     text,

  -- proprio | terceiro — muda o custo/km e portanto a margem
  modalidade          varchar(10)  NOT NULL DEFAULT 'terceiro',

  -- Distância informada à mão. Tem PRECEDÊNCIA sobre a derivada do histórico: quem
  -- está olhando a oferta sabe mais que a média. NULL = deixa o serviço estimar.
  distancia_km_manual numeric(10,2),

  -- ── margem (DC-565) ───────────────────────────────────────────────────────────
  -- O número fica GRAVADO junto da memória de cálculo e da versão que o produziu.
  -- Sem isso, quando a v2 trocar a base de custo, ninguém consegue explicar por que a
  -- margem daquela oportunidade de agosto era outra. O critério de aceite do DC-565 é
  -- "memória de cálculo visível ao usuário" — ela precisa sobreviver ao recálculo.
  margem_valor        numeric(12,2),
  margem_percentual   numeric(6,2),
  margem_memoria      jsonb,
  margem_versao       varchar(10),
  margem_calculada_em timestamptz,

  observacoes         text,

  -- autor. O nome vai denormalizado para a linha continuar legível se o usuário for
  -- removido — mesmo motivo do author_name em treatments/manifesto_tratativas.
  criado_por          uuid REFERENCES users(id),
  criado_por_nome     varchar(120),
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- leitura principal da tela: fila por status, mais recentes primeiro
CREATE INDEX IF NOT EXISTS oportunidades_carga_status_idx
  ON oportunidades_carga (status, criado_em DESC);

-- filtro por período de carregamento (a tela abre na semana corrente)
CREATE INDEX IF NOT EXISTS oportunidades_carga_data_idx
  ON oportunidades_carga (data_carregamento DESC NULLS LAST);

-- filtros de cliente e de fonte (DC-558: qual fonte rende mais)
CREATE INDEX IF NOT EXISTS oportunidades_carga_cliente_idx
  ON oportunidades_carga (cliente, criado_em DESC);
CREATE INDEX IF NOT EXISTS oportunidades_carga_fonte_idx
  ON oportunidades_carga (fonte, criado_em DESC);


-- ── Custo por km — REFERÊNCIA v1, TEMPORÁRIA ───────────────────────────────────
--
-- O Motor de Custo Único (DC-557) é que vai ser a fonte definitiva: tabela por rota e
-- tipo de veículo (DC-563, do Welisson, ainda em andamento) mais custo/km da frota
-- própria (DC-564). Enquanto essa base não existe, a margem v1 precisa de UM número
-- por (tipo de veículo, modalidade) para multiplicar pela distância.
--
-- POR QUE TABELA E NÃO ENV: quem sabe o custo é o Eduardo e o Joilson, não quem
-- deploya. Uma variável de ambiente exigiria redeploy a cada revisão de custo e
-- deixaria o valor invisível para quem confere a margem.
--
-- O NOME DIZ QUE É TEMPORÁRIO de propósito: quando o DC-557 entregar a tabela real,
-- esta sai. O contrato do endpoint de margem não muda (é o critério de aceite do
-- DC-565: "troca v1→v2 sem alteração na tela").
--
-- Nasce VAZIA. Sem linha vigente a margem não é calculada e o serviço diz exatamente
-- isso — melhor não ter número do que ter número inventado.
CREATE TABLE IF NOT EXISTS oportunidade_custo_km_v1 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_veiculo    varchar(40)  NOT NULL,
  modalidade      varchar(10)  NOT NULL,
  custo_km        numeric(10,4) NOT NULL,
  vigencia_inicio date         NOT NULL DEFAULT CURRENT_DATE,
  -- de onde saiu o número (planilha, DRE, reunião). A margem é conferida contra
  -- cálculo manual do Welisson/Eduardo — sem a procedência não dá para reconciliar.
  fonte_nota      text,
  atualizado_em   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT oportunidade_custo_km_v1_vigencia_uk
    UNIQUE (tipo_veiculo, modalidade, vigencia_inicio)
);

-- busca do custo vigente: o mais recente com vigência <= hoje
CREATE INDEX IF NOT EXISTS oportunidade_custo_km_v1_vigente_idx
  ON oportunidade_custo_km_v1 (tipo_veiculo, modalidade, vigencia_inicio DESC);
