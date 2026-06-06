# RECONCILIAÇÃO SLA — Torre × Painel GAS (Controle de Viagens)

Spec acionável para alinhar, **por viagem ao vivo**, os campos da tabela do painel GAS
(`HTMLControleViagens.txt` / `ScriptControleViagens.txt`) ao que o sistema Torre persiste
e exibe hoje. Tudo o que o painel mostra é **recalculado no cliente a cada 5s**; o Torre
precisa replicar essas fórmulas no backend (cron `monitoring` */5min + `toTripDto`) para
casar os 12 códigos da comparação gid0×DB.

Convenção global (idêntica ao painel): **atraso = previsão − prazo. Positivo = ATRASADO,
negativo = adiantado.** Em horas decimais, formatado `±HH:MM`.

Funções de motor JÁ portadas e prontas (apenas não plugadas):
`api/src/lib/regulamentacao.ts`
- `calcularHorasViagemComRegulamentacao(km, params=PARAMS_PADRAO): number` — horas decorridas com lei do motorista (pausa 0.5h após 5.5h contínuas, descanso 11h após 8h de jornada). Tem `safety++ < 10000`.
- `calcularAdiantamentoHoras(kmFalta, prazo: Date|null, agora: Date, morosidadeHoras=0, params): number|null` — `+`=adiantado / `−`=atrasado. Se `kmFalta <= 2` usa `prazoAjustado − agora` direto.
- `formatarAdiantamento(horas: number|null): string` — `±HH:MM`, limiar `<0.0167h → "+00:00"`.
- `PARAMS_PADRAO = { velocidadeMedia:65, limiteConducaoContinua:5.5, pausaMinimaContinua:0.5, jornadaDiariaConducao:8, descansoInterJornada:11, kmParaConsiderarChegou:2 }`.

> ATENÇÃO — sinal: `calcularAdiantamentoHoras` devolve **+ = adiantado**. O painel mostra
> **Atraso (Horas)** com **+ = atrasado**. Logo `atrasoHoras = -calcularAdiantamentoHoras(...)`
> (o GAS faz exatamente isso em `verificarECriarTickets`: `atrasoH = -calcularAdiantamentoHoras_(...)`).
> Para o display `±HH:MM` do painel use `formatarAdiantamento(atrasoHoras)` SOBRE o valor já invertido,
> OU `formatarAdiantamento(adiantamento)` e troque o rótulo. Padronizar em UMA convenção (ver §2c).

---

## 1. Tabela-resumo (campo a campo)

