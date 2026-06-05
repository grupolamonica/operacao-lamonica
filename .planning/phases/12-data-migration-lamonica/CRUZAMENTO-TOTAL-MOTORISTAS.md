# Relatório — Cruzamento total de dados de motoristas (todos os sistemas)

> Gerado em 2026-06-05. Escopo: viabilidade + inventário + o que existe sobre um motorista em cada sistema + plano de consolidação na Torre.

## TL;DR

**É possível cruzar tudo? SIM.** Todas as fontes conectam por 3 chaves estáveis:
`CPF` · `Shopee driver_id` · `placa`. O elo que faltava (mapa `driver_id ↔ CPF`) está na planilha **`nome dos motoristas.xlsx` › aba `MOTORISTAS`** (1.619 linhas).

Estado atual da Torre: histórico de viagens **já migrado (9.566 trips)** e 1.657 motoristas. Faltam 3 enriquecimentos: **identidade plena (CPF)**, **financeiro (valor/frete)** e **qualidade do GPS**.

---

## 1. Inventário das fontes

### 1.1 Bancos Supabase (4 projetos)

| Projeto | ID | Conteúdo-chave | Volumes |
|---|---|---|---|
| **Torre** (destino) | `ocgifdytaqlubuokjkwv` | drivers, trips, alerts, driver_positions, treatments | 1.657 motoristas · **9.566 viagens** · 195 alertas · 10.746 posições GPS |
| **Cargas PROD** | `lbpzkdecwraipbjbaajs` | motoristas_historico, aspx_drivers, vehicles, cargas, cadastros, driver_profiles | MH 1.851 · ASPX 2.030 · veículos 3.370 · cargas 1.017 · cadastros 39 · profiles 0 |
| **Cargas TESTE** | `oklksqvrexiypectfsod` | espelho do PROD (sync ASPX mais recente) | — |
| **Ranking** | `qbwazymqhfunlhnikbla` | drivers (roster), evaluations, driver_blocks, route_scores | roster 1.616 · **avaliações 1** · blocks 5 |

### 1.2 Planilhas (4 arquivos)

