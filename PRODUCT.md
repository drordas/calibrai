# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Investigadores cualitativos, científicos de datos y analistas de IA que diseñan y auditan experimentos comparativos de LLMs (locales vía Ollama y cloud vía OpenAI, Gemini, Anthropic) frente a anotadores expertos humanos (*Ground Truth*) con rigor de publicación académica (JCR Q1/Q2).

## Product Purpose
Permite ejecutar, monitorizar en tiempo real, recalcular y auditar experimentos de etiquetado cualitativo multidimensional (como las dimensiones de Brand Equity de David Aaker), clasificación y cálculo numérico, contrastando las respuestas de múltiples modelos entre sí y contra jueces humanos.

## Positioning
Motor polimórfico de validación psicométrica y estadística en 4 pilares independientes (Pilar 1: Consistencia Interna, Fidelidad Verbatim en 3 niveles con detección de correcciones ortográficas y Disyunción Pos ∩ Neg = ∅; Pilar 2: Fiabilidad Inter-Jueces con Cohen's κ, Krippendorff's α y Ratio respecto a Línea Base Humana; Pilar 3: Recuento Cuantitativo de Evidencias ICC(2,1); Pilar 4: Validez Convergente Externa de Spearman) con auditoría fila a fila sin caja negra y recálculo en caliente sin re-inferencia.

## Operating Context
Estación de trabajo científica multi-idioma (`es`, `uk`, `usa`) utilizada en sesiones intensivas de análisis de corpus (CSV, Parquet, JSONL), ingeniería de prompts estructurados, ejecución de colas de inferencia con telemetría SSE y auditoría forense de discrepancias y alucinaciones.

## Capabilities and Constraints
- Flujo completo dividido en tres modos principales: Dashboard de Experimentos (con KPIs y monitorización SSE), Wizard secuencial de 4 pasos (1. Dataset & Ground Truth, 2. Editor de Prompts & Specs Calculadas, 3. Selección de Modelos & Hardware Sizing, 4. Lanzamiento & Configuración de Baterías Metodológicas) y Vista de Resultados (Tabla Clasificatoria / Leaderboard con prompt desplegable, Matriz 1 vs 1 y 4 Pilares Metodológicos con modal de Auditoría e Inspección fila a fila).
- Persistencia en PostgreSQL 16 y motor analítico DuckDB 1.1 + FastAPI.
- Restricción estricta de rediseño: mantener intactos todos los componentes, lógica, props, estados, endpoints y textos funcionales existentes en `frontend/src`.

## Brand Commitments
- Nombre del producto: **CalibrAI**.
- Transparencia metodológica ("cero caja negra"): cada métrica expone su fórmula matemática (KaTeX), variables, interpretación, campos evaluados y citas textuales.

## Evidence on Hand
- Datasets reales de reseñas anotadas por expertos humanos (`dataset/uk_usa_adrian.json`, `dataset/uk_usa_sandra.json`, `dataset/extracted_target_reviews.csv`).
- Especificación metodológica formal en `docs/ValidationMethodology.md` y catálogo de métricas científicas en `frontend/src/data/metricCatalog.ts`.

## Product Principles
1. **Rigor metodológico auditable:** Toda cifra agregada (Kappa, Alfa, ICC, Fidelidad Verbatim) debe poder inspeccionarse hasta la fila exacta y el fragmento literal del corpus.
2. **Densidad informativa legible:** Priorizar la lectura clara de tablas comparativas, matrices $N \times N$ y fragmentos de texto en código/monoespaciado sin ruido decorativo que distraiga del análisis.
3. **Iteración sin fricción:** Permitir ajustar el marco metodológico (activar/desactivar pilares, cambiar rigor verbatim o campos evaluados) y recalcular al instante sobre inferencias ya persistidas.