| # | Campo do painel | Lógica do painel (fórmula) | Estado atual Torre | Gap | Severidade |
|---|---|---|---|---|---|
| 1 | **Km Total** | col40 `Dist.Viagem` (cadastro da rota) | `distance_total` via `distancias()` (`DISTANCE_TOTAL`), fallback `distorigem+distfaltante` | Nenhum — bate exato nas 12 viagens | OK |
| 2 | **Km que Falta** | col `Dist.Destino` (= `distfaltante`) | `distance_total − distance_done` (computado), não persiste `kmFalta` puro | `kmFalta` deve ser `t.distfaltante` cru, não `total−done` (que embute desvio de rota) | MÉDIA |
| 3 | **Progresso** | `(kmTotal−kmFalta)/kmTotal*100`, clamp 0..100 | `progress_pct` = `min(100, round(done/total*100))` | Bate dentro da variação de horário | OK |
| 4 | **Partida Programada** | col `Saída Origem` | `window_start` = `iso(t.dataInicio)` | `dataInicio` é início real, não saída programada. Aceitável p/ MVP | BAIXA |
| 5 | **Prazo Final** | col25 `Previsão Chegada Destino` (cadastro/SLA **fixo**) **+ morosidade** | `window_end` = `iso(ent.previsao)` (= ETA dinâmica) | `window_end` está errado: hoje == `eta`. API live NÃO expõe deadline contratual separado. Precisa de fonte/estratégia (ver §2b) | **ALTA** |
| 6 | **Previsão de Chegada** | **COMPUTADA**: se `kmFalta≤2` → "Chegou"; senão `agora + calcularHorasViagemComRegulamentacao(kmFalta)` (com pausas) | `eta` = `iso(ent.previsao)` (previsão crua da API, sem recálculo) | `eta` deve ser recalculado com o motor lei-do-motorista a cada sync | **ALTA** |
| 7 | **Status** (ATRASADO/NO PRAZO/CONCLUÍDO) | `atrasoHoras = previsão − prazo`; `>0 → ATRASADO`, senão `NO PRAZO`. Concluído por chegada real ou status textual. Sobreposições: AGUARDANDO PARTIDA / PRAZO ESGOTADO | `sla_status` = **NULL em todas as live** (upsert não seta a coluna; cron não chama evaluator) | Persistir `sla_status` no upsert com a fórmula km/velocidade do painel; mapear enum | **ALTA** |
| 8 | **Atraso (Horas) ±HH:MM** | `formatarAtrasoParaHHMM(atrasoHoras)` sobre o atraso em horas (§4 do relatório 1) | Inexistente (coluna, DTO e cálculo) | Criar coluna `adiantamento_horas` + computar via `calcularAdiantamentoHoras` no upsert; formatar no front | **ALTA** |
| 9 | **Tickets (resumo)** | último ticket aberto (`TICKET_LABELS[tipo]`) + nº extras; "—" se concluído ou sem tickets | `alerts` existem por `trip_id` (detectores), mas o DTO da viagem **não traz resumo** | Agregar contagem/tipo/severidade de `alerts` por `tripId` no `toTripDto` | MÉDIA |
| 10 | **Condução** (Intensivo/Regular) | TOGGLE manual por linha (localStorage). Default `false` → **"Intensivo"** (lei aplicada); clicar → "Regular" (ignorarLei) | Inexistente | Coluna `conducao_regime` (default `'intensivo'`) + DTO + toggle UI; afeta `params` do recálculo | MÉDIA |
| 11 | **Meta KM/Dia** ("45 KM/hoje", "720 KM/dia") | `dias = datas-calendário(hoje → ETA)`; `dias≤0 → kmFalta "KM/hoje"`; senão `kmFalta/ceil(dias) "KM/dia"`; teto `velMedia*jornadaDia` → "(Máx.)" | Inexistente | Computar derivado no `toTripDto` a partir de `kmFalta` + `eta` (não precisa coluna) | MÉDIA |
| — | **KPIs topo** (Total, No Prazo, Atrasadas, Concluídas, Alertas, Tickets Pendentes, % No Prazo) | contagem sobre universo data+cliente; % = NoPrazo/(NoPrazo+Atrasado) | `dashboard.service.ts` já usa proxy SQL `now()+km/65 vs window_end+morosidade` — fiel ao GAS | Bate ±1-2. Após corrigir `window_end` (§2b) os KPIs ficam exatos | BAIXA |

---

## 2. Plano de implementação (ORDENADO, por arquivo)

### (a) Ligar o motor SLA ao `monitoring.adapter` — popular `sla_status`, `eta` computado, `morosidade`

**Arquivo:** `api/src/adapters/angellira/monitoring.adapter.ts`

**Por quê:** é o único caminho que roda automaticamente sobre viagens ativas (cron `monitoring` */5min,
`angellira-cron.ts:51`). O `evaluateAllActiveTrips` do `sla.service` não está em cron nenhum e usa enum
incompatível (`quebrado/multa`). Decisão: **classificar no upsert** com a lógica km/velocidade (fiel ao
painel), NÃO via `sla.engine` temporal.

**1. Importar o motor** (topo do arquivo):
```ts
import { calcularHorasViagemComRegulamentacao, calcularAdiantamentoHoras, PARAMS_PADRAO } from '../../lib/regulamentacao'
```

