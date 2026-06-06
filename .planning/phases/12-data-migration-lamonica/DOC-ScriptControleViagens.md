# Documentação — ScriptControleViagens (Painel GAS de Monitoramento)

> Google Apps Script (Code.gs) ligado a uma planilha Google + página HTML (`Painel`).
> É o "painel atual" da torre: lê os dados de rastreamento, calcula SLA pela **lei do
> motorista**, gera **tickets** de operação e mostra tudo numa tabela web.
> Arquivo-fonte: `ScriptControleViagens.txt` (1837 linhas).

---

## 1. Visão geral / arquitetura

```
Sistema de rastreamento (Angellira) ──IMPORTRANGE/export──▶ Planilha Google (abas)
                                                                   │
   Gatilhos de tempo (triggers)  ─── escrevem ───▶ abas de histórico/tickets
                                                                   │
   doGet()  ─▶ Painel.html ──google.script.run──▶ getPainelData() ─▶ JSON ─▶ tela
```

- **Backend** = funções `.gs` (este script). **Frontend** = `Painel.html`.
- O painel chama `getPainelData()` (via `google.script.run`), que **agrega** todas as
  abas num único JSON e devolve pra tela.
- Funções `processar*` / `verificar*` / `sincronizar*` rodam por **gatilho de tempo**
  (cron do Apps Script), mantendo as abas de histórico e os tickets atualizados.

### Abas da planilha (constantes globais)

| Constante | Aba | Papel |
|---|---|---|
| `NOME_DA_ABA_DADOS` | **Carrega** | Dados ao vivo (1 linha por veículo/viagem): placa, motorista, km, prazo, status, posição, ignição, lat/lng |
| `NOME_DA_ABA_CONFIGURACOES` | **Configurações** | Parâmetros da lei do motorista (2 perfis) + lista de operadores |
| `NOME_DA_ABA_LOG` | **LogObservacoes** | A=Cód.Viagem, B=Observação, C=numViagem(LH), D=Morosidade(h) |
| `NOME_DA_ABA_HISTORICO` | **HistoricoDiario** | KM rodado por viagem por dia |
| `NOME_DA_ABA_CONCLUIDAS` | **HistoricoConcluidas** | Viagens finalizadas (snapshot + classificação No Prazo/Com Atraso) |
| `NOME_DA_ABA_TICKETS` | **HistoricoTickets** | Tickets de operação (timeline horária) — 14 colunas |
| `NOME_DA_ABA_TICKETS_ARQUIVO` | **Arquivo_HistoricoTickets** | Tickets antigos arquivados |
| (fixa) | **Shopee** | LH → tipoCarga / vínculo / telefone |
| (fixa) | **HistoricodeParadas** | Paradas detectadas (início/fim/duração/posição) |

---

## 2. Helpers globais

| Função | O que faz |
|---|---|
| `normalizarString(s)` | trim + UPPER + remove acentos (NFD). Base de toda comparação. |
| `findColumnIndex(headers, [nomes])` | Acha o índice de uma coluna por **vários nomes possíveis** (tolerante a renomeação). |
| `formatValue(v)` | `Date` → `dd/MM/yyyy HH:mm:ss`. |
| `parseDateValue(v)` | `Date` ou string `dd/MM/yyyy HH:mm:ss` → objeto `Date` (ou null). |
| `parseKmValue(v)` | `"1.802,41 Km"` → `1802.41` (vírgula→ponto, tira "Km"). |
| `extrairNumViagemDaString(txt)` | Regex `/(LT[A-Z0-9]{11})/i` → extrai o **código LH** de dentro da Observação. |
| `_limparParaJSON_(obj)` | Saneia antes do `JSON.stringify`: Date→string, NaN/Infinity→null, objetos GAS→string. Evita erro de serialização. |

---

## 3. Leitura de dados (as funções `get*`)

### `getDadosColunas()` — viagens ativas (aba Carrega)
Lê a aba Carrega e, via `findColumnIndex`, mapeia (tolerante a nomes):
`VEICULO, ORIGEM, DESTINO, Cód.Viagem, MOTORISTA, Dist.Viagem(km total),
Previsão Chegada Destino(prazo), Saída Origem(partida), Dist.Destino(km que falta),
Status Viagem, Data Posição, Chegada Descarga, Procedimento de Embarque(cliente),
Tempo Parado, Ignição, Posição(texto), Latitude, Longitude`.
- Calcula **`atualizacaoAtrasada`** = `Data Posição` tem mais de **1 hora** → base do alerta **SEM_GPS**.
- Devolve 1 objeto por viagem ativa.

