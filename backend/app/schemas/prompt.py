from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field

class ComputedSpec(BaseModel):
    name: str = "spec_calculada"
    function: str = "suma"  # "suma", "resta", "multiplicacion", "division", "promedio", "diff", "abs", "max", "min", "nss", "internal_consistency", "rule_consistency", "verbatim_faithfulness", "tolerance_match", "conditional_rule", "custom_expression"
    arguments: List[str] = Field(default_factory=list)  # outputs or chained specs: ["output_1", "output_2"]
    expression: Optional[str] = None  # e.g. "output_1 + output_2"
    rules: Optional[List[Dict[str, str]]] = None  # e.g. [{"condition": "len(markers_positive) > 0 and len(markers_negative) > 0", "value": "Mixed"}]
    default_value: Optional[str] = None  # fallback value when no conditional rule matches
    apply_to_nested: bool = False  # apply rule to each nested dimension/object in parsed_json
    target_blocks: Optional[List[str]] = None  # optional subset of block names when apply_to_nested is True
    inject_into_output: bool = False  # inject derived value into evaluation copy for metrics & 1vs1
    ground_truth_col: Optional[str] = None
    tolerance: Optional[float] = 0.05
    description: Optional[str] = ""

class OutputFieldSpec(BaseModel):
    name: str = "resultado"
    type: str = "numeric"  # "numeric", "categorical", "aspect_list", "text", "boolean"
    ground_truth_col: Optional[str] = None
    metrics: List[str] = Field(default_factory=lambda: ["mae", "tolerance_match"])
    tolerance: Optional[float] = 0.05

class EvaluationSpec(BaseModel):
    task_type: str = "numeric_math"  # "numeric_math", "aspect_polarity", "classification", "structured_json", "custom"
    description: Optional[str] = ""
    output_schema: Optional[Dict[str, Any]] = Field(default_factory=dict)
    output_fields: List[OutputFieldSpec] = Field(default_factory=list)
    computed_specs: List[ComputedSpec] = Field(default_factory=list)
    dimensions: List[str] = Field(default_factory=list)
    polarity_field: Optional[str] = "sentiment"
    verbatim_field: Optional[str] = "verbatim_quote"
    source_text_col: Optional[str] = None
    rating_col: Optional[str] = None
    metrics: List[str] = Field(default_factory=list)
    metric_bindings: Dict[str, Union[List[str], Dict[str, List[str]]]] = Field(default_factory=dict)
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
    active_batteries: List[str] = Field(default_factory=lambda: ["pilar_1", "pilar_2", "pilar_3", "pilar_4"])
    methodology_config: Optional[Dict[str, Any]] = Field(default_factory=dict)
    custom_batteries: List[Dict[str, Any]] = Field(default_factory=list)

class PromptTemplateRequest(BaseModel):
    dataset_id: str
    task_type: str = "numeric_math"  # "numeric_math", "aspect_polarity", "classification", "structured_json", "custom", "aaker_dimensions"
    input_text_columns: List[str] = Field(default_factory=list)
    context_columns: List[str] = Field(default_factory=list)
    ground_truth_column: Optional[str] = None
    custom_dimensions: Optional[List[str]] = None
    eval_spec: Optional[EvaluationSpec] = None

class GeneratedPromptResponse(BaseModel):
    task_type: str
    template: str
    prompt_text: Optional[str] = ""
    output_schema: Dict[str, Any] = Field(default_factory=dict)
    computed_specs: List[ComputedSpec] = Field(default_factory=list)
    variables: List[str]
    system_prompt: str
    output_format: str = "json"  # "json", "structured_blocks", "numeric"
    expected_schema: Dict[str, Any] = Field(default_factory=dict)
    detected_metrics: List[str] = Field(default_factory=list)
    eval_spec: Optional[EvaluationSpec] = None

class PromptValidationIssue(BaseModel):
    severity: str  # "error", "warning", "info"
    message: str
    suggestion: Optional[str] = None

class PromptValidationRequest(BaseModel):
    dataset_id: str
    template: str
    system_prompt: Optional[str] = None
    ground_truth_column: Optional[str] = None
    allowed_columns: Optional[List[str]] = None

class PromptValidationResponse(BaseModel):
    is_valid: bool
    output_format: str = "json"
    task_type: str = "generic"
    prompt_text: Optional[str] = ""
    output_schema: Dict[str, Any] = Field(default_factory=dict)
    computed_specs: List[ComputedSpec] = Field(default_factory=list)
    detected_outputs: List[str] = Field(default_factory=list)
    detected_variables: List[str]
    missing_variables: List[str]
    detected_dimensions: List[str] = Field(default_factory=list)
    detected_metrics: List[str] = Field(default_factory=list)
    eval_spec: Optional[EvaluationSpec] = None
    has_ground_truth: bool = False
    ground_truth_col: Optional[str] = None
    issues: List[PromptValidationIssue]
    preview_rendered: Optional[str] = None

