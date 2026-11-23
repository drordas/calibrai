---
name: LLM Benchmark Studio
description: Interactive JCR psychometric monograph and multi-model statistical validation workbench.
colors:
  archival-cream: "#FAF8F5"
  vellum-card: "#FCFBF9"
  charcoal-ink: "#141413"
  scholarly-crimson: "#7C1D26"
  illuminated-crimson: "#C83E4B"
  prussian-slate: "#1E3A5F"
  nocturnal-prussian: "#7BA3D4"
  warm-stone: "#EDE8DD"
  muted-paper: "#F0ECE3"
  editorial-slate-brown: "#615C52"
  booktabs-rule: "#D5CFC2"
  alert-vermilion: "#BA311C"
  nocturnal-folio: "#121316"
  nocturnal-card: "#18191E"
  warm-parchment: "#EFECE6"
typography:
  display:
    fontFamily: "'Source Serif 4', Georgia, Cambria, serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "'Source Serif 4', Georgia, Cambria, serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Source Serif 4', Georgia, Cambria, serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Source Sans 3', -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'cv02', 'cv03', 'cv04', 'cv11'"
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "tabular-nums"
rounded:
  none: "0px"
  sm: "2px"
  md: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.scholarly-crimson}"
    textColor: "{colors.archival-cream}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.vellum-card}"
    textColor: "{colors.charcoal-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    height: "32px"
  nav-tab-active:
    backgroundColor: "{colors.scholarly-crimson}"
    textColor: "{colors.archival-cream}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "6px 14px"
  card-monograph:
    backgroundColor: "{colors.vellum-card}"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.none}"
    padding: "24px"
  badge-telemetry:
    backgroundColor: "{colors.muted-paper}"
    textColor: "{colors.charcoal-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: LLM Benchmark Studio

## Overview

**Creative North Star: "Monografía Científica JCR & Psicometría"**

LLM Benchmark Studio is designed as an interactive psychometric monograph and experimental apparatus inspired by *Nature Methods* and Edward Tufte. Rather than treating multi-model evaluation as a dark-SaaS analytics toy with glowing neon cards, the interface reads like an authoritative scientific publication where every aggregate claim—Cohen's $\kappa$, Krippendorff's $\alpha$, $\text{ICC}(2,1)$, and 3-level Verbatim Faithfulness—is transparent, traceable to its mathematical formula, and auditable down to the exact row and corpus quote.

High information density is achieved through typographic hierarchy and horizontal rule discipline rather than decorative chrome. Surfaces sit flat on warm archival paper in light mode (the default) and nocturnal archival slate in dark mode. Double-ruled mastheads, Roman numeral section indices (`I.`, `II.`, `III.`, `IV.`), tripartite booktabs tables, and tabular monospace matrices keep complex $N \times N$ inter-rater comparisons and row-level forensic audits effortlessly scannable during long research sessions.

**Key Characteristics:**
- Archival warm paper ground paired with deep charcoal ink, scholarly JCR crimson accents, and Prussian academic slate telemetry provenance labels.
- Tripartite booktabs structural geometry (`2px` top/bottom ink rules, `1px` crisp stone hairlines) replacing heavy box shadows, floating cards, and glassmorphic blur.
- Editorial serif headings (`Source Serif 4`) with Roman numeral indexing (`I.`, `II.`, `III.`, `IV.`, `Registro I.`) paired with dense functional copy (`Source Sans 3`) and tabular monospace (`JetBrains Mono`) for metrics, formulas, and verbatim corpus quotes.
- Full methodological transparency ("zero black box") exposing KaTeX equations, variable legends, evaluated field chips, and row-by-row discrepancy inspection.

## Colors

The palette balances warm archival paper neutrals with a restrained scholarly crimson primary accent and Prussian academic slate for analytical metadata and provenance sub-labels.

