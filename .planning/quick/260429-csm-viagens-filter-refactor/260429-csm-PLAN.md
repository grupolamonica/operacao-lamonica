---
quick_id: 260429-csm
slug: viagens-filter-refactor
description: "Refatorar filtros da tela Viagens: substituir painel lateral pelo padrão toolbar inline da tela Motoristas e converter tabs de status em Select dropdown"
date: 2026-04-29
---

## Task 1: Refatorar ViagensTable — internalizar filtros no toolbar inline

**Files:** torre-de-controle/src/app/pages/viagens/components/ViagensTable.tsx

Adicionar toolbar inline idêntico ao MotoristasTable:
- Search motorista
- Select status (substituindo as tabs)
- Select cliente
- Select operação  
- Select rota
- Select prioridade
- Select SLA
- Botões Ordenar, Filtros, Exportar

Internalizar estado de filters (remover prop filters/onChange).

## Task 2: Simplificar ViagensPage — remover sidebar e tabs

**Files:** torre-de-controle/src/app/pages/viagens/ViagensPage.tsx

- Remover ViagensFiltersPanel e ViagensTabs
- Remover grid de 12 colunas
- Tabela ocupa largura total
- Remover estado filters da página