### `getDadosHistoricoConcluidas()` — viagens finalizadas (aba HistoricoConcluidas)
Lê o snapshot das concluídas; monta `chegadaDescarga` juntando Data+Hora Conclusão;
marca `statusViagem="CONCLUÍDO"`.

### `getLogData()` — anotações do operador (aba LogObservacoes)
`{ codViagem: { observacao, numViagem(LH), morosidade(horas) } }`.

### `getDadosHistorico()` — KM diário (aba HistoricoDiario)
`{ codViagem: [ { dia, kmInicial, kmFinal, kmRodado } ] }`, ordenado por dia desc.

### `getHistoricoParadas()` — paradas (aba HistoricodeParadas)
`{ codViagem: [ { status, inicio, fim, duracao, distancia, posicao, lat, lng } ] }`
(mais recente primeiro).

### `getShopeeData()` — enriquecimento (aba Shopee)
A partir da linha 4: `{ LH: { tipoCarga, vinculo, telefone } }`.

### `getParametrosRegulamentacao()` — parâmetros da lei (aba Configurações)
6 parâmetros, **2 perfis** (coluna B = `padrao`, coluna C = `ignorarLei`):

| Parâmetro | Default | Significado |
|---|---|---|
| `velocidadeMedia` | 65 | km/h média p/ estimar tempo |
| `limiteConducaoContinua` | 5.5 | h máx. dirigindo sem pausa |
| `pausaMinimaContinua` | 0.5 | h de pausa obrigatória após o limite |
| `jornadaDiariaConducao` | 8 | h máx. de condução por jornada |
| `descansoInterJornada` | 11 | h de descanso entre jornadas |
| `kmParaConsiderarChegou` | 2 | km abaixo do qual considera-se "chegou" |

### `getOperadores()` — fila de operadores (aba Configurações)
Lê a coluna A após o cabeçalho `OPERADORES`/`LISTA DE OPERADORES` → **lista estática** de nomes
(NÃO é presença online — é uma lista fixa cadastrada na planilha).

---

## 4. Função principal: `getPainelData()`

É o que a tela chama. Passo a passo:
1. Coleta tudo: `getDadosColunas` (ativas) + `getDadosHistoricoConcluidas` + `getLogData`
   + `getParametrosRegulamentacao` + `getDadosHistorico` + `getShopeeData`
   + `getHistoricoParadas` + `getTicketsAbertos` + `getOperadores`.
2. **Unifica** ativas + concluídas e, pra cada viagem, anexa:
   - `justificativaObs`, `numViagem`, `morosidade` (do Log);
   - `tipoCarga`, `telefone`, `vinculo` (da Shopee, casando por `numViagem`/LH);
   - `historicoDiario` (KM/dia) e `historicoParadas`;
   - `ticketsAbertos` **só se a viagem NÃO estiver concluída**.
3. Saneia com `_limparParaJSON_` e devolve `{ dados, parametros, operadores }` como JSON.
4. Tem rastreamento de etapas (`etapas[]`) p/ debug — se falha, diz em qual etapa.

---

## 5. Lei do Motorista (motor de SLA)

O coração do cálculo de atraso/adiantamento.

### `calcularHorasViagemComRegulamentacao_(km, params)`
Estima **quantas horas reais** a viagem leva, respeitando a legislação:
- Tempo de condução puro = `km / velocidadeMedia`.
- Simula bloco a bloco: dirige até bater `limiteConducaoContinua` (5,5h) → soma `pausaMinimaContinua` (0,5h);
  ao completar uma `jornadaDiariaConducao` (8h) → soma `descansoInterJornada` (11h).
- Retorna o **tempo total decorrido** (condução + pausas + descansos).
- Se os parâmetros estiverem zerados, vira tempo de condução puro.

### `calcularAdiantamentoHoras_(viagem, params, morosidade, agora)`
- Ajusta o prazo pela **morosidade** (atraso na origem, em horas): `prazoAjustado = prazo + morosidade`.
- Se `kmFalta ≤ kmParaConsiderarChegou` → adiantamento = `prazoAjustado − agora`.
- Senão → estima chegada = `agora + calcularHorasViagemComRegulamentacao_(kmFalta)` e
  adiantamento = `prazoAjustado − chegadaEstimada`.
