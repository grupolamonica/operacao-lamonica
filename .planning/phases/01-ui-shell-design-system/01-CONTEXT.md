# Phase 1: UI Shell + Design System — Context

**Gathered:** 2026-04-28
**Status:** Ready for planning
**Source:** PRD Express Path (gsd-init briefing + design images)

<domain>
## Phase Boundary

Esta fase entrega a estrutura completa do frontend React — navegação funcional, todas as telas com dados mock, design visual matching as 5 imagens de referência. Nenhum dado real ou backend é conectado nesta fase. O resultado é uma SPA navegável que serve como base para as fases de backend e real-time.

**O que está dentro:**
- Projeto React 18 + Vite + TypeScript do zero (novo projeto, não conversão do HTML)
- Todas as 8 páginas navegáveis com dados mock
- Design system: dark sidebar, status colors, KPI cards, tabelas, painéis laterais
- Mapbox placeholder (sem token real necessário nesta fase)

**O que está fora:**
- Integração com backend (Phase 2)
- WebSocket / dados em tempo real (Phase 3)
- Alert engine (Phase 4)
- Geofences reais (Phase 5)

</domain>

<decisions>
## Implementation Decisions

### Framework e Tooling
- React 18 com TypeScript (strict mode)
- Vite 5 como build tool (NÃO Next.js — sem SSR necessário no MVP)
- React Router v6 para roteamento SPA
- shadcn/ui para componentes funcionais
- Tailwind CSS (base do shadcn) + Argon Dashboard CSS como inspiração visual
- TanStack Table v8 para tabelas com virtualização
- Chart.js 4 para gráficos (já presente no Argon Dashboard)
- date-fns para formatação de datas
- Zustand para estado global (stores de UI: sidebar collapsed, selected trip/driver/alert)

### Estrutura de Diretórios
```
src/
  app/                    # Rotas e layouts
    layout/               # AppLayout, Sidebar, Topbar
    pages/                # Uma pasta por página
      dashboard/
      torre-de-controle/
      viagens/
      motoristas/
      geofences/
      alertas/
      insights/
      configuracoes/
  components/             # Componentes reutilizáveis
    ui/                   # shadcn/ui base
    domain/               # KPICard, StatusBadge, VehicleIcon, etc.
  data/                   # Mock data e tipos TypeScript
    types.ts              # Todas as interfaces (Trip, Driver, Alert, etc.)
    mocks/                # Arquivos de dados mock
  hooks/                  # Hooks de dados mock (useTrips, useDrivers, etc.)
  lib/                    # Utilities, formatters
  stores/                 # Zustand stores
```

### Design System — Cores e Visual
- Sidebar background: `#1a1a2e` (dark navy)
- Sidebar text: `#8892b0` (idle), `#ffffff` (active)
- Active nav item: background azul `#0f62fe` com texto branco
- KPI cards: fundo branco, sombra sutil, sem border
- Status colors:
  - No prazo: `#2ecc71` (verde)
  - Em risco: `#f39c12` (amarelo/laranja)
  - Atrasado: `#e74c3c` (vermelho)
  - Sem sinal: `#95a5a6` (cinza)
- Background geral: `#f4f6f9`
- Topbar: branco com search bar, date picker, filtros, notificações, avatar

### Branding (Torre de Controle)
- Logo: ícone de antena/torre no topo da sidebar
- Título: "TORRE DE CONTROLE" em caixa alta, "DE ENTREGAS" abaixo em azul
- Favicon: ícone de antena

### Sidebar — Itens de Navegação (matching imagens)
1. Dashboard (ícone: grid/dashboard)
2. Torre de Controle
3. Viagens
4. Motoristas
5. Geofences
6. Alertas (com badge de contagem — ex: 12)
7. Insights
8. Configurações
- Rodapé: "Recolher menu" com seta

