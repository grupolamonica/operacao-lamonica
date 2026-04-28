---
phase: 01-ui-shell-design-system
plan: 01
subsystem: frontend-scaffold
tags:
  - frontend
  - vite5
  - react18
  - tailwind4
  - shadcn
  - setup
dependency_graph:
  requires: []
  provides:
    - torre-de-controle/package.json (pinned deps)
    - torre-de-controle/vite.config.ts (@ alias + tailwind plugin)
    - torre-de-controle/src/index.css (CSS vars sidebar + status)
    - torre-de-controle/src/components/ui/* (18 shadcn components)
    - torre-de-controle/src/lib/utils.ts (cn() helper)
  affects:
    - All subsequent plans in Phase 1 depend on this scaffold
tech_stack:
  added:
    - react@18.3.1
    - react-dom@18.3.1
    - vite@5.4.21
    - "@vitejs/plugin-react@4.3.4"
    - tailwindcss@4.2.4
    - "@tailwindcss/vite@4.2.4"
    - react-router-dom@6.30.3
    - zustand@5.0.12
    - "@tanstack/react-table@8.21.3"
    - chart.js@4.5.1
    - react-chartjs-2@5.3.1
    - date-fns@4.1.0
    - clsx@2.1.1
    - tailwind-merge@3.0.2
    - class-variance-authority@0.7.1
    - lucide-react@0.511.0
    - radix-ui@^1.4.3 (added by shadcn CLI automatically)
  patterns:
    - Tailwind v4 CSS-first config via @theme inline (no tailwind.config.js)
    - shadcn new-york style with zinc base + CSS variables
    - Path alias @/* → src/* in both vite.config.ts and tsconfig.app.json
key_files:
  created:
    - torre-de-controle/package.json
    - torre-de-controle/.gitignore
    - torre-de-controle/vite.config.ts
    - torre-de-controle/tsconfig.json
    - torre-de-controle/tsconfig.app.json
    - torre-de-controle/components.json
    - torre-de-controle/src/index.css
    - torre-de-controle/src/lib/utils.ts
    - torre-de-controle/src/App.tsx
    - torre-de-controle/src/main.tsx
    - torre-de-controle/src/components/ui/ (18 files + skeleton)
    - torre-de-controle/src/hooks/use-mobile.ts
  modified: []
decisions:
  - "@vitejs/plugin-react@4.3.4 used instead of 6.0.1 (6.0.1 requires Vite 8)"
  - "erasableSyntaxOnly removed from tsconfig.app.json (requires TypeScript 5.8+, project uses 5.6)"
  - "shadcn CLI added @custom-variant dark and .dark block to index.css — accepted, no functional impact (dark class never applied)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-28"
  tasks_completed: 3
  files_created: 35
---

# Phase 1 Plan 01: Project Setup Summary

Scaffold completo do projeto Torre de Controle: Vite 5 + React 18.3.1 + TypeScript strict + Tailwind v4 via plugin (sem tailwind.config.js) + shadcn/ui com 18 componentes base e CSS vars de sidebar dark navy e status colors.

## Objective Achieved

Projeto `torre-de-controle/` criado como subdiretório do repo Argon Dashboard, compilável com `npm run build` (exit 0), dev server funcional, shadcn CLI operacional com smoke test de Button, CSS vars para sidebar dark (`#1a1a2e`) e status colors definidas no `index.css`.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Criar projeto Vite e instalar dependências exatas | 725f7c7 | Done |
| 2 | Configurar Vite + TypeScript paths + Tailwind v4 + CSS vars | bb9781e | Done |
| 3 | Inicializar shadcn/ui e adicionar 18 componentes base | 3713f0f | Done |

## Key Files Created

- `torre-de-controle/package.json` — dependências pinadas sem `^` em críticas (react, vite, router, tailwind)
- `torre-de-controle/vite.config.ts` — `@tailwindcss/vite` plugin + `@` alias para `./src`
- `torre-de-controle/tsconfig.app.json` — strict mode + `@/*: ["./src/*"]` paths
- `torre-de-controle/src/index.css` — `@import "tailwindcss"` + `@theme inline` + sidebar dark vars + status colors
- `torre-de-controle/src/lib/utils.ts` — `cn()` com clsx + tailwind-merge
- `torre-de-controle/components.json` — shadcn new-york, zinc, cssVariables: true
- `torre-de-controle/src/components/ui/` — 18 componentes shadcn + skeleton

## Dependencies Installed (Final Versions)

| Package | Version | Pinned |
|---------|---------|--------|
| react | 18.3.1 | yes |
| react-dom | 18.3.1 | yes |
| vite | 5.4.21 | yes |
| @vitejs/plugin-react | 4.3.4 | yes |
| tailwindcss | 4.2.4 | yes |
| @tailwindcss/vite | 4.2.4 | yes |
| react-router-dom | 6.30.3 | yes |
| zustand | 5.0.12 | yes |
| @tanstack/react-table | 8.21.3 | yes |
| chart.js | 4.5.1 | yes |
| react-chartjs-2 | 5.3.1 | yes |
| date-fns | 4.1.0 | yes |
| clsx | 2.1.1 | yes |
| tailwind-merge | 3.0.2 | yes |
| class-variance-authority | 0.7.1 | yes |
| lucide-react | 0.511.0 | yes |

## Build Verification

```
vite v5.4.21 building for production...
✓ 142 modules transformed.
dist/index.html                   0.46 kB │ gzip:  0.30 kB
dist/assets/index-CLruYPqa.css   56.19 kB │ gzip:  9.62 kB
dist/assets/index-Cn2KamgI.js   169.01 kB │ gzip: 54.89 kB
✓ built in 3.34s
```

`npm run build` exit 0. `npx tsc --noEmit` clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @vitejs/plugin-react version conflict**
- **Found during:** Task 1
- **Issue:** RESEARCH.md specified `@vitejs/plugin-react@6.0.1` but that version has `peerDependencies: { vite: "^8.0.0" }` — incompatible with Vite 5
- **Fix:** Used `@vitejs/plugin-react@4.3.4` (latest Vite 5 compatible version)
- **Files modified:** `torre-de-controle/package.json`
- **Commit:** 725f7c7

**2. [Rule 1 - Bug] erasableSyntaxOnly not supported in TypeScript 5.6**
- **Found during:** Task 2
- **Issue:** `tsconfig.app.json` spec included `"erasableSyntaxOnly": true` which is a TypeScript 5.8+ option; project uses TypeScript ~5.6.2
- **Fix:** Removed `erasableSyntaxOnly` from `tsconfig.app.json`
- **Files modified:** `torre-de-controle/tsconfig.app.json`
- **Commit:** bb9781e

**3. [Rule 2 - Expected behavior] shadcn CLI modified index.css**
- **Found during:** Task 3
- **Issue:** shadcn sidebar add command appended `@custom-variant dark` and `.dark { --sidebar: ... }` block
- **Fix:** Accepted the change — our custom `--sidebar: #1a1a2e` in `:root` takes precedence; `.dark` block is inert since the app never adds `.dark` to `<html>`. All Task 2 CSS vars remain intact.
- **Files modified:** `torre-de-controle/src/index.css`
- **Commit:** 3713f0f

## Known Stubs

None. `App.tsx` contains a smoke test Button import that is intentional for this plan's acceptance criteria. Subsequent plans will replace App.tsx with the real router setup.

## Self-Check: PASSED

- torre-de-controle/package.json: FOUND
- torre-de-controle/vite.config.ts: FOUND
- torre-de-controle/components.json: FOUND
- torre-de-controle/src/index.css: FOUND (contains --sidebar: #1a1a2e)
- torre-de-controle/src/lib/utils.ts: FOUND
- torre-de-controle/src/components/ui/button.tsx: FOUND
- torre-de-controle/src/components/ui/sidebar.tsx: FOUND
- dist/index.html: FOUND (build passed)
- Commits 725f7c7, bb9781e, 3713f0f: VERIFIED in git log