### Primary
- **Scholarly JCR Crimson** (`hsl(354 62% 30%)`): Primary action buttons, active Roman-numeral navigation tabs, rank `#1` leaderboard insignias, and Pillar IV / Q1 significance top rules in light mode.
- **Illuminated Crimson** (`hsl(354 56% 52%)`): Dark-mode counterpart for primary interactive controls and active section markers, calibrated for legibility against nocturnal slate.

### Secondary
- **Archival Warm Stone** (`hsl(39 27% 90%)`): Executive abstract callout surface (`bg-secondary/60`), secondary control fills, and subtle recessed containers.
- **Prussian Academic Slate** (`hsl(214 52% 25%)`): Accent foreground for mathematical formulas, KPI provenance sub-labels (`Registro PostgreSQL`, `Inferencia SSE activa`, `Auditables JCR Q1/Q2`), and model telemetry highlights in light mode.
- **Nocturnal Prussian Slate** (`hsl(213 50% 66%)`): Dark-mode counterpart for KPI telemetry provenance captions and mathematical metadata.

### Tertiary
- **Alert Vermilion** (`hsl(8 74% 42%)`): Destructive actions, failed experiment badges, and logical contradiction or hallucination warnings in row-level audits.

### Neutral
- **Archival Monograph Cream** (`hsl(36 33% 97%)`): Default light-mode page canvas, reducing glare during extended qualitative corpus reading.
- **Warm Vellum Card** (`hsl(38 38% 98.5%)`): Elevated editorial panels, booktabs experiment ledgers, data tables, and synthesis banners.
- **Muted Paper** (`hsl(38 24% 92%)`): Table headers, row hover states (`hover:bg-muted/35`), and code/prompt disclosure wells.
- **Deep Charcoal Ink** (`hsl(60 3% 8%)`): Primary typography and heavy `2px` booktabs structural rules.
- **Editorial Slate-Brown** (`hsl(36 9% 35%)`): Secondary descriptions, captions, and inactive tab labels.
- **Crisp Booktabs Rule** (`hsl(39 18% 80%)`): `1px` structural hairlines, table cell dividers (`divide-y divide-border`), and input borders.
- **Nocturnal Archival Folio & Card** (`hsl(225 10% 8%)` / `hsl(225 10% 10.5%)`): Dark-mode canvas and surface containers paired with **Warm Parchment** (`hsl(38 22% 92%)`) text.

### Named Rules
**The Crimson Significance Rule.** Scholarly JCR Crimson is reserved exclusively for the primary interactive decision on a surface, active section state, section ledger prefixes (`Registro I.`), or the final publication-ready KPI column (such as Pillar IV Convergence or Completed Auditables). Never dilute it across decorative backgrounds or non-actionable badges.

**The Archival Paper Default Rule.** Light mode on warm archival cream is the canonical presentation of the workbench; dark mode shifts to nocturnal slate with warm parchment text while preserving identical booktabs rule contrast.

## Typography

**Display & Editorial Font:** `Source Serif 4` (with `Georgia, Cambria, serif` fallback)
**Body & UI Control Font:** `Source Sans 3` (with `-apple-system, BlinkMacSystemFont, sans-serif` fallback; note that while early direction notes mentioned `Inter`, the shipped build standardizes on `Source Sans 3` with `"cv02", "cv03", "cv04", "cv11"` to harmonize with `Source Serif 4`)
**Label & Quantitative Mono Font:** `JetBrains Mono` (with `ui-monospace, SFMono-Regular, monospace` fallback and mandatory `font-variant-numeric: tabular-nums`)

**Character:** The pairing evokes a peer-reviewed psychometric journal equipped with live computational telemetry: authoritative serif headings establish editorial structure, humanist sans-serif keeps dense controls compact, and tabular monospace guarantees vertical decimal alignment across statistical columns.