**2. Após calcular `distTotal`/`distDone`/`pct` (linha ~161), computar os derivados SLA.**
Inserir antes do `await db.execute(...)`:
```ts
const agora = new Date()
const kmFalta = distFalt > 0 ? distFalt : Math.max(0, distTotal - distDone)  // §1 item 2: prefira distfaltante cru
const moros   = num(t.morosidade ?? t.moros ?? 0)   // ver §2b: hoje a API live não traz; fica 0 até termos fonte
const prazoFinal = prazoFinalDate(t, ent)            // ver §2b — Date do deadline contratual (ou previsao como fallback)

// Previsão computada (lei do motorista) — substitui iso(ent.previsao)
let etaComputada: string | null
if (kmFalta <= PARAMS_PADRAO.kmParaConsiderarChegou) {
  etaComputada = agora.toISOString()                 // "Chegou"
} else {
  const tRest = calcularHorasViagemComRegulamentacao(kmFalta, PARAMS_PADRAO)
  etaComputada = Number.isFinite(tRest) ? new Date(agora.getTime() + tRest * 3600000).toISOString() : iso(ent.previsao)
}

// Atraso em horas (+ = atrasado, igual ao painel) e classificação
const adiant = calcularAdiantamentoHoras(kmFalta, prazoFinal, agora, moros, PARAMS_PADRAO) // + = adiantado
const atrasoHoras = adiant == null ? null : -adiant                                         // inverte → + = atrasado
const mapped = mapStatus(t.statusnome ?? t.status_viagem)
let slaStatus: string | null = null
if (mapped === 'completed' || mapped === 'cancelled') {
  slaStatus = null                                   // concluída: não entra em NO PRAZO/ATRASADO live
} else if (atrasoHoras == null) {
  slaStatus = null
} else if (atrasoHoras > 0) {
  slaStatus = 'atrasado'
} else {
  slaStatus = 'no_prazo'
}
// SEM_GPS: se quiser paridade total, marcar 'sem_sinal' quando a última posição > 1h (cruzar driver_positions).
// Opcional aqui; os detectores já emitem ticket SEM_GPS. Manter no_prazo/atrasado para o badge.
```

**3. Helper de prazo (`prazoFinalDate`)** — ver §2b para a regra. No mínimo:
```ts
function prazoFinalDate(t: any, ent: any): Date | null {
  // Preferir um campo de deadline contratual quando existir; senão cair na previsão crua.
  const s = t.prazoEntrega ?? t.previsaoChegadaDestino ?? ent.previsao ?? t.dataInicio
  const isoStr = iso(s)
  return isoStr ? new Date(isoStr) : null
}
```

**4. Alterar o INSERT/UPSERT (linhas 169-187): adicionar `sla_status`, `adiantamento_horas`,
`morosidade_horas`, `conducao_regime` e trocar `eta`.**
- Lista de colunas: acrescentar `sla_status, adiantamento_horas, morosidade_horas, conducao_regime`.
- VALUES: `eta` passa a ser `${etaComputada}` (NÃO `iso(ent.previsao)`); `window_end` passa a ser `${iso(prazoFinal)}` (NÃO `we = previsao`); adicionar `${slaStatus}`, `${atrasoHoras != null ? String(atrasoHoras) : null}`, `${moros ? String(moros) : null}`, `${'intensivo'}`.
- `ON CONFLICT DO UPDATE`: acrescentar
  `sla_status=EXCLUDED.sla_status, adiantamento_horas=EXCLUDED.adiantamento_horas, eta=EXCLUDED.eta`
  e **preservar** `conducao_regime` (toggle do operador) — usar `conducao_regime=COALESCE(trips.conducao_regime, EXCLUDED.conducao_regime)`; idem `morosidade_horas=COALESCE(EXCLUDED.morosidade_horas, trips.morosidade_horas)` se a morosidade for digitada pelo operador.

Trecho final do UPSERT (acréscimos):
```sql
INSERT INTO trips (..., eta, ..., sla_status, adiantamento_horas, morosidade_horas, conducao_regime, ...)
VALUES (..., ${etaComputada}, ..., ${slaStatus}, ${atrasoHoras!=null?String(atrasoHoras):null},
        ${moros?String(moros):null}, 'intensivo', ...)
ON CONFLICT (id) DO UPDATE SET
  ...,
  window_end = EXCLUDED.window_end,
  eta        = EXCLUDED.eta,
  sla_status = EXCLUDED.sla_status,
  adiantamento_horas = EXCLUDED.adiantamento_horas,
  morosidade_horas   = COALESCE(EXCLUDED.morosidade_horas, trips.morosidade_horas),
  conducao_regime    = COALESCE(trips.conducao_regime, EXCLUDED.conducao_regime),
  ...
```

