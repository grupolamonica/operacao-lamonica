# Torre de Controle de Entregas — PROJECT.md

## Problem Statement

Motoristas que prestam serviço para a operação Shopee não estão cumprindo janelas de entrega. Hoje existe rastreamento GPS isolado, mas falta uma ferramenta centralizada para:
- Detectar riscos de atraso **antes** da ruptura do SLA
- Visualizar frota em tempo real no mapa com geofences
- Identificar desvios, paradas não planejadas, perda de sinal
- Registrar tratativas operacionais com rapidez
- Dar visibilidade gerencial sobre performance

**Impacto atual:** % SLA abaixo da meta. Reação reativa, não preventiva. Informação fragmentada.

## Business Goal

Aumentar % de entregas dentro da janela Shopee através de:
1. Visibilidade em tempo real da frota
2. Alertas preditivos de risco (ETA vs janela)
3. Padronização de tratativas operacionais
4. Base confiável para tomada de decisão

**Meta de SLA:** ≥ 95% entregas dentro da janela (imagem de referência mostra meta em 95%, atual 92,6%)

## Users

| Perfil | Ação principal |
|--------|----------------|
| Torre de Controle | Monitora mapa, assume alertas, registra tratativas |
| Analista Operacional | Acompanha viagens, filtra exceções, analisa riscos |
| Supervisor de Logística | Supervisiona equipe, visualiza KPIs, gerencia alertas críticos |
| Gestor da Operação | Acompanha indicadores, toma decisões gerenciais |
| Coordenador (indireto) | Consulta insights, exporta relatórios |

## Modules

### 1. Dashboard Operacional
- KPIs em tempo real: entregas no prazo, % SLA, motoristas em risco, atrasos críticos, paradas não planejadas
- Mapa interativo com todos os veículos em rota
- Lista de viagens em andamento com status
- Painel lateral de exceções e alertas
- Resumo operacional

### 2. Torre de Controle
- Fila operacional priorizada (críticas → médias → baixas)
- Mapa com overlay de incidentes (ícones de ocorrência, geofence, sem sinal)
- Viagens em maior risco (tabela)
- Fila de operadores disponíveis
- Registrar tratativa rápida
- Botão "Assumir" alerta

### 3. Viagens
- Lista completa com tabs: Em andamento, Planejadas, Concluídas, Atrasadas
- KPIs de viagens: total, no prazo, em risco, atrasadas, progresso médio
- Filtros: cliente, operação, rota, prioridade, SLA/janela, status, motorista
- Painel lateral de detalhes da viagem selecionada: mapa mini, linha do tempo, distância, ETA
- Exportação

### 4. Motoristas
- Lista com: disponibilidade, entregas hoje, atraso médio, score operacional, documentos, localização atual
- Painel lateral: foto, placa, score, conformidade de documentos, localização, últimas viagens
- Ações rápidas: Ligar, Mensagem, E-mail
- Gráfico de desempenho da equipe

### 5. Geofences
- Criar/editar zonas no mapa (polígono, círculo)
- Tipos: zona restrita, base, ponto de entrega, área de risco
- Histórico de entradas/saídas
- Alertas automáticos por geofence

### 6. Alertas
- Lista agrupada por severidade: Críticos, Médios, Baixos
- KPIs: críticos, abertos, resolvidos hoje, SLA das tratativas
- Filtros: tipo, cliente, rota, responsável, período
- Painel lateral de detalhes + ações (assumir, registrar tratativa, ligar, escalar, resolver)
- Tipos de alerta: atraso crítico, desvio não autorizado, parada não planejada, sinal GPS intermitente, tempo de parada elevado, entrega fora da janela, checklist incompleto

### 7. Insights
- Métricas históricas de performance
- Tendências de SLA
- Ranking de motoristas
- Análise de rotas problemáticas

### 8. Configurações
- Usuários e perfis de acesso
- Regras de alertas (thresholds configuráveis)
- Geofences padrão
- Integrações (GPS providers)

## Data Available

```
Localização em tempo real:
  - lat, lng, timestamp, velocidade, heading
  - vehicle_id, driver_id, trip_id
  - signal_quality, last_update

Viagem:
  - trip_id, client, route_id, origin, destination
  - delivery_window (start, end), eta, status
  - planned_stops[], actual_stops[]
  - progress %, distance_total, distance_done

Motorista:
  - driver_id, name, phone, photo
  - vehicle_id, plate, vehicle_type
  - operational_score, documents[]

Eventos:
  - geofence_enter/exit, unplanned_stop
  - signal_loss, signal_recovery
  - delivery_attempt (success/fail)
  - route_deviation

Tratativas:
  - alert_id, operator_id, timestamp
  - action_type, notes, outcome
```

## Non-Functional Requirements

| Requisito | Alvo |
|-----------|------|
| Atualização de posição | ≤ 10s latência no mapa |
| Veículos simultâneos | ≥ 500 marcadores no mapa sem degradação |
| Uptime | 99.5% durante janela operacional |
| Tempo de login | < 2s |
| Carregamento dashboard | < 3s |
| RBAC | 4 perfis: admin, supervisor, analyst, viewer |
| Auditoria | Log de todas as tratativas operacionais |
