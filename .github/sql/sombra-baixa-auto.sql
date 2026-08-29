-- Resumo da fase de SOMBRA da baixa automática de manifesto. SOMENTE LEITURA.
-- Disparado por .github/workflows/sombra-baixa-auto.yml.
--
-- A janela chega como variável do psql (`-v horas=N`), nunca por interpolação de
-- string no YAML: `make_interval(hours => :horas)` é tipado, e o valor não tem como
-- virar SQL. O workflow ainda valida que só vieram dígitos, mas defesa em
-- profundidade custa uma linha.

SET default_transaction_read_only = on;
\pset border 2

\echo ''
\echo '=== 1. CICLOS na janela — o job está mesmo rodando? ==='
-- Um ciclo a cada 10 min = ~6 por hora. Menos que isso é job parado ou falhando.
SELECT date_trunc('hour', avaliado_em)   AS hora,
       count(DISTINCT ciclo)             AS ciclos,
       count(*)                          AS avaliacoes,
       count(*) FILTER (WHERE elegivel)  AS elegiveis
  FROM manifesto_baixa_auto_avaliacoes
 WHERE avaliado_em > now() - make_interval(hours => :horas)
 GROUP BY 1 ORDER BY 1 DESC LIMIT 30;

\echo ''
\echo '=== 2. ELEGÍVEIS agora (última avaliação de cada manifesto) ==='
WITH ultima AS (
  SELECT DISTINCT ON (codman, filial, serie) *
    FROM manifesto_baixa_auto_avaliacoes
   WHERE avaliado_em > now() - make_interval(hours => :horas)
   ORDER BY codman, filial, serie, avaliado_em DESC
)
SELECT codman, serie, regra,
       referencia_cliente AS referencia,
       cliente_status,
       to_char(cliente_carimbo, 'DD/MM HH24:MI') AS carimbo,
       modo,
       to_char(avaliado_em, 'DD/MM HH24:MI')     AS avaliado
  FROM ultima
 WHERE elegivel
 ORDER BY cliente_carimbo NULLS LAST;

\echo ''
\echo '=== 3. POR QUE os outros reprovaram ==='
WITH ultima AS (
  SELECT DISTINCT ON (codman, filial, serie) *
    FROM manifesto_baixa_auto_avaliacoes
   WHERE avaliado_em > now() - make_interval(hours => :horas)
   ORDER BY codman, filial, serie, avaliado_em DESC
)
SELECT left(motivo, 70) AS reprova, count(*) AS qtd
  FROM ultima,
       LATERAL jsonb_array_elements_text(coalesce(reprovas, '[]'::jsonb)) AS motivo
 WHERE NOT elegivel
 GROUP BY 1 ORDER BY 2 DESC LIMIT 15;

\echo ''
\echo '=== 4. FRESCOR das fontes ==='
-- Fonte congelada responde 200 com dado velho. Aqui ela aparece como idade que
-- cresce, antes de virar decisão errada.
SELECT coalesce(regra, '(reprovado)')     AS regra,
       min(fonte_idade_seg)               AS idade_min_seg,
       max(fonte_idade_seg)               AS idade_max_seg,
       count(*)                           AS avaliacoes
  FROM manifesto_baixa_auto_avaliacoes
 WHERE avaliado_em > now() - make_interval(hours => :horas)
   AND fonte_idade_seg IS NOT NULL
 GROUP BY 1 ORDER BY 1;

\echo ''
\echo '=== 5. PEDIDOS de baixa por origem ==='
-- Enquanto o modo for sombra, TUDO aqui tem que ser origem='humano'. Qualquer
-- outra linha significa que a automação agiu sem ninguém ter ligado.
SELECT origem, count(*) AS qtd
  FROM manifesto_baixa_pedidos
 WHERE created_at > now() - make_interval(hours => :horas)
 GROUP BY 1 ORDER BY 2 DESC;