> Resultado esperado: HERCULANO `kmFalta` real → `eta` = `agora + tRest` (≈11:15), `window_end` = prazo
> contratual (≈07:00), `adiantamento_horas` = −4.25 → `sla_status='atrasado'`. Bate com o painel (+04:15).

---

### (b) Separar `window_end` (Prazo Final / deadline real) de `eta` (Previsão computada)

**Problema central:** a API live `detalhes-veiculo` **só expõe `ent.previsao`** (um único campo tipo-ETA) +
`t.dataInicio` / `ent.datachegada`. **Não há campo de deadline contratual** equivalente ao col25/col38 da
planilha gid0. Hoje `window_end = eta = iso(ent.previsao)` → idênticos e errados.

**Estratégia (em ordem de preferência — escolher a 1ª viável):**

1. **Campo na resposta da API.** Inspecionar o JSON real de `detalhes-veiculo` (logar `JSON.stringify(t)` e
   `JSON.stringify(ent)` uma vez) procurando chaves de prazo: `prazoEntrega`, `previsaoChegadaDestino`,
   `dataPrazo`, `slaEntrega`, `dataChegadaPrevista`. Se existir, mapear em `prazoFinalDate()` (§2a item 3).
   **`ent.previsao` então fica como `eta` base/fallback; o deadline vira `window_end`.**
2. **Cruzar com a planilha gid0 (cadastro).** O col25 `Previsão Chegada Destino` é estático por viagem.
   Se a viagem tem código (`viacodigo`) presente na base importada (Phase 12), buscar o prazo do registro
   importado (tabela `trips` já populada no import, ou `trip_events`/origem). Para live novas sem cadastro,
   cair em (3).
3. **Fallback determinístico (MVP imediato).** `window_end = iso(t.dataInicio) + horasViagemTotal`, onde
   `horasViagemTotal = calcularHorasViagemComRegulamentacao(distTotal, PARAMS_PADRAO)`. Isto é o prazo SLA
   "ideal" (partida + tempo de rota com lei) — estável e independente do GPS atual. `eta` continua sendo
   `agora + calcularHorasViagemComRegulamentacao(kmFalta)`. Assim `eta − window_end` reflete atraso real
   acumulado (perda de tempo vs. plano), que é exatamente a semântica do painel.

**Arquivo:** `api/src/adapters/angellira/monitoring.adapter.ts` — implementar `prazoFinalDate()` conforme a
opção escolhida; remover a linha `const we = iso(ent.previsao) ?? ...` e substituir por `const we = iso(prazoFinal) ?? iso(t.dataInicio) ?? ...`.

**Decisão recomendada:** começar com **(3)** (zero dependência externa, já corrige `window_end != eta`),
e abrir item de backlog para (1)/(2) assim que o JSON real for inspecionado.

---

### (c) Atraso (Horas) e formatação `±HH:MM`

**Backend** — já coberto em §2a: persistir `adiantamento_horas` (decimal, **+ = atrasado**, pós-inversão).

**DTO** — `api/src/modules/trips/trips.service.ts`, função `toTripDto` (linha ~101). Adicionar:
```ts
adiantamentoHoras: row.adiantamentoHoras != null ? Number(row.adiantamentoHoras) : null,
atrasoLabel:       formatarAtraso(row.adiantamentoHoras != null ? Number(row.adiantamentoHoras) : null),
```
Importar um helper de formatação. Reaproveitar `formatarAdiantamento` de `regulamentacao.ts`, mas como o
valor persistido já é "+ = atrasado", criar wrapper para não inverter o rótulo:
```ts
// api/src/lib/regulamentacao.ts — adicionar:
/** Formata atraso "+HH:MM" / "-HH:MM" (positivo = atrasado). Mesma matemática de formatarAdiantamento. */
export function formatarAtraso(horas: number | null): string { return formatarAdiantamento(horas) }
```
(É idêntico numericamente; o sinal já está correto no valor. Mantemos dois nomes só pela semântica.)

**Frontend** — exibir `atrasoLabel` direto (string pronta). Coluna nova nas tabelas (§2e). Cor: `+` → vermelho
(`text-danger`), `-` → verde (`text-success`), `±00:00` → muted.

---

