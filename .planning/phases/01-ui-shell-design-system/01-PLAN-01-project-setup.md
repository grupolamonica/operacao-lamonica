---
phase: 01-ui-shell-design-system
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - torre-de-controle/package.json
  - torre-de-controle/vite.config.ts
  - torre-de-controle/tsconfig.json
  - torre-de-controle/tsconfig.app.json
  - torre-de-controle/tsconfig.node.json
  - torre-de-controle/components.json
  - torre-de-controle/src/index.css
  - torre-de-controle/src/main.tsx
  - torre-de-controle/src/App.tsx
  - torre-de-controle/src/lib/utils.ts
  - torre-de-controle/.gitignore
autonomous: true
requirements:
  - PHASE1-SETUP
  - PHASE1-VITE
  - PHASE1-SHADCN
tags:
  - frontend
  - setup
  - vite
  - react18
  - tailwind4
  - shadcn

must_haves:
  truths:
    - "Projeto torre-de-controle/ existe com Vite 5 + React 18 + TypeScript strict"
    - "npm run dev inicia servidor de desenvolvimento sem erros"
    - "npm run build produz output sem erros TypeScript"
    - "shadcn CLI consegue adicionar componentes (button funciona como smoke test)"
    - "Tailwind v4 funciona via @tailwindcss/vite (utilitários renderizam)"
    - "Path alias @/* resolve para src/*"
  artifacts:
    - path: "torre-de-controle/package.json"
      provides: "Dependencies pinned to exact versions per RESEARCH.md"
      contains: '"react": "18.3.1"'
    - path: "torre-de-controle/vite.config.ts"
      provides: "Vite config with React + Tailwind plugins + @ alias"
      contains: "@tailwindcss/vite"
    - path: "torre-de-controle/components.json"
      provides: "shadcn config (New York style, Zinc base, CSS vars)"
      contains: "new-york"
    - path: "torre-de-controle/src/index.css"
      provides: "Tailwind v4 import + base CSS vars"
      contains: '@import "tailwindcss"'
    - path: "torre-de-controle/src/lib/utils.ts"
      provides: "cn() helper (clsx + tailwind-merge)"
      contains: "tailwind-merge"
  key_links:
    - from: "torre-de-controle/vite.config.ts"
      to: "torre-de-controle/src/index.css"
      via: "@tailwindcss/vite plugin processes CSS"
      pattern: "tailwindcss\\(\\)"
    - from: "torre-de-controle/tsconfig.app.json"
      to: "torre-de-controle/src/*"
      via: "paths alias @/*"
      pattern: "\"@/\\*\""
---

<objective>
Scaffold do projeto frontend Torre de Controle: Vite 5 + React 18 + TypeScript strict + Tailwind v4 + shadcn/ui inicializado. Subdiretório `torre-de-controle/` na raiz do repo (não conflita com Argon estático).

Purpose: Foundation para todos os planos seguintes. Sem isto, nenhum outro plano roda.
Output: Projeto compilável com `npm run build`, dev server funcionando, shadcn CLI operacional, base CSS vars definidas.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STACK.md
@.planning/ARCHITECTURE.md
@.planning/phases/01-ui-shell-design-system/01-CONTEXT.md
@.planning/phases/01-ui-shell-design-system/01-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Criar projeto Vite e instalar dependências exatas</name>
  <files>torre-de-controle/package.json, torre-de-controle/.gitignore</files>
  <read_first>
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (seções "Standard Stack", "Common Pitfalls 1, 2, 4", "Instalação")
    - .planning/STACK.md (Frontend table)
  </read_first>
  <action>
Working directory para todos os comandos: raiz do repo (`C:/Users/antonio.magalhaes/Documents/Projetos/argon-dashboard/.claude/worktrees/elastic-napier-5559df`).

Execute em ordem:

```bash
# 1. Criar projeto Vite 5 + React + TS (NÃO usar @latest — instala Vite 8 e React 19)
npm create vite@5 torre-de-controle -- --template react-ts

cd torre-de-controle

# 2. Override React 19 (default do template) → React 18.3.1
npm install react@18.3.1 react-dom@18.3.1
npm install -D @types/react@18 @types/react-dom@18

# 3. Pinnar Vite 5 (template pode ter ^7)
npm install -D vite@5.4.21 @vitejs/plugin-react@6.0.1

# 4. Tailwind v4 + plugin Vite + types/node
npm install tailwindcss@4.2.4 @tailwindcss/vite@4.2.4
npm install -D @types/node

# 5. Routing + estado (PINNAR react-router-dom@6 — sem pin instala v7)
npm install react-router-dom@6.30.3 zustand@5.0.12

# 6. Tabelas + gráficos + datas
npm install @tanstack/react-table@8.21.3 chart.js@4.5.1 react-chartjs-2@5.3.1 date-fns@4.1.0

# 7. Helpers shadcn (clsx, tailwind-merge, cva, lucide-react)
npm install clsx@2.1.1 tailwind-merge@3.0.2 class-variance-authority@0.7.1 lucide-react@0.511.0
```

Após install, verificar `package.json` e ajustar manualmente se algum range `^` ficou em vez da versão exata:
- `react`, `react-dom` → `"18.3.1"` (sem ^)
- `vite` → `"5.4.21"`
- `react-router-dom` → `"6.30.3"`
- `tailwindcss`, `@tailwindcss/vite` → `"4.2.4"`

Anexar ao `.gitignore` (já criado pelo Vite) — verificar que contém `node_modules`, `dist`, `.env*.local`. Se faltar `.env*`, adicionar.
  </action>
  <verify>
    <automated>cd torre-de-controle && node -e "const p=require('./package.json'); const must={react:'18.3.1','react-dom':'18.3.1',vite:'5.4.21','react-router-dom':'6.30.3',tailwindcss:'4.2.4','@tailwindcss/vite':'4.2.4',zustand:'5.0.12','@tanstack/react-table':'8.21.3','chart.js':'4.5.1','react-chartjs-2':'5.3.1','date-fns':'4.1.0'}; for(const [k,v] of Object.entries(must)){const got=(p.dependencies?.[k]||p.devDependencies?.[k]||'').replace(/^[\^~]/,''); if(got!==v){console.error('MISMATCH',k,'expected',v,'got',got); process.exit(1);}} console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - Diretório `torre-de-controle/` existe na raiz do repo
    - `torre-de-controle/package.json` contém literalmente `"react": "18.3.1"` (sem ^)
    - `torre-de-controle/package.json` contém literalmente `"react-dom": "18.3.1"`
    - `torre-de-controle/package.json` contém literalmente `"vite": "5.4.21"`
    - `torre-de-controle/package.json` contém literalmente `"react-router-dom": "6.30.3"`
    - `torre-de-controle/package.json` contém literalmente `"tailwindcss": "4.2.4"`
    - `torre-de-controle/package.json` contém literalmente `"@tailwindcss/vite": "4.2.4"`
    - `torre-de-controle/package.json` contém `"zustand": "5.0.12"`, `"@tanstack/react-table": "8.21.3"`, `"chart.js": "4.5.1"`, `"react-chartjs-2": "5.3.1"`, `"date-fns": "4.1.0"`
    - `torre-de-controle/package.json` contém `"clsx"`, `"tailwind-merge"`, `"class-variance-authority"`, `"lucide-react"` em dependencies
    - `torre-de-controle/node_modules/` existe
    - `torre-de-controle/.gitignore` contém `node_modules`
  </acceptance_criteria>
  <done>Dependências instaladas com versões exatas. Comando de verificação acima imprime "OK" e exit 0.</done>
</task>