- **Positivo = adiantado; negativo = atrasado.** (`atraso = −adiantamento`.)

### `formatarAdiantamento_(horas)`
Formata em `+HH:MM` / `-HH:MM` (`+00:00` se < 1 min).

> **Morosidade** = tempo que o caminhão ficou parado na origem antes de sair. O operador
> digita no painel (modal HH:MM) e é salvo em `LogObservacoes` col D; entra no cálculo do prazo.

---

## 6. Sistema de Tickets (timeline de operação)

Aba **HistoricoTickets** — 14 colunas:
`Cód.Viagem | Timestamp Abertura | Tipo | Status | Operador | Observação |
Timestamp Tratamento | Atraso(HH:MM) | KM Restante | Procedimento Embarque |
Motorista | Placa | Origem | Destino`

- **Tipos:** `OK | PARADA | ATRASO | PRAZO_PROXIMO | SEM_GPS | PROXIMO_ENTREGA` (+ legado `1H_INTERVALO`, ignorado).
- **Status:** `ABERTO | EM_TRATAMENTO | FECHADO`.

### Funções
| Função | O que faz |
|---|---|
| `garantirAbaTickets_()` | Cria/migra a aba com os cabeçalhos certos; força colunas H/I como texto (evita o bug do Sheets transformar `+02:30` em Date 1899). |
| `criarTicket(cod, tipo, desc, opts)` | Cria 1 ticket. **Dedup**: não cria se já existe mesmo (cod+tipo) em ABERTO/EM_TRATAMENTO — salvo `permitirDuplicata`. OK nasce **FECHADO**. |
| `atualizarTicket(linha, status, operador, obs)` | Operador assume/fecha: grava status + operador + observação + timestamp tratamento. |
| `getTicketsAbertos()` | `{ cod: [tickets ABERTO/EM_TRATAMENTO] }` (ignora `1H_INTERVALO`, ordena recente→antigo). |
| `getHistoricoTickets(cod)` / `getHistoricoTicketsCompleto(cod)` | Histórico de 1 viagem (aba ativa / ativa+arquivo). |
| `arquivarTicketsAntigos()` | Move FECHADOS antigos pro arquivo: **OK > 7 dias**, **outros > 30 dias**. ABERTO/EM_TRATAMENTO **nunca** arquiva. Usa LockService. (trigger semanal) |
| `fecharTicketsResolvidosAutomaticamente_(cod)` | Quando a viagem fica OK, fecha os tickets **ABERTO** dela (preserva EM_TRATAMENTO — alguém já está cuidando). |
| `_sanearAdiantamento_` / `_sanearKmRestante_` | Corrigem valores corrompidos (Date 1899, `#VALUE!`) nas colunas H/I. |
| `migrar*` / `corrigir*` / `fecharTicketsLegados1H_INTERVALO` | Utilitários de migração de uso único. |

### `verificarECriarTickets()` — **o detector (trigger horário)** ⭐
É a regra de negócio central. Para **cada viagem ativa**:

1. **Pula concluídas** — 3 critérios: `kmFalta ≤ kmParaConsiderarChegou`, OU `Chegada Descarga` preenchida, OU status contém `ENTREGA CONCLUIDA`.
2. Calcula o **atraso** (`= −adiantamento`) via lei do motorista + morosidade.
3. Aplica as regras (pode gerar **vários tickets** por viagem):

| Tipo | Condição |
|---|---|
| **ATRASO** | atraso > 0 (vai chegar depois do prazo) |
| **PARADA** | parado **> 30 min** (duração da parada "Em Andamento" em HistoricodeParadas) |
| **PRAZO_PROXIMO** | prazo em **≤ 2 h** **E** ainda **> 100 km** do destino |
| **SEM_GPS** | `atualizacaoAtrasada` (sem posição há > 1 h) |
| **PROXIMO_ENTREGA** | **adiantada** (atraso < 0) **E** **< 100 km** do destino |
| **OK** | nenhuma acima → cria registro **FECHADO** (operador `SISTEMA`) **e auto-fecha** os tickets de problema abertos da viagem |