### (d) Condução (Intensivo) e Meta KM/Dia — novas colunas + DTO + adapter + UI

**Condução (regime):**
- **Schema** (`api/src/db/schema/trips.ts`, após `morosidadeHoras` linha ~48):
  ```ts
  conducaoRegime: varchar('conducao_regime', { length: 12 }).default('intensivo'), // intensivo|regular
  adiantamentoHoras: decimal('adiantamento_horas'), // + = atrasado (porte do painel)
  ```
- **Adapter:** insere `'intensivo'` no upsert e **preserva** no `ON CONFLICT` (§2a item 4).
- **Recálculo respeita o regime:** quando `conducao_regime='regular'` (ignorarLei), usar params alternativos
  no `calcularHorasViagemComRegulamentacao` — pausa/descanso zerados:
  ```ts
  const params = regime === 'regular'
    ? { ...PARAMS_PADRAO, pausaMinimaContinua: 0, descansoInterJornada: 0 }
    : PARAMS_PADRAO
  ```
  (No upsert o regime padrão é 'intensivo'; o toggle do operador via endpoint PATCH muda a coluna e o próximo
  sync recalcula `eta`/`adiantamento_horas` com os params certos.)
- **Endpoint de toggle (opcional, p/ paridade total):** `PATCH /api/trips/:id/conducao { regime }` em
  `api/src/modules/trips/trips.plugin.ts` → `UPDATE trips SET conducao_regime=$1 WHERE id=$2`. MVP pode
  deixar fixo 'intensivo' e só exibir o badge.
- **DTO:** `conducaoRegime: row.conducaoRegime ?? 'intensivo'`.

**Meta KM/Dia (derivado puro, SEM coluna):** computar em `toTripDto`:
```ts
function metaKmDia(kmFalta: number, eta: Date|null, slaStatus: string|null, params=PARAMS_PADRAO): string {
  if (slaStatus == null) return '—'
  if (!eta || !(kmFalta > 0) || params.velocidadeMedia <= 0 || params.jornadaDiariaConducao <= 0) return 'N/A'
  const d0 = new Date(); d0.setHours(0,0,0,0)
  const d1 = new Date(eta); d1.setHours(0,0,0,0)
  let dias = (d1.getTime() - d0.getTime()) / 86400000
  const cap = params.velocidadeMedia * params.jornadaDiariaConducao // 65*8=520
  let meta: number, suf: string
  if (dias <= 0.001) { meta = kmFalta; suf = 'KM/hoje' }
  else { dias = Math.ceil(dias); meta = kmFalta / dias; suf = 'KM/dia' }
  if (suf === 'KM/dia' && meta > cap) return `${Math.round(cap)} KM/dia (Máx.)`
  return `${Math.round(meta)} ${suf}`
}
```
No DTO: `metaKmDia: metaKmDia(Math.max(0, distanceTotal - distanceDone), row.eta ? new Date(row.eta) : null, row.slaStatus, paramsDoRegime(row.conducaoRegime))`.
(`kmFalta` no DTO usa `total−done` porque `distfaltante` não é persistido; ver §1 item 2 — se persistirmos
`km_falta`, usar ela.)

---

### (e) Frontend — exibir os novos campos

**Tipos** — `torre-de-controle/src/data/types.ts`, interface `Trip` (linha ~86). Adicionar:
```ts
adiantamentoHoras?: number | null   // + = atrasado
atrasoLabel?: string                // "+04:15"
conducaoRegime?: 'intensivo' | 'regular'
metaKmDia?: string                  // "45 KM/hoje" | "720 KM/dia"
ticketsResumo?: { total: number; tipoUltimo?: string; severidade?: string } | null
```

