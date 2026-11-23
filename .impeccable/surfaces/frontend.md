---
version: 1
slug: "frontend"
primary_target: "frontend"
related_targets: []
---

# Surface Brief: Frontend (LLM Benchmark Studio)

## Scope & Mode
- **Target:** `frontend` (`frontend/src/App.tsx` and all views/components)
- **Visitor Mode:** `operate`

## Audience & Task
- **Audience:** Qualitative researchers, data scientists, and AI analysts conducting JCR Q1/Q2 psychometric LLM benchmarks against human ground truth.
- **Task:** Configure datasets and prompts, launch and monitor multi-model experiments, inspect 4-pillar statistical validation metrics, recalibrate methodology in real time, and audit row-level verbatim quotes, typo corrections, and inter-rater discrepancies.
- **Constraints:** Preserve 100% of existing component logic, props, state, API calls, and functional copy across `frontend/src`. Support both light (default archival monograph paper) and dark (nocturnal archival slate) modes cleanly.

## Direction contract

THESIS: This surface is an interactive psychometric monograph and experimental apparatus (inspired by Nature Methods and Edward Tufte), refusing the generic dark-SaaS glowing-card dashboard template in favor of high-density typographic authority, booktabs tripartite tables, and exposed mathematical rigor.

OWN-WORLD: Archival warm paper ground (`#FAF8F5` in light mode, `#121316` in dark mode), deep charcoal ink (`#141413`), scholarly crimson accent (`#7C1D26` / `#C83E4B`) for primary actions and Q1 significance markers, Prussian slate (`#1E3A5F` / `#5B82B5`) for mathematical formulas and model telemetry, and crisp horizontal hairlines (`#D8D3C8`) with booktabs double-rules (`border-t-2 border-b-2 border-foreground`) instead of rounded glassmorphic boxes. Typography pairs `Source Serif 4` for editorial headings, pillar titles, and figure/table captions with `Inter` for dense UI controls and `JetBrains Mono` (`tabular-nums`) for statistical matrices, prompts, and verbatim corpus quotes.

STORY: The researcher immediately perceives an authoritative scientific workbench where every statistical claim (Cohen's Kappa, Krippendorff's Alpha, ICC 2,1, Verbatim Faithfulness) is transparent, traceable to its LaTeX formula and verbatim row evidence, and ready to be configured, executed, or recalibrated for publication.

FIRST VIEWPORT: A double-ruled monograph masthead (`LLM Benchmark Studio`) with active dataset telemetry, segmented mode navigation (`Experimentos`, `Configurar Benchmark`, `Resultados & Matriz`), and utility controls (Saved Runs, Language, Theme, User). Below it, the primary workbench opens with a left-bordered Crimson Executive Abstract / Command Header and a 4-column booktabs KPI strip with Roman/tabular figures, leading directly into the experiment ledger or comparative model table where the primary action (`Crear Experimento` or `4 Pilares Metodológicos`) sits anchored at high contrast.

FORM: Monografía Científica JCR & Psicometría (Nature / Tufte), candidate 1 on the ordered grounded list, `seed:769e6b7596093cb6`.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
