import { MetricCatalogItem } from "../types";

export const METRIC_CATALOG: MetricCatalogItem[] = [
  {
    id: "verbatim_faithfulness",
    name: "Fidelidad Verbatim Anti-Alucinación",
    category: "textual",
    categoryLabel: "Fiabilidad Cualitativa & Textual",
    shortDesc: "Verifica que cada cita o fragmento textual citado por el LLM exista palabra por palabra en la reseña original.",
    formulaTex: "\\text{Fidelidad Verbatim} = \\frac{\\sum_{i=1}^{M} \\mathbb{I}(c_i \\subseteq T_{\\text{fuente}})}{M} \\times 100\\%",
    variables: [
      { symbol: "M", label: "Número total de citas textuales extraídas por el evaluador en la muestra." },
      { symbol: "c_i", label: "Fragmento o cita textual i-ésima extraída por el LLM." },
      { symbol: "T_{\\text{fuente}}", label: "Texto íntegro original de la reseña del cliente en el corpus." },
      { symbol: "\\mathbb{I}(\\cdot)", label: "Función indicadora (1 si el fragmento existe textualmente en la fuente, 0 si fue inventado)." }
    ],
    interpretation: [
      { range: "≥ 98.0%", label: "Excelente (Ausencia de alucinación literal)", badgeVariant: "default" },
      { range: "90.0% – 97.9%", label: "Aceptable con discrepancias menores de puntuación", badgeVariant: "secondary" },
      { range: "< 90.0%", label: "Alerta crítica de alucinación y paráfrasis no autorizada", badgeVariant: "destructive" }
    ],
    citation: "Lin et al. (2022). TruthfulQA: Measuring How Models Mimic Human Falsehoods. ACL 2022.",
    higherIsBetter: true,
    defaultEnabled: true,
    parameterSlots: [
      {
        key: "quote_fields",
        label: "Campos de Citas / Fragmentos Extraídos (Output)",
        multiple: true,
        allowedTypes: ["output"],
      },
      {
        key: "source_text_col",
        label: "Columna de Texto Fuente del Corpus",
        multiple: false,
        allowedTypes: ["context", "input", "spec_col"],
      },
    ],
  },
  {
    id: "internal_consistency_llm",
    name: "Disyunción de Citas (Pos ∩ Neg = ∅)",
    category: "textual",
    categoryLabel: "Fiabilidad Cualitativa & Textual",
    shortDesc: "Evalúa la coherencia interna comprobando que el mismo anotador no cite la misma frase como prueba de sentimientos opuestos.",
    formulaTex: "\\text{Positivo} \\cap \\text{Negativo} = \\emptyset, \\quad \\text{Positivo} \\cap \\text{Neutro} = \\emptyset, \\quad \\text{Negativo} \\cap \\text{Neutro} = \\emptyset",
    variables: [
      { symbol: "\\text{Positivo}", label: "Conjunto de citas textuales marcadas como soporte de polaridad positiva." },
      { symbol: "\\text{Negativo}", label: "Conjunto de citas textuales marcadas como soporte de polaridad negativa." },
      { symbol: "\\text{Neutro}", label: "Conjunto de citas textuales asignadas a polaridad neutra." },
      { symbol: "\\emptyset", label: "Conjunto vacío (intersección nula entre fragmentos de signo opuesto)." }
    ],
    interpretation: [
      { range: "100.0%", label: "Coherencia interna estricta (Sin contradicciones cruzadas)", badgeVariant: "default" },
      { range: "95.0% – 99.9%", label: "Consistencia admisible (Bajo solapamiento)", badgeVariant: "secondary" },
      { range: "< 95.0%", label: "Inconsistencia metodológica severa (Auto-contradicción)", badgeVariant: "destructive" }
    ],
    citation: "Metodología de Validación Científica Brand Equity Toolkit (aaker.drordas.info, 2026).",
    higherIsBetter: true,
    defaultEnabled: true,
  },
  {
    id: "rule_consistency",
    name: "Consistencia Lógica de Derivación",
    category: "textual",
    categoryLabel: "Fiabilidad Cualitativa & Textual",
    shortDesc: "Verifica que la polaridad global asignada por el modelo coincida con el balance aritmético de sus citas extraídas.",
    formulaTex: "\\text{Sentimiento} = \\begin{cases} \\text{Positive} & \\text{si } n_{\\text{pos}} > n_{\\text{neg}} \\\\ \\text{Negative} & \\text{si } n_{\\text{neg}} > n_{\\text{pos}} \\\\ \\text{Mixed} & \\text{si } n_{\\text{pos}} > 0 \\land n_{\\text{neg}} > 0 \\end{cases}",
    variables: [
      { symbol: "n_{\\text{pos}}", label: "Número de fragmentos o citas positivas identificadas en la reseña." },
      { symbol: "n_{\\text{neg}}", label: "Número de fragmentos o citas negativas identificadas en la reseña." },
      { symbol: "\\text{Sentimiento}", label: "Etiqueta categórica final asignada por el modelo a la dimensión." }
    ],
    interpretation: [
      { range: "≥ 95.0%", label: "Cumplimiento estricto de reglas de derivación lógica", badgeVariant: "default" },
      { range: "85.0% – 94.9%", label: "Discrepancias en casos mixtos complejos o sutiles", badgeVariant: "secondary" },
      { range: "< 85.0%", label: "Desconexión entre evidencia textual y conclusión", badgeVariant: "destructive" }
    ],
    citation: "Ordás et al. (2026). Automated Qualitative Coding Reliability in Marketing Science.",
    higherIsBetter: true,
    defaultEnabled: true,
  },
  {
    id: "inter_rater_agreement",
    name: "Acuerdo Inter-Evaluador: Kappa de Cohen (κ)",
    category: "consensus",
    categoryLabel: "Consenso Estadístico Inter-Evaluador",
    shortDesc: "Mide el grado de concordancia categórica entre dos anotadores (LLM vs Humano o LLM vs LLM), descontando el acuerdo por azar.",
    formulaTex: "\\kappa = \\frac{P_o - P_e}{1 - P_e}, \\quad P_o = \\frac{\\sum_{i=1}^n \\mathbb{I}(y_{ai} = y_{bi})}{n}, \\quad P_e = \\sum_{k} p_{ak} \\cdot p_{bk}",
    variables: [
      { symbol: "P_o", label: "Proporción de concordancia observada directamente entre los dos evaluadores." },
      { symbol: "P_e", label: "Proporción de concordancia esperada por puro azar estadístico." },
      { symbol: "y_{ai}, y_{bi}", label: "Etiquetas categóricas asignadas por el anotador A y el anotador B a cada caso." },
      { symbol: "p_{ak}, p_{bk}", label: "Probabilidades marginales de la categoría k para cada evaluador." }
    ],
    interpretation: [
      { range: "≥ 0.81", label: "Acuerdo casi perfecto (Estándar publicación JCR Q1)", badgeVariant: "default" },
      { range: "0.61 – 0.80", label: "Acuerdo sustancial (Apto para investigación Q2)", badgeVariant: "secondary" },
      { range: "0.41 – 0.60", label: "Acuerdo moderado (Requiere refinamiento de prompt)", badgeVariant: "outline" },
      { range: "< 0.40", label: "Acuerdo débil o insuficiente", badgeVariant: "destructive" }
    ],
    citation: "Cohen, J. (1960). A coefficient of agreement for nominal scales. Educational and Psychological Measurement, 20(1), 37-46. Landis & Koch (1977).",
    higherIsBetter: true,
    defaultEnabled: true,
  },
  {
    id: "krippendorff_alpha",
    name: "Alfa de Krippendorff (α)",
    category: "consensus",
    categoryLabel: "Consenso Estadístico Inter-Evaluador",
    shortDesc: "Estándar metodológico riguroso para análisis de contenido. Penaliza desacuerdos con independencia del tamaño muestral.",
    formulaTex: "\\alpha = 1 - \\frac{D_o}{D_e} = 1 - \\frac{\\frac{1}{n} \\sum_{i=1}^n d^2(y_{ai}, y_{bi})}{\\frac{1}{2n(2n - 1)} \\sum_{c} \\sum_{k} n_c n_k d^2(c, k)}",
    variables: [
      { symbol: "D_o", label: "Desacuerdo observado ponderado por la función de distancia entre respuestas." },
      { symbol: "D_e", label: "Desacuerdo esperado por azar en una población con idénticas frecuencias marginales." },
      { symbol: "d^2(c, k)", label: "Función de diferencia (0 si coinciden, 1 si difieren en escala nominal)." }
    ],
    interpretation: [
      { range: "≥ 0.800", label: "Estándar científico concluyente (Publicable en ciencias sociales)", badgeVariant: "default" },
      { range: "0.667 – 0.799", label: "Conclusiones tentativas válidas para marcos exploratorios", badgeVariant: "secondary" },
      { range: "< 0.667", label: "Datos insuficientes o guía de codificación ambigua", badgeVariant: "destructive" }
    ],
    citation: "Krippendorff, K. (2004). Content Analysis: An Introduction to Its Methodology (2nd ed.). Thousand Oaks, CA: Sage.",
    higherIsBetter: true,
    defaultEnabled: true,
  },
  {
    id: "polarity_count_agreement_icc",
    name: "Concordancia de Conteo: ICC(2,1)",
    category: "consensus",
    categoryLabel: "Consenso Estadístico Inter-Evaluador",
    shortDesc: "Coeficiente de Correlación Intraclase de dos vías y acuerdo absoluto sobre el número de citas extraídas por reseña.",
    formulaTex: "\\text{ICC}(2,1) = \\frac{MS_R - MS_E}{MS_R + (k - 1)MS_E + \\frac{k}{n}(MS_C - MS_E)}",
    variables: [
      { symbol: "MS_R", label: "Cuadrado medio entre reseñas evaluadas (Mean Square for Rows)." },
      { symbol: "MS_E", label: "Cuadrado medio del error residual (Mean Square for Error)." },
      { symbol: "MS_C", label: "Cuadrado medio entre evaluadores (Mean Square for Columns/Raters)." },
      { symbol: "k, n", label: "k evaluadores (2 anotadores) evaluando n reseñas consecutivas." }
    ],
    interpretation: [
      { range: "≥ 0.90", label: "Excelente confiabilidad psicométrica de conteo", badgeVariant: "default" },
      { range: "0.75 – 0.89", label: "Buena confiabilidad de conteo de citas", badgeVariant: "secondary" },
      { range: "0.50 – 0.74", label: "Confiabilidad moderada (Sesgo sistemático de longitud)", badgeVariant: "outline" },
      { range: "< 0.50", label: "Pobre acuerdo en número de menciones", badgeVariant: "destructive" }
    ],
    citation: "Shrout, P. E., & Fleiss, J. L. (1979). Intraclass correlations: uses in assessing rater reliability. Psychological Bulletin, 86(2), 420. Koo & Li (2016).",
    higherIsBetter: true,
    defaultEnabled: true,
  },
  {
    id: "rating_congruence",
    name: "Validez Convergente Externa (Spearman rs)",
    category: "congruence",
    categoryLabel: "Validez Convergente Externa",
    shortDesc: "Modela la asociación ordinal entre una señal o puntuación calculada del modelo (ej. NSS o Spec) y una variable criterio externa del dataset.",
    formulaTex: "\\text{logit}(P(Y_{\\text{criterio}} \\le j)) = \\theta_j - \\beta \\cdot X_{\\text{señal}}, \\quad r_s = \\text{Spearman}(X_{\\text{señal}}, Y_{\\text{criterio}})",
    variables: [
      { symbol: "X_{\\text{señal}}", label: "Señal evaluada del modelo o Spec calculada (p. ej. NSS continuo [-1.0 a +1.0] o puntuación)." },
      { symbol: "Y_{\\text{criterio}}", label: "Variable criterio externa ordinal/numérica del dataset (p. ej. rating, nota, score)." },
      { symbol: "\\beta", label: "Coeficiente de regresión logística ordinal (OrderedModel en statsmodels)." },
      { symbol: "r_s", label: "Coeficiente de correlación de rangos de Spearman entre señal y criterio." }
    ],
    interpretation: [
      { range: "r_s ≥ 0.70 (β > 0, p < 0.001)", label: "Fuerte validez convergente con la variable criterio externa", badgeVariant: "default" },
      { range: "0.50 ≤ r_s < 0.70", label: "Asociación moderada esperable en lenguaje no estructurado", badgeVariant: "secondary" },
      { range: "r_s < 0.30", label: "Disociación entre señal del modelo y criterio externo", badgeVariant: "destructive" }
    ],
    citation: "Greene, W. H. (2012). Econometric Analysis (7th ed.). Prentice Hall. McCullagh, P. (1980). Regression models for ordinal data.",
    higherIsBetter: true,
    defaultEnabled: false,
    parameterSlots: [
      {
        key: "signal_var",
        label: "Señal / Variable del Modelo o Spec (X)",
        multiple: false,
        allowedTypes: ["spec", "output"],
        specialOptions: [
          { value: "__auto_nss__", label: "NSS (Derivado automáticamente de citas pos/neg)" },
        ],
      },
      {
        key: "criterion_var",
        label: "Variable Criterio Externa del Dataset (Y)",
        multiple: false,
        allowedTypes: ["spec_col", "context", "gt"],
      },
    ],
  },
  {
    id: "json_validity",
    name: "Cumplimiento Estricto de Esquema JSON",
    category: "operational",
    categoryLabel: "Métricas Operativas de Sistema",
    shortDesc: "Porcentaje de inferencias con estructura JSON sintácticamente válida y presencia de todos los campos obligatorios.",
    formulaTex: "\\text{Validez JSON} = \\frac{\\sum_{i=1}^n \\mathbb{I}(\\text{JSON.parse}(r_i) \\land \\text{keys}(r_i) \\supseteq K_{\\text{req}})}{n} \\times 100\\%",
    variables: [
      { symbol: "r_i", label: "Cadena de texto generada por el LLM en cada inferencia." },
      { symbol: "K_{\\text{req}}", label: "Conjunto de campos obligatorios definidos en el evaluation-spec." },
      { symbol: "n", label: "Total de muestras evaluadas en el experimento." }
    ],
    interpretation: [
      { range: "100.0%", label: "Producción Zero-Failure (Parseo determinista sin excepciones)", badgeVariant: "default" },
      { range: "95.0% – 99.9%", label: "Aceptable con reparaciones menores de markdown", badgeVariant: "secondary" },
      { range: "< 95.0%", label: "Riesgo de ruptura de pipeline automatizado", badgeVariant: "destructive" }
    ],
    citation: "RFC 8259: The JavaScript Object Notation (JSON) Data Interchange Format (IETF).",
    higherIsBetter: true,
    defaultEnabled: true,
  },
  {
    id: "numeric_accuracy",
    name: "MAE, RMSE & Tolerancia Aritmética",
    category: "operational",
    categoryLabel: "Métricas de Precisión Numérica",
    shortDesc: "Para tareas de cálculo matemático: Error Absoluto Medio, Raíz del Error Cuadrático y porcentaje de aciertos dentro de tolerancia.",
    formulaTex: "\\text{MAE} = \\frac{1}{n} \\sum_{i=1}^n |y_i - \\hat{y}_i|, \\quad \\text{Tolerancia} = \\frac{\\sum_{i=1}^n \\mathbb{I}(|y_i - \\hat{y}_i| \\le \\tau |y_i|)}{n} \\times 100\\%",
    variables: [
      { symbol: "y_i", label: "Valor de referencia real extraído del dataset (Ground Truth numérico)." },
      { symbol: "\\hat{y}_i", label: "Número o cálculo generado por el LLM." },
      { symbol: "\\tau", label: "Margen de tolerancia admisible relativo (ej. ±5%)." }
    ],
    interpretation: [
      { range: "Tolerancia ≥ 98.0%", label: "Precisión aritmética de grado financiero", badgeVariant: "default" },
      { range: "90.0% – 97.9%", label: "Precisión adecuada con aproximaciones decimales", badgeVariant: "secondary" },
      { range: "< 90.0%", label: "Frecuentes errores de cálculo numérico en el modelo", badgeVariant: "destructive" }
    ],
    citation: "Willmott, C. J., & Matsuura, K. (2005). Advantages of the mean absolute error (MAE) over the root mean squared error (RMSE) in assessing average model performance.",
    higherIsBetter: true,
    defaultEnabled: false,
    parameterSlots: [
      {
        key: "prediction_var",
        label: "Valor Predicho (Output / Spec)",
        multiple: false,
        allowedTypes: ["output", "spec"],
      },
      {
        key: "reference_var",
        label: "Valor Real / Ground Truth (Dataset)",
        multiple: false,
        allowedTypes: ["spec_col", "gt", "context"],
      },
    ],
  },
  {
    id: "prevalence_positive_ratio",
    name: "Ratio de Sentimiento Positivo (Prevalencia)",
    category: "statistical",
    categoryLabel: "Métricas Estadísticas & Distribución",
    shortDesc: "Calcula el porcentaje de evaluaciones positivas sobre el total de menciones activas: SUM(Positive) / SUM(Activos) * 100.",
    formulaTex: "\\text{Ratio Positivo} = \\frac{\\sum \\mathbb{I}(\\text{sentiment} = \\text{'Positive'})}{\\sum \\mathbb{I}(\\text{sentiment} \\in \\{\\text{'Positive', 'Negative', 'Neutral', 'Mixed'}\\})} \\times 100\\%",
    variables: [
      { symbol: "\\text{Positive}", label: "Frecuencia de anotaciones clasificadas con polaridad favorable." },
      { symbol: "\\text{Activos}", label: "Total de muestras donde la dimensión fue detectada (excluyendo 'blank')." },
      { symbol: "\\mathbb{I}(\\cdot)", label: "Función indicadora de coincidencia categórica." }
    ],
    interpretation: [
      { range: "Similar a Ground Truth (±5%)", label: "Excelente calibración de balance frente al experto", badgeVariant: "default" },
      { range: "Desviación 5% – 15%", label: "Sesgo moderado de optimismo o pesimismo", badgeVariant: "secondary" },
      { range: "Desviación > 15%", label: "Sesgo severo de etiquetado respecto al humano", badgeVariant: "destructive" }
    ],
    citation: "Liu, B. (2012). Sentiment Analysis and Opinion Mining. Morgan & Claypool Publishers.",
    higherIsBetter: true,
    defaultEnabled: true,
  },
  {
    id: "net_sentiment_score",
    name: "Net Sentiment Score (NSS)",
    category: "statistical",
    categoryLabel: "Métricas Estadísticas & Distribución",
    shortDesc: "Balance neto estandarizado de sentimiento: (Positivos - Negativos) / (Positivos + Negativos).",
    formulaTex: "\\text{NSS} = \\frac{N_{\\text{pos}} - N_{\\text{neg}}}{N_{\\text{pos}} + N_{\\text{neg}}} \\in [-1.0, +1.0]",
    variables: [
      { symbol: "N_{\\text{pos}}", label: "Número total de señales o fragmentos con evaluación positiva." },
      { symbol: "N_{\\text{neg}}", label: "Número total de señales o fragmentos con evaluación negativa." }
    ],
    interpretation: [
      { range: "NSS > +0.50", label: "Polaridad predominantemente positiva", badgeVariant: "default" },
      { range: "-0.20 ≤ NSS ≤ +0.50", label: "Polaridad equilibrada o neutral", badgeVariant: "secondary" },
      { range: "NSS < -0.20", label: "Polaridad crítica marcadamente negativa", badgeVariant: "destructive" }
    ],
    citation: "Reichheld, F. F. (2003). The One Number You Need to Grow. Harvard Business Review.",
    higherIsBetter: true,
    defaultEnabled: false,
    parameterSlots: [
      {
        key: "positive_fields",
        label: "Señales / Campos Positivos",
        multiple: true,
        allowedTypes: ["output", "spec"],
      },
      {
        key: "negative_fields",
        label: "Señales / Campos Negativos",
        multiple: true,
        allowedTypes: ["output", "spec"],
      },
    ],
  }
];