**`ViagensTable.tsx`** (linha ~21, array `columns`) — adicionar colunas entre `eta` e `status`/`progress`:
- **Km Total:** `formatKm(row.original.distanceTotal)`.
- **Km que Falta:** `formatKm(Math.max(0, row.original.distanceTotal - row.original.distanceDone))`.
- **Prazo Final:** `formatTime(row.original.windowEnd)` (agora distinto de ETA).
- **Previsão:** `formatTime(row.original.eta)` (renomear header de "ETA" → "Previsão"; manter coluna `eta`).
- **Atraso:** `<span className={atraso>0?'text-danger':atraso<0?'text-success':'text-muted-foreground'}>{row.original.atrasoLabel ?? '—'}</span>`.
- **Tickets:** badge a partir de `ticketsResumo` (label do tipo + "+N"); "—" se null.
- **Condução:** badge `Intensivo`/`Regular` a partir de `conducaoRegime`.
- **Meta KM/Dia:** `row.original.metaKmDia ?? '—'`.
- `status` continua `<StatusBadge status={row.original.slaStatus} />` — agora **não-NULL** → mostra NO PRAZO/ATRASADO.

**`TripsInProgressTable.tsx`** (linha ~11) — adicionar pelo menos **Prazo Final**, **Atraso** e manter
**Previsão** (renomear header "ETA"→"Previsão"). A ordenação por `eta asc` continua válida (agora ETA é o
valor computado correto). Status badge passa a renderizar de verdade.

**`TripDetailPanel.tsx`** (grid de métricas, linhas ~109-120):
- Substituir **"Janela"** por dois campos: **"Prazo Final"** = `formatTime(trip.windowEnd)` e
  **"Previsão"** = `formatTime(trip.eta)`.
- Trocar **"Desvio ETA"** (`minutesBetween(windowEnd, eta)`, hoje ~0) por **"Atraso"** = `trip.atrasoLabel`
  com cor por sinal.
- Adicionar **"Km que Falta"** (já existe "Restante" = mesma coisa — manter um só, renomear p/ "Km que Falta"),
  **"Meta KM/Dia"** = `trip.metaKmDia`, **"Condução"** = badge `trip.conducaoRegime`.

**`StatusBadge.tsx`** — nenhuma mudança necessária (já mapeia `no_prazo/atrasado`; agora recebe valor não-NULL).
Opcional: adicionar `concluido` ao `config`/`styleMap` se quisermos badge verde para concluídas.

---

## 3. Migrations Drizzle necessárias

Estado atual: journal vai até **0002** (`api/drizzle/migrations/meta/_journal.json`). As colunas Phase 12 do
schema (`ordem_viagem`, `morosidade_horas`, etc.) foram aplicadas **direto em prod via MCP** (sem arquivo
0003 no worktree). A próxima migration gerada será **`0003`**.

**Novas colunas em `trips`** (gerar com `bun drizzle-kit generate` após editar `trips.ts`):
```sql
-- 0003_<auto>.sql  (ou aplicar via MCP apply_migration no torre-controle-prod)
ALTER TABLE "trips" ADD COLUMN "conducao_regime"    varchar(12) DEFAULT 'intensivo';
ALTER TABLE "trips" ADD COLUMN "adiantamento_horas" numeric;
-- (opcional, se decidirmos persistir o km restante cru da Angellira em vez de total-done)
-- ALTER TABLE "trips" ADD COLUMN "km_falta" numeric(8,2);
```
`morosidade_horas` **já existe** (`trips.ts:48`) — só passa a ser **populada** pelo adapter; não precisa migration.
`sla_status` **já existe** (`trips.ts:26`) — só passa a ser **escrita** pelo adapter; não precisa migration.
`eta` / `window_end` **já existem** — mudança é só de **valor** (lógica no adapter), não de schema.