### Topbar — Componentes
- Search bar: "Buscar viagens, motoristas, clientes..." com atalho de teclado (⌘K)
- Date range picker: "20/05/2025 00:00 — 20/05/2025 23:59"
- Botão Filtros
- Notificações (badge com contagem)
- Avatar do usuário + nome + cargo

### Página Dashboard — Layout
**KPI Cards (linha superior, 5 cards):**
1. Entregas no prazo: valor + total + % + progress bar verde
2. % SLA: percentual grande + meta + progress bar azul
3. Motoristas em risco: contagem + total + sparkline laranja
4. Atrasos críticos: contagem + total + sparkline vermelho
5. Paradas não planejadas: contagem + total + sparkline roxo/cinza

**Área principal (2 colunas):**
- Esquerda (70%): Mapa + toggle Mapa/Satélite + legenda + tabela "Viagens em andamento"
- Direita (30%): "Exceções e alertas" (lista com ícones de severidade) + "Resumo operacional"

**Tabela Viagens em andamento:**
- Colunas: Motorista (foto+nome+placa), Cliente, Entrega, ETA, Janela, Status (badge), Localização, Progresso (% + barra)
- Menu de 3 pontos por linha

### Página Torre de Controle — Layout
**KPI Cards (linha superior, 5 cards):**
1. Viagens ativas
2. Em risco
3. Atrasos críticos
4. Sem sinal
5. Ocorrências abertas (críticas/médias)

**Área principal (2 colunas):**
- Esquerda (70%): Mapa + tabela "Viagens em maior risco"
- Direita (30%): "Fila operacional" (alertas com botão "Assumir") + "Fila de operadores"

**Fila operacional:** lista de alertas com hora, severidade (crítico/média), título, placa, motorista, cliente, desvio de ETA, botão "Assumir" / "Ligar"

### Página Viagens — Layout
**KPI Cards (5 cards):** Total viagens, No prazo, Em risco, Atrasadas, Progresso médio

**Tabs:** Em andamento (83) | Planejadas (24) | Concluídas (164) | Atrasadas (12)

**Filtros (painel lateral esquerdo):** Cliente, Operação, Rota, Prioridade, SLA/Janela, Status (multi-select com tags), Motorista (busca)

**Tabela:** checkbox, Código+Prioridade, Cliente, Motorista (foto+nome+placa), Origem, Destino, Janela, ETA, Status, Progresso (barra), Ações

**Painel lateral (ao selecionar viagem):** Mapa mini (origem→destino), métricas (distância, tempo, paradas, progresso), Linha do tempo (eventos cronológicos), botões Ver detalhes / Editar / Reagendar

### Página Motoristas — Layout
**KPI Cards (5 cards):** Motoristas ativos, Disponíveis, Em rota, Com atraso, Documentos vencendo

**Filtros:** busca, status dropdown, base dropdown, ordenar, exportar

**Tabela:** Motorista (foto+nome+placa+veículo), Disponibilidade (badge), Entregas hoje, Atraso médio (colorido), Score operacional (badge colorido), Documentos (ícones de status), Localização atual, menu

**Painel lateral (ao selecionar motorista):** foto, nome, placa, score, badge disponível, botões Ligar/Mensagem/E-mail, seção Conformidade e documentos (lista com validade), Localização atual (mapa mini + coordenadas), Últimas viagens (lista)

### Página Alertas — Layout
**KPI Cards (4 blocos):** Críticos, Abertos, Resolvidos hoje, SLA das tratativas (gauge circular + 91%)

**Filtros:** Tipo de alerta, Cliente, Rota, Responsável, Período

**Lista agrupada por severidade:**
- Críticos (12): expandível, ícone vermelho
- Médios (24): expandível, ícone amarelo
- Baixos (12): expandível, ícone verde
- Cada linha: ícone, título+subtítulo, Entrega/Rota, Motorista (foto+nome), Tempo (colorido para críticos), Origem, Status badge, Prioridade dot

