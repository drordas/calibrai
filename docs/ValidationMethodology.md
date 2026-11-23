# Metodología de Validación Científica de Anotaciones Cualitativas de LLMs

> **Documento de referencia técnica y metodológica**  
> Basado en la arquitectura del *Brand Equity Validation Toolkit* ([aaker.drordas.info](http://aaker.drordas.info)), implementado en `/mnt/Research/marketing/brand_equity/methodology/`.

---

## 1. Introducción y Contexto

El objetivo principal de esta metodología es validar de forma rigurosa y reproducible si las **anotaciones cualitativas generadas por modelos de lenguaje (LLMs)** son fiables, consistentes y científicamente válidas en comparación con **expertos humanos**, alcanzando los estándares requeridos para publicaciones científicas de alto impacto (JCR Q1/Q2).

El caso de estudio canónico codifica reseñas de clientes (Trustpilot, corpus *Agriculture & Produce* de Reino Unido y EE. UU.) bajo las cuatro dimensiones de valor de marca del marco de **David Aaker**:
1. **Brand Awareness** (Reconocimiento y notoriedad de marca).
2. **Brand Associations** (Atributos, valores y percepciones vinculadas).
3. **Perceived Quality** (Calidad percibida y fiabilidad de producto/servicio).
4. **Brand Loyalty** (Fidelidad, retención e intención de recomendación/recompra).

Cada dimensión comprende dos tipos de salidas por parte del anotador:
* **Menciones cuantitativas y citas *verbatim***: Número de fragmentos textuales idénticos (`{dim}_n_mentions`, `{dim}_n_positive`, `{dim}_n_negative`, `{dim}_n_neutral`, `{dim}_markers_*`).
* **Sentimiento o polaridad asignada**: `Positive`, `Negative`, `Neutral`, `Mixed` (o inactiva / `blank`).

---

## 2. Flujo Metodológico Global

El pipeline consta de tres fases secuenciales:

```
Full Dataset (XLSX / CSV)
       │
       ▼
1. Preparación de Datos (`prepare_validation_input.py`)
       │  — Filtrado y reducción de columnas pesadas para carga ágil.
       ▼
2. Muestreo Estratificado Reproducible (`sampling_validation.py`)
       │  — Muestra en 2 fases con semilla fija publicada (seed=42).
       │  — Generación de plantilla de anotación ciega para expertos.
       ▼
3. Toolkit de Anotación y Métricas (`app/`)
       │  — Anotación a ciegas por parte de expertos (sin ver la salida del LLM).
       │  — Evaluación en 4 pestañas de validación estadística.
```

---

## 3. Muestreo Estratificado en Dos Fases (`sampling_validation.py`)

No es metodológicamente viable ni eficiente que expertos humanos anoten cientos de miles de reseñas. Para garantizar representatividad estadística sin sesgo:

* **Reproducibilidad estricta**: Se fija `RANDOM_SEED = 42`, publicando los checksums SHA-256 de las muestras en la memoria metodológica:
  * **Corpus USA**: `5c75f47e77633ec2b3857cd7724a73da052cd8d7b184afbdd6eb51f4360c0c21`
  * **Corpus UK**: `8e3d6b49a98009b9c32c6ce01e86588d946ba3e47efa985e5dafd9876988c88a`

### Etapas del muestreo
1. **Criterios de exclusión (E1–E4)**: Filtrado de errores de inferencia del LLM (`llm_error`), reseñas vacías o registros donde no se activó ninguna dimensión.
2. **Fase 1 (Representatividad estructural)**: Muestreo estratificado por tamaño de empresa (Pequeña, Mediana, Grande según volumen de reseñas) cruzado con el rango de valoración en estrellas (1★ a 5★). Aplica techos máximos de reseñas por empresa para evitar sobrerrepresentación.
3. **Fase 2 (Garantía de cuotas por rareza)**: Muestreo sin reemplazo para cubrir cuotas mínimas por celda (*dimensión $\times$ sentimiento*). Incorpora un **bono de rareza** (*rarity bonus*) para sobredimensionar combinaciones poco frecuentes en el corpus (por ejemplo, *Brand Awareness* con sentimiento negativo o *Brand Loyalty* mixto).
4. **Plantilla para anotación a ciegas**: Exportación de la muestra en formato Excel/JSON donde los campos del LLM están completamente ocultos para el revisor humano.

---

## 4. Los Cuatro Pilares de Validación Estadística

Una vez completadas las anotaciones a ciegas de los expertos humanos, la aplicación ejecuta la batería de validación estructurada en cuatro módulos independientes:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        EVALUACIÓN DE ANOTACIONES                       │
├───────────────────┬───────────────────┬──────────────────┬─────────────┤
│ 1. Consistencia   │ 2. Acuerdo        │ 3. Recuento de   │ 4. Validez  │
│    Interna        │    Inter-Anotador │    Fragmentos    │ Convergente │
│  (Fragmentos      │  (Activación F1   │    (ICC 2,1      │   (Rating   │
│   no solapados)   │   y Polaridad)    │    absoluto)     │  Congruence)│
└───────────────────┴───────────────────┴──────────────────┴─────────────┘
```

---

### Pilar 1: Consistencia Interna y Ausencia de Auto-contradicción

* **Objetivo**: Evaluar si un mismo anotador (sea el LLM o un experto humano) se contradice a sí mismo dentro de la misma reseña. Es una condición de coherencia interna previa: si un anotador no es internamente coherente, su acuerdo con otros anotadores carece de validez.
* **Mecanismo de detección**:
  Se analizan las listas de fragmentos de texto exactos (*verbatim quotes*) extraídos para cada polaridad: `{dim}_markers_positive`, `{dim}_markers_negative`, `{dim}_markers_neutral`.
* **Regla de conjuntos disjuntos**:
  $$\text{Positivo} \cap \text{Negativo} = \emptyset, \quad \text{Positivo} \cap \text{Neutro} = \emptyset, \quad \text{Negativo} \cap \text{Neutro} = \emptyset$$
  Si una misma frase (o una subcadena contenida en otra) aparece en dos listas de polaridad opuestas para la misma dimensión, se contabiliza como contradicción.
* **Cálculo**:
  $$\% \text{ Inconsistencias} = \frac{\text{Reseñas con solapamientos}}{\text{Total reseñas con la dimensión activa}} \times 100$$
  $$\text{Consistencia Interna} = 100\% - \% \text{ Inconsistencias}$$
* **Interpretación psicométrica**:
  * $\ge 95\%$: Alta consistencia.
  * $80\% - 94\%$: Consistencia aceptable.
  * $< 80\%$: Consistencia pobre (alerta metodológica que compromete el uso del anotador).
* **Fiabilidad Test-Retest (Acuerdo Intra-Anotador)**: Cuando un mismo experto realiza un segundo intento independiente sobre el mismo lote de reseñas, se mide el porcentaje de concordancia directa entre sus propios intentos.

---

### Pilar 2: Acuerdo Inter-Anotador (*Inter-Rater Reliability / Agreement*)

Compara el grado de convergencia entre el LLM y cada experto humano, así como el acuerdo de los expertos entre sí (**Línea Base Humana** o *Human Baseline*). Se evalúa en dos niveles:

#### Nivel A: Detección y Activación de la Dimensión
* **Pregunta**: ¿Coinciden en si la dimensión está presente o no en el texto (`n_mentions > 0`)?
* **Métricas**: Matriz de confusión binaria (Verdaderos Positivos, Falsos Positivos, Falsos Negativos, Verdaderos Negativos), **Precisión**, **Recall** y **F1-Score**.
* **Bandas de corte**:
  * $F1 \ge 0.80$: Buen rendimiento (Verde).
  * $0.70 \le F1 < 0.80$: Rendimiento moderado (Ámbar).
  * $F1 < 0.70$: Insuficiente (Rojo).

#### Nivel B: Clasificación de Polaridad / Sentimiento
* **Pregunta**: Para las reseñas donde **ambos** anotadores activaron la dimensión, ¿coinciden en la polaridad asignada?
* **Selección automática de la métrica** (`metric_selection.py`):
  La herramienta no fuerza una métrica arbitraria; selecciona el estimador estadístico según las propiedades de la escala observada:

| Categorías observadas en la dimensión | Métrica seleccionada | Justificación matemática |
| :--- | :--- | :--- |
| **2 categorías** (ej. solo Positivo / Negativo) | **Kappa de Cohen ($\kappa$)** | Estándar para acuerdo binario. Descuenta el acuerdo esperado por mero azar: $\kappa = \frac{p_o - p_e}{1 - p_e}$. |
| **3 categorías ordenadas** ({Positivo, Neutro, Negativo}) | **Alfa de Krippendorff Ordinal ($\alpha_{\text{ord}}$)** | Utiliza una función de distancia métrica cuadrática. Penaliza los desacuerdos proporcionalmente a la distancia (discrepar entre Positivo y Negativo penaliza mucho más que entre Positivo y Neutro). |
| **Presencia de categoría "Mixed" o $>3$ categorías** | **Alfa de Krippendorff Nominal ($\alpha_{\text{nom}}$)** | Trata todos los desacuerdos cualitativos como equivalentes al no existir un orden lineal unívoco. |

#### Nivel C: Evaluación frente a la Línea Base Humana
* **Con un solo experto**: La comparación LLM vs Experto se interpreta como una **cota inferior**, advirtiendo de que no es posible discernir si un desacuerdo se debe a un error del LLM o a una interpretación idiosincrásica del anotador humano.
* **Con $\ge 2$ expertos humanos**:
  1. Se calcula primero el acuerdo inter-humano medio ($Y = \text{Human Baseline}$).
  2. Si la línea base humana es deficiente ($Y < 0.67$), el experimento se declara **Inconcluso**: indica que el corpus o la guía de codificación presentan ambigüedad inherente que ni los humanos resuelven consistentemente.
  3. Si la base humana es sólida, se calcula el ratio relativo $\text{Ratio} = \frac{X (\text{LLM vs Humanos})}{Y (\text{Humanos vs Humanos})}$:
     * $\ge 0.95$: **Fuerte** (acuerdo equivalente al humano, apto para publicación Q1/Q2).
     * $\ge 0.80$: **Aceptable** (Q2, requiere refinamiento de prompt para Q1).
     * $< 0.67$: **Insuficiente**.

---

### Pilar 3: Acuerdo en Recuento de Fragmentos (*Polarity Count Agreement*)

* **Objetivo**: Superar la limitación de evaluar únicamente la etiqueta agregada. Dos anotadores pueden clasificar una reseña como "Mixed", pero uno haber identificado 3 fragmentos negativos y el otro solo 1. Este pilar evalúa la concordancia a nivel de conteo cuantitativo de citas por polaridad.
* **Estadístico: Coeficiente de Correlación Intraclase ICC(2,1) / ICC(A,1)**:
  Los conteos son variables numéricas discretas ($0, 1, 2, \dots$), por lo que no aplican Kappa ni Alfa. Se emplea el modelo formalizado por Shrout & Fleiss (1979) y McGraw & Wong (1996), calculado en Python con la biblioteca científica `pingouin` (`pg.intraclass_corr`):
  * **Modelo de dos vías aleatorio (*Two-way random*, "2")**: Considera tanto a las reseñas analizadas como a los anotadores como muestras aleatorias extraídas de poblaciones más amplias, permitiendo generalizar las conclusiones.
  * **Acuerdo Absoluto (*Absolute Agreement*, "A")**: A diferencia de la correlación de consistencia (o Pearson), penaliza discrepancias sistemáticas de nivel. Si un anotador cuenta sistemáticamente un fragmento más que el otro en cada reseña, Pearson daría $r=1.0$, pero el ICC con acuerdo absoluto lo penaliza severamente como falta de concordancia.
  * **Medición simple (*Single measurement*, "1")**: La unidad de análisis es la puntuación de un único evaluador por caso, no la media compuesta.
* **Protocolo de cálculo**:
  * Se computan tres ICC independientes por dimensión: positivo, negativo y neutro.
  * **Umbral de suficiencia muestral**: Requiere $n \ge 10$ casos elegibles. Por debajo de 10, la incertidumbre estadística es excesiva y el ICC no se computa.
  * **Casos con varianza nula**: Si todos los conteos de ambos anotadores son idénticos, se reporta $ICC = 1.0$ analítico (evitando divisiones por cero en el cálculo de varianzas).
  * **Intervalos de Confianza**: Se calcula el intervalo al 95% ($CI_{95}$) para reportar el margen de error del estimador.
* **Umbrales psicométricos (Koo & Li, 2016)**:
  * $< 0.50$: Pobre.
  * $0.50 - 0.74$: Moderado.
  * $0.75 - 0.89$: Bueno.
  * $\ge 0.90$: Excelente.

---

### Pilar 4: Validez Convergente Externa (*Rating Congruence*)

* **Objetivo**: Demostrar que las anotaciones cualitativas del LLM capturan con fidelidad la experiencia real del consumidor contrastándolas con una señal externa objetiva: **la valoración en estrellas otorgada por el usuario en su reseña** (`review_rating`, escala discreta ordinal de 1 a 5 estrellas).
* **Aclaración metodológica**: No constituye una relación causal (tanto el texto como las estrellas proceden del mismo usuario), sino una prueba de **validez convergente de constructo**.

#### Componente 1: Análisis Descriptivo
Por cada dimensión de marca, calcula la distribución porcentual de sentimiento en cada estrato de estrellas (1★ a 5★):
* **Fidelidad semántica**: En 1★ y 2★ el sentimiento negativo debe ser dominante; en 4★ y 5★ debe predominar el sentimiento positivo.
* **Diferenciación de dimensiones**: Permite identificar si ciertas dimensiones solo emergen en situaciones de insatisfacción crítica (ej. problemas de atención al cliente) o si son conductores de satisfacción excelente.

#### Componente 2: Modelo Econométrico / Regresión Logística Ordinal
Para cuantificar formalmente la fuerza de asociación, se ajusta un modelo de regresión logística ordinal (`OrderedModel` de `statsmodels`):
$$\text{Estrellas} \sim \beta_1 NSS_{\text{Awareness}} + \beta_2 NSS_{\text{Associations}} + \beta_3 NSS_{\text{Quality}} + \beta_4 NSS_{\text{Loyalty}}$$

Donde el predictor continuo de cada dimensión es el **Net Sentiment Score (NSS)**:
$$NSS = \frac{n_{\text{positivo}} - n_{\text{negativo}}}{n_{\text{positivo}} + n_{\text{negativo}}}$$
*(Los fragmentos neutros se excluyen del denominador para no diluir la señal neta de polaridad; si no hay menciones polares, $NSS = 0$).*

* **Resultados reportados**:
  * Coeficientes de regresión ($\beta$).
  * Errores estándar ($SE$).
  * Niveles de significación estadística ($p$-valores con códigos de estrellas: $^{***} p < 0.001$, $^{**} p < 0.01$, $^{*} p < 0.05$).
  * *Odds Ratios* ($\exp(\beta)$).
* **Interpretación**: Un coeficiente positivo y estadísticamente significativo demuestra que un incremento en el saldo cualitativo positivo de esa dimensión multiplica las probabilidades de que la reseña pertenezca a categorías de estrellas más altas.

---

## 5. Auditoría Fina y Gestión de Discrepancias

Para cerrar el ciclo metodológico, la herramienta proporciona dos utilidades de análisis cualitativo profundo:

1. **Exportación de Discrepancias (`.csv`)**:
   Genera una tabla detallada con todas las reseñas donde el LLM y el experto discreparon en cualquiera de los tres niveles:
   * Diferencia en número de menciones (`n_mentions`).
   * Diferencia en la categoría de polaridad asignada.
   * Discrepancia en las citas textuales extraídas (incluso si coincidieron en la etiqueta agregada, detecta si subrayaron frases distintas).
2. **Visor Interactivo en Dos Paneles (`View discrepancies`)**:
   Permite al investigador revisar visualmente en la interfaz web el texto completo de la reseña original junto con las etiquetas y citas confrontadas de ambos anotadores para depurar ambigüedades en las guías de anotación o detectar sesgos del modelo.

---

## 6. Mapeo de Archivos del Toolkit Original

Para consultar la implementación de referencia en `/mnt/Research/marketing/brand_equity/methodology/`:

| Componente | Fichero fuente | Función principal |
| :--- | :--- | :--- |
| **Pipeline de Muestreo** | `sampling_validation.py` | Estratificación en 2 fases con semilla 42 y cuotas por rareza. |
| **Regla de Métricas** | `app/metric_selection.py` | Fuente única de verdad para la selección de Kappa vs Krippendorff ordinal/nominal. |
| **Cálculo de ICC y Regresión** | `app/backend.py` | Endpoints `/api/metrics/polarity_icc` y `/api/metrics/rating_congruence`. |
| **Lógica de Acuerdo en Frontend**| `app/js/modules/metrics.js` | Cálculo cliente de matrices de confusión, Kappa, Krippendorff y solapamientos. |
| **Rating Congruence Frontend** | `app/js/modules/rating_congruence.js` | Cálculo híbrido cliente-servidor de estadísticas descriptivas y matrices. |
| **Informe Técnico Completo** | `docs/COMPUTE_AGREEMENT_METRICS.md` | Especificación funcional exhaustiva de cada pantalla y fórmula. |