<task type="auto">
  <name>Task 2: Configurar Vite + TypeScript paths + Tailwind v4 + index.css com CSS vars completas</name>
  <files>torre-de-controle/vite.config.ts, torre-de-controle/tsconfig.json, torre-de-controle/tsconfig.app.json, torre-de-controle/tsconfig.node.json, torre-de-controle/src/index.css, torre-de-controle/src/lib/utils.ts, torre-de-controle/src/main.tsx, torre-de-controle/src/App.tsx</files>
  <read_first>
    - torre-de-controle/vite.config.ts (gerado pelo Vite — ver atual antes de sobrescrever)
    - torre-de-controle/tsconfig.app.json (gerado pelo Vite — ver atual)
    - torre-de-controle/src/main.tsx (gerado pelo Vite)
    - torre-de-controle/src/App.tsx (gerado pelo Vite)
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (seções "Code Examples → vite.config.ts completo", "tsconfig.app.json — paths", "src/index.css — base", "Pattern 2: Sidebar Dark com Conteúdo Light")
  </read_first>
  <action>
**1. Sobrescrever `torre-de-controle/vite.config.ts` com:**

```typescript
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**2. Sobrescrever `torre-de-controle/tsconfig.json` com:**

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**3. Editar `torre-de-controle/tsconfig.app.json` para adicionar `baseUrl` + `paths` + manter `strict: true`. Resultado final:**

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

**4. Sobrescrever `torre-de-controle/src/index.css`** com Tailwind v4 import + CSS vars completas (sidebar dark, status colors, base shadcn). Conteúdo:

```css
@import "tailwindcss";

:root {
  /* shadcn base — light theme */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.5rem;

  /* Sidebar dark navy — independente do tema global */
  --sidebar: #1a1a2e;
  --sidebar-foreground: #8892b0;
  --sidebar-primary: #0f62fe;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(255, 255, 255, 0.08);
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-ring: #0f62fe;

  /* Status colors (custom tokens) */
  --status-no-prazo: #2ecc71;
  --status-em-risco: #f39c12;
  --status-atrasado: #e74c3c;
  --status-sem-sinal: #95a5a6;

  /* App background */
  --app-background: #f4f6f9;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-status-no-prazo: var(--status-no-prazo);
  --color-status-em-risco: var(--status-em-risco);
  --color-status-atrasado: var(--status-atrasado);
  --color-status-sem-sinal: var(--status-sem-sinal);
  --color-app-background: var(--app-background);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

* { border-color: var(--border); }

html, body, #root { height: 100%; }
body { background: var(--app-background); color: var(--foreground); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
```

**5. Criar `torre-de-controle/src/lib/utils.ts`:**

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**6. Sobrescrever `torre-de-controle/src/App.tsx`** com placeholder mínimo:

```tsx
export default function App() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Torre de Controle — bootstrap OK</h1>
      <p className="text-sm text-gray-500">Configurado: Vite 5, React 18, Tailwind v4, shadcn pronto.</p>
    </div>
  )
}
```

**7. `torre-de-controle/src/main.tsx`** já criado pelo Vite — preservar, mas garantir que importa `./index.css`. Conteúdo final:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/vite.config.ts` contém literalmente `import tailwindcss from '@tailwindcss/vite'`
    - `torre-de-controle/vite.config.ts` contém literalmente `tailwindcss()`
    - `torre-de-controle/vite.config.ts` contém literalmente `'@': path.resolve(__dirname, './src')`
    - `torre-de-controle/tsconfig.app.json` contém literalmente `"@/*": ["./src/*"]`
    - `torre-de-controle/tsconfig.app.json` contém literalmente `"strict": true`
    - `torre-de-controle/src/index.css` contém literalmente `@import "tailwindcss"`
    - `torre-de-controle/src/index.css` contém literalmente `--sidebar: #1a1a2e`
    - `torre-de-controle/src/index.css` contém literalmente `--sidebar-foreground: #8892b0`
    - `torre-de-controle/src/index.css` contém literalmente `--sidebar-primary: #0f62fe`
    - `torre-de-controle/src/index.css` contém literalmente `--status-no-prazo: #2ecc71`
    - `torre-de-controle/src/index.css` contém literalmente `--status-em-risco: #f39c12`
    - `torre-de-controle/src/index.css` contém literalmente `--status-atrasado: #e74c3c`
    - `torre-de-controle/src/index.css` contém literalmente `--status-sem-sinal: #95a5a6`
    - `torre-de-controle/src/index.css` contém `@theme inline {`
    - `torre-de-controle/src/lib/utils.ts` contém `tailwind-merge`
    - `torre-de-controle/src/lib/utils.ts` contém `export function cn`
    - `npm run build` em `torre-de-controle/` exit 0
    - `torre-de-controle/dist/index.html` existe após build
    - NÃO existe arquivo `torre-de-controle/tailwind.config.js` (Tailwind v4 não usa)
  </acceptance_criteria>
  <done>Build passa, CSS vars exatas inseridas, paths funcionando, tailwind.config.js NÃO criado.</done>