### Hierarchy
- **Display KPIs** (`700` weight, `1.875rem` / `30px`, `1.15` line-height, `-0.015em` tracking): Top-ruled monograph summary figures (`tabular-nums`) in the experiment dashboard.
- **Headline** (`700` weight, `1.5rem` / `24px`, `1.25` line-height, `-0.015em` tracking): Primary surface titles (`ExperimentDashboard`, `Protocolo de Validación Psicométrica`).
- **Title** (`700` weight, `1rem` / `16px` to `1.25rem` / `20px`, `1.35` line-height): Masthead brand title, section ledger headers (`Registro I. Catálogo de Experimentos y Evaluaciones Persistidas`), Rank `#1` model synthesis header, and individual experiment ledger titles.
- **Body** (`400`–`600` weight, `0.75rem` / `12px`, `1.5` line-height, max `65–75ch` on abstracts): Functional UI copy, methodology descriptions, and control labels.
- **Label & Telemetry Mono** (`500`–`700` weight, `0.625rem` / `10px` to `0.6875rem` / `11px`, `tabular-nums`): Roman numeral prefixes (`I.`, `II.`, `III.`), Prussian slate KPI provenance captions, sample counts (`N = 250`), task identifiers (`aspect_polarity`), prompt templates, and statistical cells.

### Named Rules
**The Tabular Numerals Mandate.** Every numeric cell, sample size (`N = ...`), correlation coefficient, percentage, and badge counter must enforce `font-variant-numeric: tabular-nums` so decimals and columns align vertically across rows.

**The Roman Numeral Indexing Rule.** Top-level navigation modes, KPI figures, experiment registries (`Registro I.`), and the four validation pillars are indexed with Roman numerals (`I.`, `II.`, `III.`, `IV.`) in monospace or serif to reinforce the structure of a multi-part scientific monograph.

## Layout

The workbench uses a centered `1280px` (`max-w-7xl`) container with `16px` (`px-4`) mobile and `24px` (`sm:px-6`) desktop horizontal padding, structured vertically as a full-height flex column (`min-h-screen flex flex-col`):

1. **Sticky Double-Ruled Masthead (`min-h-16`):** Anchors brand identity (`Ψ LLM Benchmark Studio · JCR Monograph v2.4`), live dataset telemetry (`N = ...`), the 3-mode Roman-numeral switcher (`I. Experimentos`, `II. Configurar Benchmark`, `III. Resultados & Matriz`), and session utilities (SSE status, Saved Runs, User badge, Language, Theme, Logout). When in `wizard` or `results` mode, a secondary `1px`-bordered sub-bar attaches directly beneath the masthead for the 4-step sequential stepper or the 3-view results switcher (`Leaderboard`, `Matriz 1 vs 1`, `4 Pilares Metodológicos`).
2. **Asymmetric 12-Column Executive Abstract & KPI Strip:** The main dashboard opens with a `12`-column grid (`grid-cols-1 lg:grid-cols-12 gap-6 pb-6 border-b-2 border-foreground/85`). Columns `1–5` house the square-cornered warm stone executive abstract (`rounded-none bg-secondary/60 border border-border ring-1 ring-inset ring-primary/25`) and primary CTA (`Crear Experimento`); columns `6–12` house a 4-column booktabs KPI strip (`grid-cols-2 sm:grid-cols-4 gap-5`) where each metric is anchored by a `2px` top rule (`border-t-2 border-foreground`, with the fourth column highlighted in `border-primary`) and a Prussian Academic Slate provenance caption.
3. **Continuous Booktabs Ledger & Matrix Stack:** Below the filter bar, experiments are presented under `Registro I.` inside a single continuous tripartite booktabs ledger (`border-t-2 border-b-2 border-foreground divide-y divide-border bg-card border-x border-x-border`) rather than separate floating cards, maximizing horizontal room for metadata chips, progress bars, and wide statistical tables.

## Elevation & Depth

This design system is **flat by default** and rejects decorative drop shadows, floating neon glows, and multi-layered glassmorphic blur in favor of print-inspired ink rules and tonal paper contrast. Depth is communicated structurally through line weight (`1px` stone hairlines vs. `1.5px` and `2px` charcoal booktabs rules) and subtle surface shifts between Archival Monograph Cream (`--background`), Warm Vellum (`--card`), Archival Warm Stone (`--secondary`), and Muted Paper (`--muted`).