**Passos:**
1. Editar `api/src/db/schema/trips.ts` (add `conducaoRegime`, `adiantamentoHoras`).
2. `cd api && bun drizzle-kit generate` → cria `0003_*.sql` + snapshot.
3. Aplicar: `bun drizzle-kit migrate` (dev) **ou** MCP `apply_migration` no projeto `torre-controle-prod`
   (mesmo fluxo da migration 0003 já usada em prod — task #11).
4. Backfill imediato das live existentes (one-shot): rodar `syncMonitoring()` manualmente ou
   `UPDATE trips SET conducao_regime='intensivo' WHERE conducao_regime IS NULL`.

---

## 4. Riscos e validação

**Riscos:**
- **R1 — Prazo Final sem fonte confiável (§2b).** Se cairmos no fallback (3), o `window_end` é um prazo
  *derivado* (partida + tempo de rota), não o SLA contratual real. Atraso pode divergir do painel para
  viagens cujo prazo contratual ≠ tempo-de-rota-ideal. Mitigar inspecionando o JSON real da API (item 1)
  ou cruzando com o cadastro gid0 (item 2).
- **R2 — `kmFalta` total−done vs distfaltante.** Desvio de rota faz `done > total` → `kmFalta` clampado a 0
  → vira "Chegou" falso. Preferir `t.distfaltante` cru (§1 item 2); persistir `km_falta` se necessário.
- **R3 — Recálculo a cada 5min, não 5s.** O painel recalcula no cliente a cada 5s; o Torre recalcula no cron
  a cada 5min. ETA/atraso ficam até 5min defasados. Aceitável; se precisar, recomputar `eta`/`atrasoLabel`
  on-the-fly no `toTripDto` (com `agora=new Date()`) em vez de ler do banco — então a leitura é sempre fresca.
  **Recomendado:** persistir no upsert (para KPIs/filtros SQL) E recomputar no DTO (para o display fresco).
- **R4 — Loop `while` sem guarda no port frontend.** O `regulamentacao.ts` do Torre TEM `safety++ < 10000`
  (linha 44) — OK. Não remover.
- **R5 — Sinal do atraso.** Erro clássico: esquecer a inversão `-calcularAdiantamentoHoras`. Validar com
  HERCULANO (deve dar **+04:15**, não −04:15).
- **R6 — Enum `sla_status`.** A coluna aceita `no_prazo|em_risco|atrasado|sem_sinal`. NÃO escrever
  `quebrado/multa` (enum do `sla.engine`). O filtro do `ViagensTable` (`t.slaStatus`) e o `StatusBadge`
  só conhecem os 4 valores — qualquer outro vira "—".

**Como validar cada item contra a planilha (re-rodar a comparação dos 12 códigos):**
1. **Snapshot gid0** no mesmo minuto do sync (anotar `Cód Viagem`, col25, col38, col39 Dist.Percorrida,
   col40 Dist.Viagem, col42, col43, Status, Atraso Viagem col6).
2. **Trigger o sync:** `POST` interno ou `bun -e "import('./src/adapters/angellira/monitoring.adapter').then(m=>m.syncMonitoring())"`.
3. **Query de conferência** (Torre):
   ```sql
   SELECT code, distance_total, distance_done, progress_pct,
          window_end AS prazo_final, eta AS previsao, sla_status,
          adiantamento_horas, conducao_regime
   FROM trips
   WHERE code IN ('38376047', ...)   -- os 12 códigos
   ORDER BY code;
   ```
4. **Checks por campo:**
   - `distance_total` == col40 (já OK — manter).
   - `window_end` != `eta` (deixaram de ser idênticos) — **principal correção**.
   - `eta` ≈ `agora + calcularHorasViagemComRegulamentacao(kmFalta)`; HERCULANO ≈ `06/06 11:15`.
   - `window_end` ≈ prazo contratual; HERCULANO ≈ `06/06 07:00` (se fonte (1)/(2)) — documentar se for fallback (3).
   - `adiantamento_horas` ≈ +4.25 (HERCULANO) → `formatarAtraso` = `"+04:15"` (bate com painel).
   - `sla_status` ∈ {no_prazo, atrasado} e nunca NULL p/ ativas com prazo — HERCULANO = `atrasado`.
5. **KPIs:** chamar `GET /api/dashboard/kpis` (ou `getDashboardKpis`) e conferir Total / No Prazo /
   Atrasadas / Concluídas / % No Prazo contra os cards do painel GAS. Tolerância ±1-2 por timing; após §2b
   devem convergir. Confirmar que `% No Prazo = noPrazo/(noPrazo+atrasadas)` (ignora concluídas).
6. **Tickets pendentes:** o painel soma TICKETS (não viagens). Conferir que `getDashboardKpis.ticketsPendentes`
   conta `alerts` abertos (não distinct trip) — já é o caso no `dashboard.service.ts`.
7. **Regressão:** abrir `ViagensTable` e `TripDetailPanel` — Status deixa de mostrar "—" nas live; Prazo Final
   e Previsão aparecem distintos; Atraso colorido; Meta KM/Dia e Condução preenchidos.
