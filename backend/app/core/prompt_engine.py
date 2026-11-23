import json
import re
import difflib
import yaml
from typing import Dict, Any, List, Optional, Tuple
from backend.app.schemas.prompt import (
    PromptTemplateRequest,
    GeneratedPromptResponse,
    PromptValidationRequest,
    PromptValidationResponse,
    PromptValidationIssue,
    EvaluationSpec,
    OutputFieldSpec,
    ComputedSpec
)
from backend.app.core.dataset_engine import dataset_engine

# Evaluation Spec Regex
EVAL_SPEC_REGEX = re.compile(r"```(?:evaluation-spec|eval-spec)\s*([\s\S]*?)\s*```", re.IGNORECASE)

class PromptEngine:
    """
    Universal Prompt & Evaluation Specification Engine.
    Allows defining, in the prompt itself or via structured metadata,
    what task is performed and what performance metrics will measure LLM performance.
    """

    def extract_evaluation_spec(self, template: str, task_hint: Optional[str] = None) -> Tuple[str, EvaluationSpec]:
        """
        Extracts ```evaluation-spec and output schema from prompt template and returns (clean_template, eval_spec).
        Clean template is the pure 'Prompt Real' stripped of formatting bloat.
        """
        match = EVAL_SPEC_REGEX.search(template)
        output_schema: Dict[str, Any] = {}
        computed_specs: List[ComputedSpec] = []
        clean_template = template

        if match:
            spec_yaml = match.group(1).strip()
            clean_template = template[:match.start()].rstrip() + "\n" + template[match.end():].lstrip()
            try:
                raw_dict = yaml.safe_load(spec_yaml) or {}
                output_schema = raw_dict.get("output_schema", {}) or {}
                for cs in raw_dict.get("computed_specs", []):
                    computed_specs.append(ComputedSpec(
                        name=cs.get("name", "spec"),
                        function=cs.get("function", "suma"),
                        arguments=cs.get("arguments", []),
                        expression=cs.get("expression"),
                        ground_truth_col=cs.get("ground_truth_col"),
                        tolerance=float(cs.get("tolerance", 0.05)) if cs.get("tolerance") is not None else 0.05,
                        description=cs.get("description", "")
                    ))

                output_fields = []
                for f in raw_dict.get("output_fields", []):
                    output_fields.append(OutputFieldSpec(
                        name=f.get("name", "resultado"),
                        type=f.get("type", "numeric"),
                        ground_truth_col=f.get("ground_truth_col"),
                        metrics=f.get("metrics", ["mae", "tolerance_match"]),
                        tolerance=float(f.get("tolerance", 0.05)) if f.get("tolerance") is not None else 0.05
                    ))

                metric_labels = {
                    "mae": "MAE (Error Absoluto Medio)",
                    "rmse": "RMSE (Error Cuadrático Medio)",
                    "tolerance_match": "Precisión dentro de Tolerancia (±5%)",
                    "exact_match": "Coincidencia Numérica Exacta",
                    "accuracy": "Exactitud de Clasificación (Accuracy)",
                    "f1_score": "F1-Score Macro",
                    "cohens_kappa": "Acuerdo Inter-Anotador (Cohen's Kappa)",
                    "verbatim_faithfulness": "Fidelidad Textual Verbatim (Anti-Alucinación)",
                    "rule_consistency": "Consistencia de Reglas Lógicas",
                    "polarity_agreement": "Polarity Count Agreement (PCA)",
                    "internal_consistency_llm": "Internal Consistency (LLM): Pos ∩ Neg, Pos ∩ Neu, Neg ∩ Neu",
                    "internal_consistency_expert": "Internal Consistency (Experto): Pos ∩ Neg, Pos ∩ Neu, Neg ∩ Neu",
                    "test_retest_reliability": "Test-Retest Reliability (Acuerdo Intra-Anotador)",
                    "inter_rater_agreement": "Inter-Rater Agreement (LLMs vs Expertos)",
                    "polarity_count_agreement_icc": "Polarity Count Agreement (ICC Koo & Li 2016)",
                    "rating_congruence": "Rating Congruence (Validez Convergente vs Reviewer Stars)",
                }

                raw_metrics = raw_dict.get("metrics", [])
                if raw_metrics:
                    top_metrics = [metric_labels.get(m, m) for m in raw_metrics]
                else:
                    collected = []
                    for of in output_fields:
                        for m in of.metrics:
                            lbl = metric_labels.get(m, m)
                            if lbl not in collected:
                                collected.append(lbl)
                    if not collected:
                        task_t = raw_dict.get("task_type", task_hint or "custom")
                        if task_t == "numeric_math":
                            collected = ["MAE (Error Absoluto Medio)", "RMSE (Error Cuadrático Medio)", "Precisión dentro de Tolerancia (±5%)", "Coincidencia Numérica Exacta"]
                        elif task_t in ["aspect_polarity", "aaker_dimensions"]:
                            collected = [
                                "Internal Consistency (LLM): Pos ∩ Neg, Pos ∩ Neu, Neg ∩ Neu",
                                "Inter-Rater Agreement (LLMs vs Expertos)",
                                "Polarity Count Agreement (ICC Koo & Li 2016)",
                                "Rating Congruence (Validez Convergente vs Reviewer Stars)",
                                "Fidelidad Textual Verbatim (Anti-Alucinación)"
                            ]
                        elif task_t == "classification":
                            collected = ["Exactitud de Clasificación (Accuracy)", "F1-Score Macro", "Acuerdo Inter-Anotador (Cohen's Kappa)"]
                        else:
                            collected = ["Cumplimiento de Esquema JSON", "Latencia Media", "Coste Estimado ($)"]
                    top_metrics = collected

                # Also look for embedded ```json block to populate output_schema if not explicit in YAML
                json_match = re.search(r"```json\s*([\s\S]*?)\s*```", clean_template, re.IGNORECASE)
                if json_match:
                    if not output_schema:
                        try:
                            clean_json_str = re.sub(r"<[^>]+>", "0", json_match.group(1).strip())
                            output_schema = json.loads(clean_json_str)
                        except Exception:
                            keys_found = re.findall(r'["\']([a-zA-Z0-9_]+)["\']\s*:', json_match.group(1))
                            output_schema = {k: 0.0 for k in keys_found}

                    # Strip the ```json block and leading format headings to leave clean Prompt Real
                    clean_template = clean_template[:json_match.start()].rstrip() + "\n" + clean_template[json_match.end():].lstrip()
                    clean_template = re.sub(r"(?:INSTRUCCIONES DE FORMATO:?|FORMAT INSTRUCTIONS:?|Responde [^:\n]+:?)\s*$", "", clean_template, flags=re.MULTILINE | re.IGNORECASE)

                raw_bindings = raw_dict.get("metric_bindings", {}) or {}
                clean_bindings: Dict[str, Any] = {}
                if isinstance(raw_bindings, dict):
                    for mb_k, mb_v in raw_bindings.items():
                        if isinstance(mb_v, list):
                            clean_bindings[str(mb_k)] = [str(item) for item in mb_v if item]
                        elif isinstance(mb_v, dict):
                            slot_map: Dict[str, List[str]] = {}
                            for sk, sv in mb_v.items():
                                if isinstance(sv, list):
                                    slot_map[str(sk)] = [str(item) for item in sv if item]
                                elif sv:
                                    slot_map[str(sk)] = [str(sv)]
                            clean_bindings[str(mb_k)] = slot_map

                spec = EvaluationSpec(
                    task_type=raw_dict.get("task_type", task_hint or "custom"),
                    description=raw_dict.get("description", ""),
                    output_schema=output_schema,
                    output_fields=output_fields,
                    computed_specs=computed_specs,
                    dimensions=raw_dict.get("dimensions", []),
                    polarity_field=raw_dict.get("polarity_field", "polaridad"),
                    verbatim_field=raw_dict.get("verbatim_field", "citas"),
                    source_text_col=raw_dict.get("source_text_col"),
                    rating_col=raw_dict.get("rating_col"),
                    metrics=top_metrics,
                    metric_bindings=clean_bindings,
                    metadata=raw_dict.get("metadata", {}),
                    active_batteries=raw_dict.get("active_batteries", ["pilar_1", "pilar_2", "pilar_3", "pilar_4"]),
                    methodology_config=raw_dict.get("methodology_config", {}),
                    custom_batteries=raw_dict.get("custom_batteries", [])
                )
                return clean_template.strip(), spec
            except Exception as e:
                print(f"[PromptEngine] Error parsing evaluation-spec YAML: {e}")

        # Check for ```json even without evaluation-spec
        json_match = re.search(r"```json\s*([\s\S]*?)\s*```", clean_template, re.IGNORECASE)
        if json_match:
            try:
                clean_json_str = re.sub(r"<[^>]+>", "0", json_match.group(1).strip())
                output_schema = json.loads(clean_json_str)
            except Exception:
                keys_found = re.findall(r'["\']([a-zA-Z0-9_]+)["\']\s*:', json_match.group(1))
                output_schema = {k: 0.0 for k in keys_found}
            clean_template = clean_template[:json_match.start()].rstrip() + "\n" + clean_template[json_match.end():].lstrip()
            clean_template = re.sub(r"(?:INSTRUCCIONES DE FORMATO:?|FORMAT INSTRUCTIONS:?|Responde [^:\n]+:?)\s*$", "", clean_template, flags=re.MULTILINE | re.IGNORECASE)

        # Auto-infer spec if not explicitly provided
        spec = self._infer_eval_spec_from_text(template, task_hint)
        if output_schema:
            spec.output_schema = output_schema
        if computed_specs:
            spec.computed_specs = computed_specs
        return clean_template.strip(), spec


    def _infer_eval_spec_from_text(self, template: str, task_hint: Optional[str] = None) -> EvaluationSpec:
        """Introspects prompt text to construct an intelligent EvaluationSpec."""
        lower_text = template.lower()

        # Math / Numeric Detection
        math_keywords = ["calcula", "sum", "operación", "promedio", "fórmula", "numérico", "multiplica", "total", "math", "porcentaje"]
        is_math = task_hint == "numeric_math" or any(k in lower_text for k in math_keywords)

        # Aspect & Polarity Detection (Aaker archetype)
        aspect_keywords = ["dimension", "aspecto", "polaridad", "polarity", "verbatim", "sentiment", "positivo", "negativo", "aaker"]
        is_aspect = task_hint in ["aspect_polarity", "aaker_dimensions"] or any(k in lower_text for k in aspect_keywords)

        # Classification Detection
        class_keywords = ["clasifica", "categoría", "etiqueta", "clase", "categoria", "label"]
        is_class = task_hint == "classification" or any(k in lower_text for k in class_keywords)

        if is_math:
            return EvaluationSpec(
                task_type="numeric_math",
                description="Evaluación de precisión en operaciones matemáticas y numéricas.",
                output_fields=[
                    OutputFieldSpec(
                        name="resultado_calculo",
                        type="numeric",
                        metrics=["mae", "rmse", "tolerance_match", "exact_match"],
                        tolerance=0.05
                    )
                ],
                metrics=[
                    "MAE (Error Absoluto Medio)",
                    "RMSE (Error Cuadrático Medio)",
                    "Precisión dentro de Tolerancia (±5%)",
                    "Coincidencia Numérica Exacta",
                    "Latencia Media",
                    "Throughput (tok/s)",
                    "Coste Estimado ($)"
                ]
            )
        elif is_aspect:
            # Extract candidate dimensions if listed in the prompt
            dim_matches = re.findall(r"(?:-|\*)\s*([A-Za-z0-9_áéíóúÁÉÍÓÚ\s]{3,35}):?", template)
            dims = [d.strip() for d in dim_matches if len(d.strip()) > 2 and d.strip().lower() not in ["positive", "negative", "neutral"]]
            if not dims:
                dims = ["Calidad", "Atención", "Precio", "Fidelidad"]

            return EvaluationSpec(
                task_type="aspect_polarity",
                description="Evaluación de etiquetado en dimensiones, polaridad y fidelidad verbatim.",
                dimensions=dims,
                polarity_field="polaridad",
                verbatim_field="citas",
                metrics=[
                    "Fidelidad Textual Verbatim (Anti-Alucinación)",
                    "Consistencia de Reglas Lógicas",
                    "Acuerdo Inter-Anotador (Cohen's Kappa)",
                    "Polarity Count Agreement (PCA)",
                    "Cumplimiento Estructura JSON",
                    "Latencia Media",
                    "Coste Estimado ($)"
                ]
            )
        elif is_class:
            return EvaluationSpec(
                task_type="classification",
                description="Evaluación de clasificación categórica de texto.",
                output_fields=[
                    OutputFieldSpec(
                        name="categoria_asignada",
                        type="categorical",
                        metrics=["accuracy", "f1_score", "cohens_kappa"]
                    )
                ],
                metrics=[
                    "Exactitud de Clasificación (Accuracy)",
                    "F1-Score Macro",
                    "Acuerdo Inter-Modelo (Cohen's Kappa)",
                    "Validez de Formato",
                    "Latencia Media",
                    "Coste Estimado ($)"
                ]
            )
        else:
            return EvaluationSpec(
                task_type="structured_json",
                description="Evaluación de extracción estructurada y seguimiento de esquema.",
                output_fields=[
                    OutputFieldSpec(
                        name="entidades",
                        type="aspect_list",
                        metrics=["schema_validity", "overlap_score"]
                    )
                ],
                metrics=[
                    "Cumplimiento de Esquema JSON",
                    "Completitud de Campos Requeridos",
                    "Latencia Media",
                    "Coste Estimado ($)"
                ]
            )

    def generate_template(self, req: PromptTemplateRequest) -> GeneratedPromptResponse:
        """
        Generates a generic prompt template with embedded evaluation-spec for ANY task:
        - numeric_math (mathematical operations over numeric columns)
        - aspect_polarity (labeling into dimensions + polarity + verbatim quotes)
        - classification (predicting category/label)
        - structured_json (schema extraction)
        """
        ds = dataset_engine.get_dataset(req.dataset_id) if req.dataset_id else None
        columns = ds.columns if ds else []

        numeric_cols = [c.name for c in columns if any(t in c.data_type.lower() for t in ["int", "float", "double", "numeric", "decimal", "real"])]
        text_cols = [c.name for c in columns if not any(t in c.data_type.lower() for t in ["int", "float", "double", "numeric", "decimal", "real"])]

        input_cols = req.input_text_columns or ([text_cols[0]] if text_cols else [c.name for c in columns[:2]])
        gt_col = req.ground_truth_column
        ctx_cols = req.context_columns or []

        context_block = ""
        if ctx_cols:
            ctx_items = "\n".join([f"- {c}: {{{c}}}" for c in ctx_cols])
            context_block = f"INFORMACIÓN DE CONTEXTO (METADATOS):\n{ctx_items}\n\n"

        # 1. Operaciones Matemáticas y Numéricas
        if req.task_type == "numeric_math":
            num_a = (req.input_text_columns[0] if req.input_text_columns and req.input_text_columns[0] in numeric_cols else None) or (numeric_cols[0] if numeric_cols else "consumer_total_reviews")
            num_b = (req.input_text_columns[1] if req.input_text_columns and len(req.input_text_columns) > 1 and req.input_text_columns[1] in numeric_cols else None) or (numeric_cols[1] if len(numeric_cols) > 1 else (numeric_cols[0] if numeric_cols else "review_rating"))
            gt = gt_col or (numeric_cols[1] if len(numeric_cols) > 1 else num_a)

            system_prompt = "Eres un asistente matemático de alta precisión. Realizas cálculos analíticos exactos y respondes de forma clara y directa."
            prompt_text = f"""Eres un calculador analítico para evaluación de registros numéricos.
{context_block}Dado el siguiente registro:
- Campo A ({num_a}): {{{num_a}}}
- Campo B ({num_b}): {{{num_b}}}

TAREA MATEMÁTICA:
Calcula el valor ajustado según la siguiente fórmula:
resultado = ({{{num_a}}} * 1.25) + ({{{num_b}}} * 0.75)"""

            output_schema = {
                "output_1": 0.0,
                "output_2": 0.0,
                "resultado_calculo": 0.0
            }

            computed_specs = []

            spec_yaml = yaml.dump({
                "task_type": "numeric_math",
                "description": f"Evaluación de cálculo numérico sobre campos {num_a} y {num_b}",
                "output_schema": output_schema,
                "computed_specs": [cs.model_dump() for cs in computed_specs],
                "output_fields": [
                    {
                        "name": "resultado_calculo",
                        "type": "numeric",
                        "ground_truth_col": gt,
                        "metrics": ["mae", "rmse", "tolerance_match", "exact_match"],
                        "tolerance": 0.05
                    }
                ]
            }, sort_keys=False)

            template = f"""{prompt_text}

```json
{json.dumps(output_schema, indent=2)}
```

```evaluation-spec
{spec_yaml}```"""

            eval_spec = EvaluationSpec(
                task_type="numeric_math",
                description=f"Evaluación de cálculo numérico sobre {num_a} y {num_b}",
                output_schema=output_schema,
                computed_specs=computed_specs,
                output_fields=[
                    OutputFieldSpec(
                        name="resultado_calculo",
                        type="numeric",
                        ground_truth_col=gt,
                        metrics=["mae", "rmse", "tolerance_match", "exact_match"],
                        tolerance=0.05
                    )
                ],
                metrics=[
                    "MAE (Error Absoluto Medio)",
                    "RMSE (Error Cuadrático Medio)",
                    "Precisión dentro de Tolerancia (±5%)",
                    "Coincidencia Numérica Exacta",
                    "Latencia Media (ms)",
                    "Coste Estimado ($)"
                ]
            )

            all_vars = [num_a, num_b] + [c for c in ctx_cols if c not in [num_a, num_b]]
            return GeneratedPromptResponse(
                task_type=req.task_type,
                template=template,
                prompt_text=prompt_text,
                output_schema=output_schema,
                computed_specs=computed_specs,
                variables=all_vars,
                system_prompt=system_prompt,
                output_format="json",
                detected_metrics=eval_spec.metrics,
                eval_spec=eval_spec
            )

        # 2. Etiquetado en Dimensiones y Polaridad (Validación Científica Aaker / Metodología)
        elif req.task_type in ["aspect_polarity", "aaker_dimensions"]:
            text_col = input_cols[0] if input_cols else "review_comment"
            dimensions = req.custom_dimensions or ["Calidad del Producto", "Experiencia y Servicio", "Precio y Valor", "Fidelidad o Recomendación"]
            dim_list_str = "\n".join([f"- {d}" for d in dimensions])

            system_prompt = (
                "Eres un investigador cualitativo analítico. Tu labor es etiquetar dimensiones específicas en textos, "
                "asignar su polaridad con rigor lógico y citar citas textuales estrictamente verbatim."
            )

            prompt_text = f"""{context_block}Analiza con atención el siguiente texto del corpus:
<<<
{{{text_col}}}
>>>

TAREA DE ETIQUETADO EN DIMENSIONES Y POLARIDAD:
Evalúa la presencia de las siguientes dimensiones analíticas:
{dim_list_str}

REGLAS DE EVALUACIÓN:
1. CITAS VERBATIM: Cada fragmento citado debe ser una copia textual idéntica del texto anterior.
2. POLARIDAD: Asigna a cada dimensión su polaridad ("positive", "negative", "neutral").
3. CONTEO: Indica el número de citas positivas y negativas encontradas."""

            output_schema = {
                "n_positivo": 0,
                "n_negativo": 0,
                "polaridad": "neutral",
                "citas_positivas": [],
                "citas_negativas": []
            }

            computed_specs = []

            spec_yaml = yaml.dump({
                "task_type": "aspect_polarity",
                "dimensions": dimensions,
                "source_text_col": text_col,
                "output_schema": output_schema,
                "computed_specs": [cs.model_dump() for cs in computed_specs],
                "metrics": ["verbatim_faithfulness", "rule_consistency", "polarity_agreement", "cohens_kappa"]
            }, sort_keys=False)

            template = f"""{prompt_text}

```json
{json.dumps(output_schema, indent=2)}
```

```evaluation-spec
{spec_yaml}```"""

            eval_spec = EvaluationSpec(
                task_type="aspect_polarity",
                description="Etiquetado multidimensional de aspectos, polaridad y fidelidad verbatim.",
                dimensions=dimensions,
                polarity_field="polaridad",
                verbatim_field="citas_positivas",
                source_text_col=text_col,
                output_schema=output_schema,
                computed_specs=computed_specs,
                metrics=[
                    "Fidelidad Textual Verbatim (Anti-Alucinación)",
                    "Consistencia de Reglas Lógicas",
                    "Acuerdo Inter-Anotador (Cohen's Kappa)",
                    "Polarity Count Agreement (PCA)",
                    "Cumplimiento de Formato JSON",
                    "Latencia Media (ms)",
                    "Coste Estimado ($)"
                ]
            )

            all_vars = [text_col] + [c for c in ctx_cols if c != text_col]
            return GeneratedPromptResponse(
                task_type=req.task_type,
                template=template,
                prompt_text=prompt_text,
                output_schema=output_schema,
                computed_specs=computed_specs,
                variables=all_vars,
                system_prompt=system_prompt,
                output_format="json",
                detected_metrics=eval_spec.metrics,
                eval_spec=eval_spec
            )

        # 3. Clasificación Categórica
        elif req.task_type == "classification":
            text_col = input_cols[0] if input_cols else "text"
            gt = gt_col or (columns[1].name if len(columns) > 1 else "categoria")

            system_prompt = "Eres un modelo clasificador de textos de alta precisión. Asignas categorías rigurosamente."
            prompt_text = f"""{context_block}Clasifica el siguiente texto en su categoría correspondiente:
<<<
{{{text_col}}}
>>>"""

            output_schema = {
                "categoria_asignada": "",
                "confianza": 0.0,
                "justificacion": ""
            }

            computed_specs = []

            spec_yaml = yaml.dump({
                "task_type": "classification",
                "output_schema": output_schema,
                "computed_specs": [cs.model_dump() for cs in computed_specs],
                "output_fields": [
                    {
                        "name": "categoria_asignada",
                        "type": "categorical",
                        "ground_truth_col": gt,
                        "metrics": ["accuracy", "f1_score", "cohens_kappa"]
                    }
                ]
            }, sort_keys=False)

            template = f"""{prompt_text}

```json
{json.dumps(output_schema, indent=2)}
```

```evaluation-spec
{spec_yaml}```"""

            eval_spec = EvaluationSpec(
                task_type="classification",
                description=f"Clasificación categórica de {text_col} comparada con {gt}",
                output_schema=output_schema,
                computed_specs=computed_specs,
                output_fields=[
                    OutputFieldSpec(
                        name="categoria_asignada",
                        type="categorical",
                        ground_truth_col=gt,
                        metrics=["accuracy", "f1_score", "cohens_kappa"]
                    )
                ],
                metrics=[
                    "Exactitud de Clasificación (Accuracy)",
                    "F1-Score Macro",
                    "Acuerdo Inter-Modelo (Cohen's Kappa)",
                    "Validez de Formato JSON",
                    "Latencia Media (ms)",
                    "Coste Estimado ($)"
                ]
            )

            return GeneratedPromptResponse(
                task_type=req.task_type,
                template=template,
                prompt_text=prompt_text,
                output_schema=output_schema,
                computed_specs=computed_specs,
                variables=[text_col],
                system_prompt=system_prompt,
                output_format="json",
                detected_metrics=eval_spec.metrics,
                eval_spec=eval_spec
            )

        # 4. Extracción Estructurada JSON / General
        else:
            text_col = input_cols[0] if input_cols else "review_comment"
            system_prompt = "Eres un extractor de datos de alta precisión. Extraes los campos específicos requeridos."
            prompt_text = f"""Analiza el siguiente texto y extrae las entidades y datos clave:
<<<
{{{text_col}}}
>>>"""

            output_schema = {
                "campo_1": "",
                "campo_2": 0.0,
                "resumen": ""
            }

            computed_specs = []

            spec_yaml = yaml.dump({
                "task_type": "structured_json",
                "output_schema": output_schema,
                "computed_specs": [cs.model_dump() for cs in computed_specs],
                "output_fields": [
                    {
                        "name": "campo_1",
                        "type": "text",
                        "metrics": ["schema_validity"]
                    }
                ]
            }, sort_keys=False)

            template = f"""{prompt_text}

```json
{json.dumps(output_schema, indent=2)}
```

```evaluation-spec
{spec_yaml}```"""

            eval_spec = EvaluationSpec(
                task_type="structured_json",
                description="Extracción estructurada con validación de tipos",
                output_schema=output_schema,
                computed_specs=computed_specs,
                metrics=[
                    "Cumplimiento de Esquema JSON",
                    "Completitud de Campos Extraídos",
                    "Acuerdo Inter-Modelo",
                    "Latencia Media (ms)",
                    "Coste Estimado ($)"
                ]
            )

            return GeneratedPromptResponse(
                task_type=req.task_type,
                template=template,
                prompt_text=prompt_text,
                output_schema=output_schema,
                computed_specs=computed_specs,
                variables=[text_col],
                system_prompt=system_prompt,
                output_format="json",
                detected_metrics=eval_spec.metrics,
                eval_spec=eval_spec
            )

    def render_prompt_variables(
        self,
        clean_template: str,
        row: Dict[str, Any],
        allowed_columns: Optional[List[str]] = None
    ) -> str:
        """
        Single-pass regex variable injection: replaces {var_name} with str(row[var_name])
        only when var_name is a valid column in row (and in allowed_columns if specified).
        Leaves any other { ... } blocks in the prompt untouched and never re-parses injected text.
        """
        allowed_set = set(allowed_columns) if allowed_columns else set(row.keys())

        def _replacer(match: re.Match) -> str:
            var_name = match.group(1)
            if var_name in row and (not allowed_set or var_name in allowed_set):
                val = row.get(var_name)
                return str(val if val is not None else "")
            return match.group(0)

        return re.sub(r"\{([a-zA-Z0-9_.-]+)\}", _replacer, clean_template)

    def validate_prompt(self, req: PromptValidationRequest) -> PromptValidationResponse:
        """
        Validates template coherence against dataset columns, parses the embedded
        evaluation specification, verifies ground-truth columns, checks computed specs,
        and renders a live preview.
        """
        ds = dataset_engine.get_dataset(req.dataset_id) if req.dataset_id else None
        dataset_cols = {c.name for c in ds.columns} if ds else set()
        col_type_map = {c.name: c.data_type for c in ds.columns} if ds else {}
        allowed_cols = set(req.allowed_columns) if req.allowed_columns is not None else dataset_cols

        # 1. Extract evaluation spec (or auto-infer)
        clean_template, eval_spec = self.extract_evaluation_spec(req.template)

        # 2. Extract variable placeholders {var_name} from clean_template
        found_vars = list(dict.fromkeys(re.findall(r"\{([a-zA-Z0-9_.-]+)\}", clean_template)))

        missing_vars = []
        not_selected_vars = []
        if ds and dataset_cols:
            for v in found_vars:
                if v not in dataset_cols:
                    missing_vars.append(v)
                elif req.allowed_columns is not None and v not in allowed_cols:
                    missing_vars.append(v)
                    not_selected_vars.append(v)

        issues: List[PromptValidationIssue] = []

        # Issue 1: Missing or unselected input variables
        if missing_vars and ds:
            candidate_pool = list(allowed_cols) if allowed_cols else list(dataset_cols)
            lower_map = {c.lower(): c for c in candidate_pool}
            for mv in missing_vars:
                if mv in not_selected_vars:
                    issues.append(PromptValidationIssue(
                        severity="error",
                        message=f"La variable '{{{mv}}}' no está habilitada para inyectar en el prompt (solo se permiten columnas de TEXTO, ID o CONTEXTO del Paso 1).",
                        suggestion=f"Si necesitas pasar '{mv}' al modelo, cámbiala a TEXTO o CONTEXTO en el Paso 1 (las columnas SPEC son solo para métricas/evaluación)."
                    ))
                else:
                    closest_lower = difflib.get_close_matches(mv.lower(), list(lower_map.keys()), n=1, cutoff=0.35)
                    closest_col = lower_map[closest_lower[0]] if closest_lower else None
                    suggestion = f"¿Quizás quisiste decir '{{{closest_col}}}'?" if closest_col else (
                        f"Variables disponibles seleccionadas: {', '.join('{' + c + '}' for c in candidate_pool)}" if candidate_pool else None
                    )
                    issues.append(PromptValidationIssue(
                        severity="error",
                        message=f"La variable '{{{mv}}}' no existe en las columnas del dataset.",
                        suggestion=suggestion
                    ))

        # Issue 2: Validate Ground Truth columns defined in evaluation-spec
        has_gt = False
        gt_col_found = None
        for of in eval_spec.output_fields:
            if of.ground_truth_col:
                gt_clean = of.ground_truth_col.strip("{}")
                if dataset_cols and gt_clean not in dataset_cols:
                    closest = difflib.get_close_matches(gt_clean, list(dataset_cols), n=1, cutoff=0.4)
                    sugg = f"¿Quizás quisiste decir '{closest[0]}'?" if closest else None
                    issues.append(PromptValidationIssue(
                        severity="warning",
                        message=f"La columna de Ground Truth '{gt_clean}' no se encuentra en el dataset.",
                        suggestion=sugg or "Se evaluará por Consenso Inter-Modelo (Unsupervised) en su lugar."
                    ))
                else:
                    has_gt = True
                    gt_col_found = gt_clean
                    # Type compatibility check
                    expected_type = of.type
                    actual_type = col_type_map.get(gt_clean, "")
                    if expected_type == "numeric" and not any(t in actual_type.lower() for t in ["int", "float", "double", "num", "real", "decimal"]):
                        issues.append(PromptValidationIssue(
                            severity="warning",
                            message=f"La métrica numérica (MAE/RMSE) está asignada a '{gt_clean}', pero su tipo en el dataset es '{actual_type}'."
                        ))

        # Check source text column for aspect_polarity verbatim check
        if eval_spec.source_text_col:
            st_clean = eval_spec.source_text_col.strip("{}")
            if dataset_cols and st_clean not in dataset_cols:
                issues.append(PromptValidationIssue(
                    severity="warning",
                    message=f"La columna fuente para citas verbatim '{st_clean}' no se encuentra en el dataset."
                ))

        # Issue 3: Validate computed evaluation-specs
        output_keys = set(eval_spec.output_schema.keys()) if eval_spec.output_schema else set()
        defined_spec_names = set()
        for cs in eval_spec.computed_specs:
            if cs.name in defined_spec_names:
                issues.append(PromptValidationIssue(
                    severity="error",
                    message=f"Nombre de spec duplicado: '{cs.name}'."
                ))
            defined_spec_names.add(cs.name)
            for arg in cs.arguments:
                if arg not in output_keys and arg not in dataset_cols and arg not in defined_spec_names and arg != cs.name:
                    issues.append(PromptValidationIssue(
                        severity="warning",
                        message=f"La spec '{cs.name}' usa la variable '{arg}', que no está en el esquema de output ni en specs previas."
                    ))

        # Issue 4: Validate JSON Output Schema <-> Prompt coherence
        if eval_spec.output_schema and isinstance(eval_spec.output_schema, dict) and len(eval_spec.output_schema) > 0:
            prompt_tokens_lower = {tok.lower() for tok in re.findall(r"[a-zA-Z0-9_]+", clean_template)}
            missing_json_keys = []
            for top_key, top_val in eval_spec.output_schema.items():
                if top_key.lower() not in prompt_tokens_lower:
                    missing_json_keys.append(top_key)
                elif isinstance(top_val, dict):
                    for sub_key in top_val.keys():
                        if sub_key.lower() not in prompt_tokens_lower:
                            missing_json_keys.append(f"{top_key}.{sub_key}")
            if missing_json_keys:
                issues.append(PromptValidationIssue(
                    severity="error",
                    message=f"Incoherencia JSON ↔ Prompt: las siguientes claves del esquema de salida no aparecen en el prompt: {', '.join(missing_json_keys)}.",
                    suggestion="Escribe el mismo nombre de variable en el prompt y en el JSON de salida (puede variar mayúsculas/minúsculas)."
                ))

        # Output format detection
        is_structured_block = ("MARKERS_POSITIVE" in clean_template) or ("Do NOT generate JSON" in clean_template)
        is_json = bool(re.search(r"\bjson\b", clean_template, re.IGNORECASE)) or bool(eval_spec.output_schema)
        output_format = "structured_blocks" if is_structured_block else ("json" if is_json else "numeric")

        # Live Preview rendering using Row 0 from dataset
        preview_rendered = None
        if ds and found_vars:
            try:
                first_row_resp = dataset_engine.get_paginated_rows(req.dataset_id, offset=0, limit=1)
                if first_row_resp.rows:
                    row_data = first_row_resp.rows[0]
                    preview_rendered = self.render_prompt_variables(
                        clean_template,
                        row_data,
                        list(allowed_cols) if allowed_cols else None
                    )
            except Exception as e:
                issues.append(PromptValidationIssue(
                    severity="info",
                    message=f"Vista previa no generada: {str(e)}"
                ))

        is_valid = len([i for i in issues if i.severity == "error"]) == 0

        return PromptValidationResponse(
            is_valid=is_valid,
            output_format=output_format,
            task_type=eval_spec.task_type,
            prompt_text=clean_template,
            output_schema=eval_spec.output_schema or {},
            computed_specs=eval_spec.computed_specs or [],
            detected_outputs=list(eval_spec.output_schema.keys()) if eval_spec.output_schema else [],
            detected_variables=found_vars,
            missing_variables=missing_vars,
            detected_dimensions=eval_spec.dimensions,
            detected_metrics=eval_spec.metrics,
            eval_spec=eval_spec,
            has_ground_truth=has_gt,
            ground_truth_col=gt_col_found,
            issues=issues,
            preview_rendered=preview_rendered
        )


prompt_engine = PromptEngine()