### Shadow Vocabulary
- **Subtle Seal Insignia** (`box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05)`): Used sparingly on the `Ψ` crimson monograph seal in the masthead.
- **Zero-Shadow Panels** (`shadow-none`): Ledger tables, experiment rows, synthesis banners, wizard steppers, and KPI strips explicitly suppress box shadows, relying on `border-border`, `divide-y divide-border`, and `hover:bg-muted/35` to signal interactivity.

### Named Rules
**The Booktabs Over Box-Shadow Rule.** Major synthesis banners, experiment registries, leaderboards, and KPI figures establish hierarchy with `2px` solid top and bottom rules (`border-t-2 border-b-2 border-foreground`) rather than drop shadows or blurred glass backplates.

## Shapes

The form language is crisp, architectural, and rectangular, echoing typeset journal tables and laboratory instruments:
- **Sharp Rectangular Synthesis & Registry Containers (`0px` / `rounded-none`):** Full-width monograph synthesis headers (such as the Dashboard Executive Abstract, the `Registro I.` experiment ledger, the Rank `#1` Leaderboard banner, and the 4-Pillar Protocol Header) use square corners (`rounded-none`) bounded by `2px` top and bottom foreground rules or `1px` inset crimson rings.
- **Micro-Radius Controls (`2px` / `rounded-sm` and `4px` / `rounded-md`):** Navigation tabs, primary buttons, filter pills, wizard step buttons, results view switchers, and metadata badges use tight `2px` (`rounded-sm`) to `4px` (`rounded-md`) corners.
- **Tripartite Rule Geometry:** Heavy top rules (`border-t-[3px] border-t-foreground` on the masthead; `border-t-2 border-foreground` on KPIs, ledgers, and tables) paired with `1px` internal hairlines (`border-border` / `divide-border`) create immediate visual order without enclosing every datum in a separate rounded card.

## Components

### Buttons
Tactile, compact, and rectangular with instant color-shift feedback (`transition-colors`, `140ms–150ms`).
- **Shape:** Tight `2px` (`rounded-sm`) radius on primary workbench actions, wizard navigation buttons (`h-9` / `36px` to `h-10` / `40px`), and toolbar controls (`h-8` / `32px`).
- **Primary:** Scholarly JCR Crimson background (`bg-primary`) with warm cream text (`text-primary-foreground`), `12px` (`text-xs`) semibold/bold sans-serif copy, and `16px–20px` horizontal padding (`px-4` to `px-5`).
- **Hover / Focus:** Shifts to `bg-primary/90` on hover; keyboard focus displays a `2px` crimson ring (`focus-visible:ring-2 focus-visible:ring-ring`).
- **Outline / Secondary:** Warm Vellum (`bg-card`) or Archival Warm Stone (`bg-secondary`), `1px` stone border (`border-border`), charcoal ink text, shifting to `bg-muted` on hover.

### Chips & Telemetry Badges
Compact monospace identifiers used for model names, execution modes (`Paralelo` / `Secuencial`), task types (`aspect_polarity`), and human baseline markers.
- **Style:** `2px` radius (`rounded-sm`), `10px`–`11px` `JetBrains Mono` (`font-mono`), `2px 8px` padding (`py-0.5 px-2`), `1px` solid border.
- **State:** Default model chips use `bg-muted/50 text-foreground border-border`; Human Expert baseline chips use emerald tinting (`bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-600/30`); Rank `#1` and SSE streaming badges use crimson tinting (`bg-primary/10 text-primary border-primary/40`).

### Cards / Containers
- **Monograph Synthesis Banner:** `rounded-none`, `bg-card`, `border-t-2 border-b-2 border-foreground`, `border-x border-border`, `24px` (`p-6`) internal padding, `shadow-none`.
- **Booktabs Experiment Ledger (`Registro I.`):** Continuous `rounded-none` table-like container (`border-t-2 border-b-2 border-foreground divide-y divide-border bg-card border-x border-x-border`) where each experiment row sits at `16px` (`p-4`) padding and highlights with `hover:bg-muted/35`.
- **Executive Abstract Callout:** `rounded-none`, `bg-secondary/60`, `1px` solid `border-border` with `ring-1 ring-inset ring-primary/25`, `20px` (`p-5`) padding.