4. **Permite duplicata** (`permitirDuplicata:true`) → 1 registro por hora por viagem = **timeline horária**.

> Em cada ticket grava o atraso formatado (`+HH:MM`), km restante, procedimento (cliente),
> motorista, placa, origem, destino — pra dar contexto ao operador.

---

## 7. Processamento automático (escritas por gatilho)

| Função | O que faz | Gatilho sugerido |
|---|---|---|
| `sincronizarObservacoesParaLog()` | Lê a Observação de cada viagem na Carrega, **extrai o LH** (`extrairNumViagemDaString`) e grava `numViagem` no LogObservacoes (só preenche se vazio). | a cada 5 min |
| `processarHistoricoParadas(dados)` | Detecta paradas: ignição **DESLIGADA/MOVIMENTO** = parado. Se já há parada "Em Andamento": moveu > 0,5 km → marca **Finalizada**; senão atualiza duração/fim. Novo parado → cria linha "Em Andamento". (várias paradas/dia) | dentro da rotina |
| `processarHistoricoConcluidas()` | Pra cada viagem da Carrega com **Chegada** preenchida, grava/atualiza em HistoricoConcluidas com status **"CONCLUÍDO — No Prazo"** (chegada ≤ prazo) ou **"— Com Atraso"**. | dentro da rotina |
| `processarHistoricoKmDiario()` | Por (viagem + dia), registra kmInicial/kmFinal/kmRodado (variação do Dist.Destino ao longo do dia) + nome do motorista. | a cada X min |
| `rotinaAutomaticaDeParadas()` | Wrapper: roda paradas + concluídas com os dados frescos da Carrega. | a cada 5–15 min |
| `verificarECriarTickets()` | (seção 6) gera/auto-fecha tickets. | **hora cheia** |
| `arquivarTicketsAntigos()` | (seção 6) arquiva tickets antigos. | semanal |

### Persistência de ações do operador (chamadas pelo painel)
- `salvarDadosLog(cod, observacao, numViagem)` → grava/atualiza no LogObservacoes.
- `salvarMorosidadeBackend(cod, horas)` → grava a morosidade (col D).

### UI
- `onOpen()` → cria menu "Painel → Abrir Painel".
- `doGet(e)` → publica o `Painel.html` como web app.
- `abrirPainel()` → abre como modal dentro da planilha (1450×800).

---

## 8. Resumo do ciclo de vida (fim a fim)

```
1. Rastreador atualiza a aba "Carrega" (posição, km, status).
2. (5min)  sincronizarObservacoesParaLog → grava o LH no Log.
3. (5-15m) rotinaAutomaticaDeParadas → atualiza Paradas + Concluídas.
4. (hora)  verificarECriarTickets → calcula SLA (lei do motorista) e
           abre/fecha tickets (ATRASO/PARADA/PRAZO_PROXIMO/SEM_GPS/PROXIMO_ENTREGA/OK).
5. Operador abre o painel → getPainelData() agrega tudo → tabela + tickets.
6. Operador "assume"/"fecha" ticket (atualizarTicket) e registra obs/morosidade (salvar*).
7. (semanal) arquivarTicketsAntigos → limpa a aba ativa.
```

---

## 9. Equivalência na Torre (já implementado)

| Lógica do GAS | Onde está na Torre |
|---|---|
| Lei do motorista (`calcular*`) | `api/src/lib/regulamentacao.ts` |
| `verificarECriarTickets` (hora cheia) | `api/src/modules/alerts/detectors.service.ts` (cron `0 * * * *`) |
| Tickets (tipos/status) | tabela `alerts` (ATRASO/PARADA/PRAZO_PROXIMO/SEM_GPS/PROXIMO_ENTREGA/manual; aberto/em_tratativa/resolvido) |
| Assumir/fechar ticket | `PATCH /api/alerts/:id/assign`, `POST /api/alerts/:id/transition` |
| `getOperadores` (lista estática) | presença REAL: `users.last_seen_at` + `/api/operators/online` |
| Dados ao vivo da Carrega | **direto do Angellira** (`adapters/angellira/monitoring.adapter.ts`) — sem planilha |
| Paradas (ignição) | detector PARADA via `driver_positions` (sem deslocamento) |
| Morosidade | (ainda não portado — entrada manual de atraso na origem) |