**Painel lateral (ao selecionar alerta):** severidade badge, número do alerta, título, metadados (abertura, tempo em andamento, origem, prioridade), Detalhes (entrega/rota, motorista, cliente, local, desvio, descrição), Ações: Assumir alerta, Registrar tratativa, Ligar para motorista, Escalar alerta, Marcar como resolvido

### Mock Data
- 10+ viagens por status (em andamento, planejadas, concluídas, atrasadas)
- 8-10 motoristas com dados completos (documentos, score, localização)
- 12+ alertas (críticos, médios, baixos) com tipos variados
- KPIs coerentes com os dados mock
- Dados matching exatamente as imagens de referência (nomes, placas, valores)

### Mapa (Placeholder para Phase 1)
- Container com bg escuro e texto "Mapa será carregado na Phase 3"
- Preservar toggle Mapa/Satélite
- Preservar legenda de cores/status
- Preservar pontos de entrega como marcadores placeholder

### Componentes Reutilizáveis Obrigatórios
- `KPICard` — props: title, value, subtitle, trend?, sparkline?, progressBar?, color
- `StatusBadge` — props: status ('no_prazo'|'em_risco'|'atrasado'|'sem_sinal'), size
- `SeverityBadge` — props: severity ('critico'|'medio'|'baixo')
- `DataTable` — TanStack Table, com filtros, paginação, seleção de linha, painel lateral
- `ProgressBar` — valor + cor por threshold
- `SparklineChart` — mini Chart.js line chart para KPI cards
- `DriverAvatar` — foto ou initials, com status dot
- `AlertItem` — linha de alerta para fila operacional e lista de alertas
- `TripTimeline` — eventos cronológicos verticais
- `SidePanelLayout` — layout padrão para painéis de detalhes (header + scroll area + footer actions)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Arquitetura e Stack
- `.planning/ARCHITECTURE.md` — entidades, fluxos, decisões de dados
- `.planning/STACK.md` — escolhas técnicas justificadas
- `.planning/PROJECT.md` — módulos, usuários, requisitos funcionais

### Codebase atual (base para adaptar)
- `pages/dashboard.html` — estrutura HTML atual do Argon Dashboard (inspiração)
- `assets/css/argon-dashboard.css` — estilos CSS do Argon (variáveis, classes reutilizáveis)
- `package.json` — dependências atuais (apenas gulp + argon, NÃO usar no novo projeto React)

### Imagens de referência (designs alvo)
- As 5 imagens fornecidas no gsd-init mostram: Dashboard, Motoristas, Viagens, Torre de Controle, Alertas

</canonical_refs>

<specifics>
## Specific Ideas

### Exemplo de estrutura KPICard (TypeScript)
```tsx
interface KPICardProps {
  title: string
  value: string | number
  subtitle?: string
  total?: number
  percent?: string
  trend?: 'up' | 'down' | 'neutral'
  sparklineData?: number[]
  progressValue?: number
  color?: 'green' | 'blue' | 'orange' | 'red' | 'purple' | 'gray'
}
```

### Exemplo de StatusBadge visual
- `no_prazo` → bg-green-100 text-green-700, texto "No prazo"
- `em_risco` → bg-yellow-100 text-yellow-700, texto "Em risco"
- `atrasado` → bg-red-100 text-red-700, texto "Atrasado"
- `sem_sinal` → bg-gray-100 text-gray-500, texto "Sem sinal"

### URL Pattern
- `/` → redirect para `/dashboard`
- `/dashboard`
- `/torre-de-controle`
- `/viagens`
- `/motoristas`
- `/geofences`
- `/alertas`
- `/insights`
- `/configuracoes`

</specifics>

<deferred>
## Deferred Ideas

- Login/auth screen — Phase 2
- WebSocket real-time — Phase 3
- Geofence draw/edit no mapa — Phase 5
- Mobile responsiveness completa — Phase 6
- Dark mode alternativo — Phase 6
- Internacionalização — fora do escopo MVP

</deferred>

---

*Phase: 01-ui-shell-design-system*
*Context gathered: 2026-04-28 via PRD Express Path (gsd-init briefing + design images)*