### Inputs / Fields
- **Style:** `1px` solid `hsl(var(--input))` on `bg-background` or `bg-card`, `4px` radius, `12px` (`text-xs`) sans-serif or monospace for prompt editors and field selectors.
- **Focus:** `2px` ring in Scholarly JCR Crimson (`--ring`).

### Navigation
- **Masthead Roman Section Switcher:** Bordered container (`border border-border bg-card/80 p-1 rounded-sm`) housing three Roman-indexed serif buttons (`I. Experimentos`, `II. Configurar Benchmark`, `III. Resultados & Matriz`). Active state fills with `bg-primary text-primary-foreground font-bold`; inactive tabs use `text-foreground/80 hover:bg-muted/60`; locked steps dim to `opacity-40 cursor-not-allowed`.
- **Sequential 4-Step Wizard Bar & Results Switcher:** Attached sub-header (`border-t border-border bg-card/60 py-2`) with compact rectangular buttons (`rounded-md` / `rounded-sm`, `border-border`), numbered monospace badges (`1`–`4`), lock icons (`Lock`) on unvalidated future steps, checkmarks (`CheckCircle2`) on completed steps, and flat crimson or card fills without drop shadows.

### Booktabs KPI & Synthesis Strip (Signature Component)
A 4-column horizontal metric array used in the Dashboard and Leaderboard headers. Each cell omits side and bottom borders, anchoring the eye with a `2px` solid top rule (`border-t-2 border-foreground`, or `border-t-2 border-primary` for the culminating Q1/audit column), a small Roman-indexed serif label (`font-serif text-xs font-semibold text-muted-foreground`), a large serif tabular numeral (`font-serif text-3xl font-bold tabular-nums`), and a Prussian Academic Slate monospace provenance caption (`text-[11px] font-mono text-[#1E3A5F] dark:text-[#7BA3D4] font-medium`).

## Do's and Don'ts

### Do:
- **Do** frame major synthesis headers, KPI strips, experiment registries (`Registro I.`), and comparative tables with `2px` solid charcoal top/bottom rules (`border-t-2 border-foreground`) and `1px` stone hairlines (`border-border` / `divide-border`).
- **Do** use `Source Serif 4` (`font-serif`) with Roman numeral prefixes (`I.`, `II.`, `III.`, `IV.`) for section navigation, pillar headings, registry titles, and top-level KPI figures.
- **Do** apply `JetBrains Mono` with `tabular-nums` (`font-mono`) to all statistical metrics, Prussian Academic Slate provenance sub-labels, sample sizes (`N = ...`), model IDs, prompt templates, and verbatim quotes.
- **Do** keep surfaces flat (`shadow-none`) and rectangular (`rounded-none` on synthesis banners, executive abstracts, and experiment ledgers; `rounded-sm` / `2px` on interactive controls).
- **Do** expose the mathematical formula, evaluated fields, and row-level audit trigger (`Eye` inspection button) beside every aggregate psychometric metric.

### Don't:
- **Don't** use glassmorphic blur panels (`backdrop-blur-xl`), glowing drop shadows (`shadow-lg shadow-primary/20`), or hover scale transforms (`hover:scale-[1.02]`) on cards or buttons.
- **Don't** use large pill or card border radii (`rounded-xl`, `rounded-2xl`) on containers, wizard steppers, buttons, or tables.
- **Don't** introduce off-palette neon accents (such as purple or emerald gradient CTA pills) where Scholarly JCR Crimson (`--primary`) or Prussian Academic Slate (`--accent-foreground`) belongs.
- **Don't** render numerical columns or correlation matrices in proportional sans-serif figures without `tabular-nums`.
