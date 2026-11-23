# Plan de Modernización Web (Modern Web Guidance) — Completado ✅

Este documento recopila las tareas de **Prioridad Media** y **Prioridad Baja** identificadas durante la auditoría de `modern-web-guidance`, todas implementadas y verificadas en el build de producción.

---

## 1. Prioridad Media: Rendimiento y Modernización de APIs JS

### 1.1 ✅ Code-Splitting y Carga Asíncrona de KaTeX (Ahorro de ~290 KB en Bundle Inicial)
- **Archivos:** [`frontend/src/main.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/main.tsx), [`frontend/src/components/MathFormula.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/MathFormula.tsx), [`frontend/src/components/MetricFormulaModal.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/MetricFormulaModal.tsx), [`frontend/src/components/SavedBenchmarksModal.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/SavedBenchmarksModal.tsx), [`frontend/vite.config.ts`](file:///mnt/Research/llm_benchmarker/frontend/vite.config.ts)
- **Resultado:**
  - `katex/dist/katex.min.css` se carga bajo demanda en [`MathFormula.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/MathFormula.tsx) (`dist/assets/katex-*.css` de 29.8 KB).
  - [`MetricFormulaModal.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/MetricFormulaModal.tsx) y [`SavedBenchmarksModal.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/SavedBenchmarksModal.tsx) se cargan con `React.lazy()` y `React.Suspense`.
  - Chunk separado `katex-*.js` (259.1 KB) y `vendor-*.js` (243.2 KB) configurados en [`vite.config.ts`](file:///mnt/Research/llm_benchmarker/frontend/vite.config.ts).

### 1.2 ✅ Migración a `Array.prototype.toSorted()` (ES2023)
- **Archivo:** [`frontend/src/components/Leaderboard.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/Leaderboard.tsx#L63-L73)
- **Resultado:** Reemplazo de `[...modelList].sort(...)` por `modelList.toSorted(...)` sin clonación intermedia.

### 1.3 ✅ Atributos `autoComplete` y Prevención de Autocorrección en Formulario de Login
- **Archivo:** [`frontend/src/components/LoginPage.tsx`](file:///mnt/Research/llm_benchmarker/frontend/src/components/LoginPage.tsx#L95-L132)
- **Resultado:** Añadidos `name="username"`, `autoComplete="username"`, `autoCorrect="off"`, `autoCapitalize="none"`, `spellCheck={false}` en el usuario y `name="password"`, `autoComplete="current-password"` en la contraseña.

---

## 2. Prioridad Baja: Estilos CSS Modernos y Resiliencia

### 2.1 ✅ Estandarización de Scrollbars W3C (`scrollbar-width` y `scrollbar-color`)
- **Archivo:** [`frontend/src/index.css`](file:///mnt/Research/llm_benchmarker/frontend/src/index.css#L92-L118)
- **Resultado:** Propiedades estándar `scrollbar-width: thin` y `scrollbar-color` con variables `--scrollbar-thumb` y `--scrollbar-track`, aislando los pseudo-elementos `::-webkit-scrollbar` dentro de `@supports not (scrollbar-color: auto)` con reset `scrollbar-width: auto`.

### 2.2 ✅ Prevención de FOUC con `<meta name="color-scheme">` y CSS `color-scheme`
- **Archivos:** [`frontend/index.html`](file:///mnt/Research/llm_benchmarker/frontend/index.html#L4-L6) y [`frontend/src/index.css`](file:///mnt/Research/llm_benchmarker/frontend/src/index.css#L6-L33)
- **Resultado:** Declarado `<meta name="color-scheme" content="dark light" />` en el `<head>` y `color-scheme: light` / `color-scheme: dark` en `:root` y `.dark`.

### 2.3 ✅ Optimización de Tipografías Web
- **Archivo:** [`frontend/index.html`](file:///mnt/Research/llm_benchmarker/frontend/index.html#L10-L12)
- **Resultado:** Verificado `preconnect` a `fonts.googleapis.com` y `fonts.gstatic.com` (con `crossorigin`) junto con `&display=swap`.