| Arquivo | Papel | Chaves | Observação |
|---|---|---|---|
| **HISTÓRICO DBLH.xlsx** | (a) Histórico Shopee — tabela-fato | `trip_number`(LH), `driver_id`, placa, station codes | 9.566 linhas → **já importado na Torre** |
| **DBLH_LAMONICA.xlsx** | (a) Workbook operacional vivo (16 abas) | idem + Telemetria/Posicionamento | ~1.388 viagens correntes; várias abas quebradas (#REF!/#ERROR!) |
| **nome dos motoristas.xlsx** | (b) **Elo de identidade** | `Driver ID ↔ CPF ↔ Nome ↔ Placa ↔ CNH ↔ RENAVAM ↔ tarifa ↔ endereço` | Usar aba **`MOTORISTAS`** (1.619 linhas, limpa). As abas `DADOS CORRETOS` e `nome dos motoristas` têm header corrompido — descartar |
| **Tabela 2026 OFICIAL EXPEDIÇÃO.xlsx** | (c) **Tabela de fretes/ANTT** | rota por `codfre`/`CIDADE ORIGEM×DESTINO` + nº de eixos | Multi-cliente (Shopee, Casas Bahia, Nestlé). Valores: frete carreteiro ANTT, pedágio, composição bruto 2026, margem. **Chaveado por nome de cidade, não por station code** |

### 1.3 Sistema de Cargas (código em produção — `Cargas_Lamonica/`)

- **Backend** (clean architecture, `backend/src/`): candidatura, load-claims, operator-admin.
- **Bots/sidecars FastAPI:** `bots/angelira` (registro motorista/proprietário/veículo), `bots/spx` (registro SPX), `bots/unificada` (PDF documento de risco).
- **Scripts:** `scripts/angellira/consulta_cpf.py` + `consulta_placa.py` (validação Angellira), `scripts/aspx-sync/asp.py` (sincroniza diretório Shopee Express → `aspx_drivers`).
- **Meus scripts de extração** (`.planning/.../angellira-extracts/`): fetch_positions/cadastros, extract_dblh, cross_reference_drivers, build_import_sql, import_to_torre, enrich_drivers_mh, import_ocorrencias.

---

## 2. Grafo de junção (como tudo conecta)

```
                       nome dos motoristas.xlsx [MOTORISTAS]  ← ELO DE IDENTIDADE
                          Driver_ID ↔ CPF ↔ Nome ↔ Placa
                                  |              |
                Shopee driver_id  |              |  CPF
        ┌─────────────────────────┘              └──────────────────────────┐
        ▼                                                                    ▼
 [DBLH histórico/live]                                              [Mundo Cargas/Angellira]
 trip_number, driver_id  ──→ Torre.trips.shopee_driver_id           motoristas_historico (CPF)
        |                                                            aspx_drivers (CPF)
        ▼                                                            vehicles (linked_driver_cpf, placa)
 Torre.drivers.shopee_driver_id ────────── Torre.drivers.cpf ───────┘
        |                                                            driver_profiles (document_number)
        ▼ (driver_id com pontos: "2.584.382")
 Ranking.drivers / evaluations
        |
 Tabela EXPEDIÇÃO  ──(rota: cidade origem×destino + eixos)──→ Torre.trips  [requer crosswalk cidade↔station code]
```

**Pontos de atenção do grafo:**
- Ranking grava `driver_id` **com separador de milhar** (`2.584.382`) → normalizar (remover pontos) ao cruzar com Shopee id.
- Tabela EXPEDIÇÃO usa **nome de cidade** ("NOSSA SENHORA DO SOCORRO X CAMAÇARI"); as viagens usam **station codes** (SOC-BA2, HUB-LBA-19). Falta o de/para (a aba `DE>PARA NOMENCLATURA` existia mas está quebrada). **Bloqueia o enriquecimento financeiro automático.**
- `cargas.carga_id` é `UUID`; `pending_driver_registrations.carga_id` é `TEXT` — cuidado de cast no join.

---

## 3. O que existe sobre UM motorista em cada sistema

### Exemplo trabalhado: **DELCIO DE OLIVEIRA CARVALHO** (motorista mais ativo)
CPF `21902160363` · Shopee `2584382` · Angellira `589783`

| Sistema | Chave | O que tem | Status |
|---|---|---|---|
| **Torre · drivers** | id `280986f6…` | Identidade completa, CNH cat E val 2027-05-30, AGR, Salvador/BA, score 100, Angellira Conforme até 2026-08-25; flags (ANTT ✓, seguro ✗, rastreio ✗) | ✅ |
| **Torre · trips** | shopee `2584382` | **239 viagens** (182 completas, 57 canc.), 85,1% no prazo, set/25→mar/26, rotas SOC-BA2/PE2 ↔ HUB-LBA | ✅ (sem `valor`) |
| **Torre · GPS** | nome/placa | 0 posições (rastreio desligado) | ⚠️ vazio |
| **Cargas · motoristas_historico** | CPF | Dossiê **Angellira bruto**: filiação (pai ANTONIO SANTOS CARVALHO / mãe NINFA DE OLIVEIRA), endereço (R. Eustasio Nazaré, Periperi), RG, CNH segurança, consulta 2282570 por `AUGUSTO.GRIFFI` | ✅ rico |
| **Cargas · aspx_drivers** | CPF | Ativo (status 1), **sincronizado hoje** — integração SPX viva | ✅ |
| **Cargas · vehicles** | CPF | **3 placas**: cavalo VOLVO FH (IPU0A11) + 2 carretas RANDON (PLX4D84, PLY6C75), todas Angellira FOUND | ✅ |
| **Cargas · cadastro / driver_profiles** | — | Inexistente (motorista legado, não passou pelo cadastro novo) | — vazio |
| **Ranking · drivers** | `2.584.382` | Só no roster (desde 2026-04-02), **0 avaliações** | ⚠️ roster |

**Conclusão do exemplo:** identidade 100% cruzável; lacunas são de *integração* (GPS, valores, avaliações), nunca de identidade.

---

## 4. Estado da consolidação na Torre & lacunas

| Dado | Fonte | Estado na Torre | Ação |
|---|---|---|---|
| **Viagens (histórico)** | HISTÓRICO DBLH (9.566) | ✅ **migrado (9.566)** | nenhuma |
| **Identidade base** | Shopee | ✅ 1.657 drivers (100% c/ shopee_id) | — |
| **CPF / docs / CNH** | nome dos motoristas + motoristas_historico | ⚠️ **só 1.060/1.657 (64%)** têm CPF | **enriquecer ~597 via aba MOTORISTAS** |
| **Conformidade Angellira/SPX** | Cargas | ✅ parcial (importado p/ quem tem MH) | revalidar cobertura |
| **Veículos/placas** | Cargas.vehicles (3.370) | ⚠️ trips sem cavalo/carreta preenchidos | vincular placa→motorista |
| **Financeiro (valor/frete/bônus)** | Tabela EXPEDIÇÃO | ❌ **0 trips com valor** | **construir de/para cidade↔station, depois aplicar tarifa** |
| **GPS** | Angellira | ⚠️ 10.746 posições, casamento fraco | melhorar match placa→veículo→viagem |
| **Ranking/avaliações** | Ranking DB | ⚠️ roster 1.616 / **1 avaliação** | sistema praticamente sem uso — decidir se mantém |

---

## 5. Plano de consolidação (ondas)

1. **Onda A — Identidade plena.** Carregar `nome dos motoristas › MOTORISTAS` (1.619) como tabela-ponte; preencher CPF/CNH/RENAVAM/endereço nos ~597 drivers da Torre que só têm shopee_id. Cruzar com `motoristas_historico` (Angellira) por CPF.
2. **Onda B — Veículos.** Importar `vehicles` (3.370) da Cargas por CPF; popular cavalo/carreta nas viagens via placa.
3. **Onda C — Financeiro.** Reconstruir o de/para `cidade ↔ station code`; aplicar Tabela EXPEDIÇÃO (frete por rota + eixos) → preencher `trips.valor`/`bonus`.
4. **Onda D — GPS.** Reforçar o casamento de `driver_positions` (placa→veículo→viagem em andamento) e ligar ao histórico.
5. **Onda E — Ranking (opcional).** Como o banco de avaliações está praticamente vazio (1 registro), avaliar migrar o roster ou descontinuar.

**Endpoint sugerido:** `GET /api/drivers/:id/dossie` agregando as 4 bases (identidade + viagens + conformidade + veículos + ranking) para exibir o dossiê dentro da Torre.

---

## 6. Achados paralelos

- **Cadastro 500 (cargas.grupolamonica.com) — RESOLVIDO.** Causa raiz: `submit-final.js:217` chama `nextval('public.cadastro_protocolo_seq')`, mas a sequence nunca foi criada por migration (a hotfix `20260524000000` criou as colunas v2 mas esqueceu a sequence). **Verificação 2026-06-05: a sequence agora existe na prod** → o erro está sanado. Se reincidir, aplicar `CREATE SEQUENCE IF NOT EXISTS public.cadastro_protocolo_seq;`.
- **Qualidade de dados das planilhas:** abas `DADOS CORRETOS` / `nome dos motoristas` (arquivo 3) têm header deslocado/ausente — usar só `MOTORISTAS`. Abas `DE>PARA NOMENCLATURA` e `PROGRAMAÇÃO SHOPEE` (arquivo 1) estão quebradas (#REF!).
- **PII:** os dossiês expõem filiação, endereço e documentos completos. Dado real de produção — tratar conforme LGPD.
