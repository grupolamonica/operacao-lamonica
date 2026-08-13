-- Validação do sistema pelo operador (13/08/2026).
--
-- PARA QUE SERVE: medir se o sistema está CERTO. Quando ele aponta um manifesto como
-- DESCARREGADO, o operador confirma ("baixei — estava certo") ou nega ("não era"). Com a
-- amostragem acumulada sai a precisão do alerta — hoje inexistente, o sistema é confiável
-- "por impressão".
--
-- POR QUE NÃO É UM MOTIVO DE TRATATIVA (foi a primeira ideia): motivo responde "por que este
-- manifesto está aberto"; validação responde "o sistema acertou?". São perguntas diferentes, um
-- manifesto pode ter as duas, e misturar poluiria o relatório de motivos com uma fatia que não é
-- causa de atraso. Mas o impedimento decisivo é técnico — ver abaixo.
--
-- ⚠️ A FOTO DO MOMENTO É A RAZÃO DE EXISTIR DESTA TABELA. Para calcular acurácia é preciso saber
-- o que o sistema DIZIA quando o operador validou: o estado, a origem do sinal e as evidências
-- que o fundamentaram. O snapshot vive no Redis e é SOBRESCRITO a cada 5 min — depois não há
-- como reconstruir o que o operador viu. Então cada validação carrega essa foto denormalizada.
-- Sem ela, sobra um monte de "correto" registrado e nenhuma conta possível.
--
-- O QUE ISSO PERMITE MEDIR:
--   • precisão do alerta — dos apontados como descarregado, quantos estavam prontos de fato;
--   • precisão POR ORIGEM DO SINAL — se a SM erra 2% e o "parado 90 min" erra 30%, aponta
--     exatamente qual limiar ajustar, com dado em vez de palpite;
--   • falso negativo — operador que valida um DESCARREGANDO dizendo "já podia baixar" denuncia
--     que o sistema foi conservador demais;
--   • TEMPO ENTRE O ALERTA E A BAIXA (morosidade), cruzando baixado_em com estado_desde. Isso
--     resolve o que estava registrado como impossível: a baixa acontece no Rodopar e o torre só
--     vê o manifesto desaparecer do snapshot.
--
-- LIMITE HONESTO DA MEDIDA: o falso negativo é capturado por oportunidade (só quando alguém abre
-- um manifesto não-alertado e discorda), então NÃO é recall — é indício. Já a precisão é medível
-- de verdade, desde que a validação seja cobrada em todos os descarregados (decisão do Danilo),
-- porque validação opcional enviesa: valida-se o caso estranho e ignora-se o óbvio.
--
-- Append-only: cada validação é um fato datado. Se o operador se corrigir, registra outra — a
-- métrica usa a mais recente por manifesto.
--
-- Aditivo e idempotente.

CREATE TABLE IF NOT EXISTS manifesto_validacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- chave natural do manifesto no Rodopar (igual manifesto_tratativas)
  codman          integer      NOT NULL,
  filial          integer      NOT NULL,
  serie           varchar(10)  NOT NULL DEFAULT '',

  -- ── a foto do que o sistema dizia no instante da validação ──────────────────
  estado_sistema  varchar(30)  NOT NULL,   -- descarregado | descarregando | ...
  origem_estado   varchar(10),             -- sm | sascar | macro — qual fonte decidiu
  evidencias      text,                    -- códigos separados por vírgula, como vieram
  comprovacao_trava boolean,               -- true/false na frota, null em agregado
  na_frota        boolean,
  -- quando o estado atual começou (coletor: estado_desde_local). Com baixado_em, dá a duração.
  estado_desde    timestamptz,

  -- ── o veredito do operador ──────────────────────────────────────────────────
  veredito        varchar(20)  NOT NULL,   -- correto | incorreto
  -- só quando incorreto: ainda_descarregando | ainda_nao_chegou | ja_estava_baixado |
  -- veio_vazio | outro  (lista validada na API, não no banco)
  motivo_erro     varchar(40),
  observacao      text,
  -- instante em que o operador declarou ter baixado. É a única fonte de "quando baixou" que
  -- existe — mede o clique, não a ação no Rodopar, e a diferença é de minutos.
  baixado_em      timestamptz,

  -- denormalizados para o relatório sobreviver ao manifesto sair da tela
  placa           varchar(10),
  destino         varchar(120),

  operator_id     uuid REFERENCES users(id),
  author_name     varchar(120),
  created_at      timestamptz  NOT NULL DEFAULT now()
);

-- leitura da tela: última validação de cada manifesto (para marcar o que já foi validado)
CREATE INDEX IF NOT EXISTS manifesto_validacoes_chave_idx
  ON manifesto_validacoes (codman, filial, serie, created_at DESC);

-- métricas por período (precisão do alerta, precisão por origem)
CREATE INDEX IF NOT EXISTS manifesto_validacoes_created_idx
  ON manifesto_validacoes (created_at DESC);