</task>

<task type="auto">
  <name>Task 3: Inicializar shadcn/ui e adicionar componentes base</name>
  <files>torre-de-controle/components.json, torre-de-controle/src/components/ui/* (gerados pela CLI)</files>
  <read_first>
    - torre-de-controle/src/index.css (já criado na Task 2 — shadcn vai preservar)
    - .planning/phases/01-ui-shell-design-system/01-RESEARCH.md (seção "Instalação", item 4 e 7)
  </read_first>
  <action>
**ATENÇÃO:** Usar `shadcn` (sem `-ui`) — `shadcn-ui` é o nome antigo, não funciona mais (RESEARCH Pitfall 4).

Working directory: `torre-de-controle/`.

**1. Criar `torre-de-controle/components.json` MANUALMENTE** (evita prompts interativos da CLI):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**2. Adicionar componentes shadcn necessários** para todos os planos seguintes (ordem evita prompts de subdependências):

```bash
cd torre-de-controle
npx shadcn@latest add button --yes
npx shadcn@latest add badge --yes
npx shadcn@latest add card --yes
npx shadcn@latest add input --yes
npx shadcn@latest add label --yes
npx shadcn@latest add separator --yes
npx shadcn@latest add scroll-area --yes
npx shadcn@latest add tooltip --yes
npx shadcn@latest add avatar --yes
npx shadcn@latest add progress --yes
npx shadcn@latest add tabs --yes
npx shadcn@latest add select --yes
npx shadcn@latest add checkbox --yes
npx shadcn@latest add dropdown-menu --yes
npx shadcn@latest add table --yes
npx shadcn@latest add dialog --yes
npx shadcn@latest add sheet --yes
npx shadcn@latest add sidebar --yes
```

Se `--yes` não funcionar em alguma versão, usar `printf 'y\n' | npx shadcn@latest add <component>`.

Se shadcn pedir para sobrescrever `src/index.css`, **recusar** (já configurado na Task 2). Se sobrescrever automaticamente, restaurar conteúdo da Task 2 e re-anexar apenas tokens shadcn que faltarem (a Task 2 já cobre tudo).

**3. Smoke test**: editar `torre-de-controle/src/App.tsx` para importar e renderizar Button:

```tsx
import { Button } from '@/components/ui/button'

export default function App() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Torre de Controle — bootstrap OK</h1>
      <p className="text-sm text-gray-500">Vite 5 + React 18 + Tailwind v4 + shadcn ready.</p>
      <Button>Smoke test button</Button>
    </div>
  )
}
```
  </action>
  <verify>
    <automated>cd torre-de-controle && npm run build && node -e "const fs=require('fs'); const need=['button','badge','card','input','label','separator','scroll-area','tooltip','avatar','progress','tabs','select','checkbox','dropdown-menu','table','dialog','sheet','sidebar']; for(const c of need){if(!fs.existsSync('src/components/ui/'+c+'.tsx')){console.error('MISSING',c); process.exit(1);}} console.log('OK');"</automated>
  </verify>
  <acceptance_criteria>
    - `torre-de-controle/components.json` existe e contém literalmente `"style": "new-york"`
    - `torre-de-controle/components.json` contém literalmente `"baseColor": "zinc"`
    - `torre-de-controle/components.json` contém literalmente `"cssVariables": true`
    - `torre-de-controle/components.json` contém literalmente `"@/components"` no aliases
    - `torre-de-controle/src/components/ui/button.tsx` existe
    - `torre-de-controle/src/components/ui/badge.tsx` existe
    - `torre-de-controle/src/components/ui/card.tsx` existe
    - `torre-de-controle/src/components/ui/sidebar.tsx` existe
    - `torre-de-controle/src/components/ui/sheet.tsx` existe
    - `torre-de-controle/src/components/ui/dialog.tsx` existe
    - `torre-de-controle/src/components/ui/dropdown-menu.tsx` existe
    - `torre-de-controle/src/components/ui/table.tsx` existe
    - `torre-de-controle/src/components/ui/tabs.tsx` existe
    - `torre-de-controle/src/components/ui/scroll-area.tsx` existe
    - `torre-de-controle/src/components/ui/avatar.tsx` existe
    - `torre-de-controle/src/components/ui/progress.tsx` existe
    - `torre-de-controle/src/components/ui/select.tsx` existe
    - `torre-de-controle/src/components/ui/checkbox.tsx` existe
    - `torre-de-controle/src/components/ui/input.tsx` existe
    - `torre-de-controle/src/components/ui/label.tsx` existe
    - `torre-de-controle/src/components/ui/separator.tsx` existe
    - `torre-de-controle/src/components/ui/tooltip.tsx` existe
    - `torre-de-controle/src/index.css` ainda contém `--sidebar: #1a1a2e` (Task 2 preservado)
    - `torre-de-controle/src/App.tsx` contém literalmente `import { Button } from '@/components/ui/button'`
    - `npm run build` exit 0
  </acceptance_criteria>
  <done>shadcn inicializado, 18 componentes UI presentes, build passa, smoke test compila.</done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dev → repo | Comandos npm trazem dependências de terceiros |
| repo → bundle | Código fonte vira artefato distribuível |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-01 | Tampering | npm dependencies | mitigate | Versões pinadas exatas em package.json (sem `^` ou `~` em libs críticas: react, vite, react-router-dom, tailwind) |
| T-01-02 | Information Disclosure | tokens/segredos | mitigate | `.gitignore` cobre `.env*.local`. Nenhum token hardcoded no código (Phase 1 não tem tokens) |
| T-01-03 | Tampering | shadcn CLI gera código | accept | Componentes shadcn são copiados localmente — auditáveis em PR; mudanças versionadas no git |

</threat_model>

<verification>
- `cd torre-de-controle && npm run build && npx tsc --noEmit` exit 0
- `cd torre-de-controle && npm run dev` inicia sem erro (manual)
- `package.json` mostra versões exatas pinadas
- `src/index.css` contém todas as CSS vars de status e sidebar
- 18 componentes shadcn em `src/components/ui/`
</verification>

<success_criteria>
- [ ] Diretório `torre-de-controle/` criado e populado
- [ ] React 18.3.1 + Vite 5.4.21 + react-router-dom 6.30.3 pinados
- [ ] Tailwind v4 funcionando via plugin Vite (sem tailwind.config.js)
- [ ] CSS vars sidebar dark (#1a1a2e, #8892b0, #0f62fe) e status (#2ecc71, #f39c12, #e74c3c, #95a5a6) em index.css
- [ ] shadcn inicializado com 18 componentes base
- [ ] Path alias `@/*` funcional
- [ ] `npm run build` passa
</success_criteria>

<output>
Após completion, criar `.planning/phases/01-ui-shell-design-system/01-01-SUMMARY.md` listando: comandos executados, versões finais, arquivos criados, smoke test result.
</output>

## PLANNING COMPLETE
