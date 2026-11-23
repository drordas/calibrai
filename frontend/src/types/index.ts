export interface ColumnInfo {
  name: string;
  data_type: string;
  sample_values: string[];
  null_count: number;
  unique_count?: number;
  is_unique?: boolean;
  is_id_candidate?: boolean;
}

export interface DatasetSummary {
  id: string;
  name: string;
  filename: string;
  format: string;
  total_rows: number;
  size_bytes: number;
  columns: ColumnInfo[];
  is_sample: boolean;
  detected_id_column?: string;
  is_ground_truth?: boolean;
  benchmark_id?: string;
  is_shared?: boolean;
  is_shared_by_owner?: boolean;
  share_mode?: "view" | "edit" | "copy" | string | null;
  share_status?: "pending" | "accepted" | string | null;
  shared_by?: string | null;
  share_id?: number | null;
}

export interface ShareUser {
  id: number;
  username: string;
  full_name?: string | null;
}

export interface ShareEntry {
  id: number;
  target_user_id: number;
  target_username: string;
  share_mode: "view" | "edit" | "copy" | string;
  status: "pending" | "accepted" | string;
}

export interface AppNotification {
  id: string;
  type: "experiment_completed" | "dataset_shared" | "experiment_shared";
  title: string;
  resource_id: string;
  share_id?: number;
  share_mode?: string;
  from_username?: string;
  is_read?: boolean;
  created_at?: string | null;
}

export interface PaginatedRowsResponse {
  dataset_id: string;
  total_rows: number;
  offset: number;
  limit: number;
  columns: string[];
  rows: Record<string, any>[];
}

export interface ModelCatalogItem {
  id: string;
  name: string;
  provider: "ollama" | "openai" | "gemini" | "anthropic" | "groq" | string;
  is_local: boolean;
  context_window: number;
  cost_per_million_input: number;
  cost_per_million_output: number;
  is_available: boolean;
  description: string;
  size_bytes?: number;
  parameter_size?: string;
  quantization_level?: string;
  estimated_vram_gb?: number;
}

export interface DiscoverLocalResponse {
  is_online: boolean;
  resolved_url: string;
  models: ModelCatalogItem[];
  excluded_remote_models?: number;
  error?: string | null;
}

export interface DiscoverRemoteResponse {
  is_valid: boolean;
  provider: string;
  models: ModelCatalogItem[];
  error?: string | null;
}

export interface DetectVramResponse {
  detected: boolean;
  is_local: boolean;
  gpu_name?: string | null;
  vram_gb?: number | null;
  recommended_options: number[];
  error?: string | null;
  message?: string | null;
}

export interface ContextCalculationRequest {
  dataset_id: string;
  input_columns: string[];
  context_columns?: string[];
  template?: string;
  completion_tokens?: number;
}

export interface ContextCalculationResponse {
  dataset_id: string;
  total_rows_evaluated: number;
  columns_evaluated: string[];
  fixed_prompt_chars: number;
  fixed_prompt_tokens: number;
  max_injected_chars: number;
  max_injected_tokens: number;
  max_total_chars: number;
  estimated_prompt_tokens: number;
  completion_tokens: number;
  total_raw_tokens: number;
  required_context_tokens: number;
  avg_injected_chars?: number;
  avg_injected_tokens?: number;
  avg_prompt_tokens?: number;
  avg_total_raw_tokens?: number;
  explanation: string;
}

export interface GeneratedPromptResponse {
  task_type: string;
  template: string;
  prompt_text?: string;
  output_schema?: Record<string, any>;
  computed_specs?: ComputedSpec[];
  variables: string[];
  system_prompt: string;
  output_format?: string;
  detected_metrics?: string[];
  eval_spec?: EvaluationSpec;
}

export interface ComputedSpec {
  name: string;
  function: string;
  expression?: string;
  arguments: string[];
  ground_truth_col?: string;
  tolerance?: number;
  description?: string;
}

export interface OutputFieldSpec {
  name: string;
  type: string;
  ground_truth_col?: string;
  metrics: string[];
  tolerance?: number;
}

export interface CustomBatteryConfig {
  id: string;
  name: string;
  description?: string;
  target_fields: string[];
  metric_type: "agreement" | "correlation" | "rule_check" | "custom_formula";
  formula_expression?: string;
}

export interface MethodologyConfig {
  active_batteries: string[];
  pilar_1?: {
    source_text_col?: string;
    quote_fields?: string[];
    verbatim_mode?: "tolerant" | "strict";
  };
  pilar_2?: {
    target_fields?: string[];
  };
  pilar_3?: {
    count_fields?: string[];
  };
  pilar_4?: {
    rating_col?: string;
  };
  custom_batteries?: CustomBatteryConfig[];
}

export interface EvaluationSpec {
  task_type: string;
  description?: string;
  output_schema?: Record<string, any>;
  output_fields?: OutputFieldSpec[];
  computed_specs?: ComputedSpec[];
  dimensions?: string[];
  polarity_field?: string;
  verbatim_field?: string;
  source_text_col?: string;
  rating_col?: string;
  metrics?: string[];
  active_batteries?: string[];
  methodology_config?: MethodologyConfig;
  custom_batteries?: CustomBatteryConfig[];
}

export interface PromptValidationIssue {
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
}

export interface PromptValidationResponse {
  is_valid: boolean;
  output_format?: string;
  task_type?: string;
  prompt_text?: string;
  output_schema?: Record<string, any>;
  computed_specs?: ComputedSpec[];
  detected_outputs?: string[];
  detected_variables: string[];
  missing_variables: string[];
  detected_dimensions?: string[];
  detected_metrics?: string[];
  eval_spec?: EvaluationSpec;
  has_ground_truth?: boolean;
  ground_truth_col?: string;
  issues: PromptValidationIssue[];
  preview_rendered?: string;
}

export interface MetricCard {
  id: string;
  label: string;
  value: number;
  formatted: string;
  unit: string;
  higher_is_better: boolean;
  description: string;
}

export interface ModelBenchmarkSummary {
  model_id: string;
  total_samples: number;
  mean_latency_ms: number;
  throughput_tokens_sec: number;
  total_cost_usd: number;
  json_validity_rate: number;
  success_rate: number;
  internal_consistency_score: number;
  verbatim_faithfulness_rate?: number;
  rule_consistency_rate?: number;
  dimension_activation_rates?: Record<string, number>;
  metric_cards: MetricCard[];
  computed_specs_summary?: Record<string, {
    name: string;
    function: string;
    expression?: string;
    arguments: string[];
    mean: number;
    min: number;
    max: number;
    std: number;
    count: number;
    description?: string;
  }>;
  task_type?: string;
  is_human_baseline?: boolean;
  model_name?: string;
}


export interface PairwiseComparison {
  model_a: string;
  model_b: string;
  cohens_kappa: number;
  krippendorff_alpha?: number;
  polarity_count_agreement: number;
  icc_2_1?: number;
  raw_agreement_rate: number;
  pearson_correlation?: number;
  mean_absolute_difference?: number;
  samples_compared: number;
  dimension_agreements?: Record<string, number>;
  evaluated_fields?: string[];
  task_type?: string;
  is_vs_human?: boolean;
  human_baseline_ratio?: number;
}

export interface ModelAuditResponse {
  experiment_id: string;
  model_id: string;
  id_column?: string | null;
  total_samples: number;
  verbatim_mode?: "tolerant" | "strict";
  evaluated_fields: string[];
  verbatim_failures: {
    sample_index: number;
    sample_id?: string;
    id_column?: string;
    source_text: string;
    context_fields?: { name: string; value: string; role: "context" | "spec" }[];
    spec_fields?: { name: string; value: string; role: "context" | "spec" }[];
    hallucinated_quotes: string[];
  }[];
  typo_corrections?: {
    sample_index: number;
    sample_id?: string;
    id_column?: string;
    source_text: string;
    context_fields?: { name: string; value: string; role: "context" | "spec" }[];
    spec_fields?: { name: string; value: string; role: "context" | "spec" }[];
    corrected_quotes: {
      quote: string;
      matched_span?: string | null;
      similarity: number;
    }[];
  }[];
  disjointness_failures: {
    sample_index: number;
    sample_id?: string;
    id_column?: string;
    source_text: string;
    context_fields?: { name: string; value: string; role: "context" | "spec" }[];
    spec_fields?: { name: string; value: string; role: "context" | "spec" }[];
    overlapping_quotes: { quote: string; types: string[] }[];
  }[];
  rule_failures: {
    sample_index: number;
    sample_id?: string;
    id_column?: string;
    source_text: string;
    context_fields?: { name: string; value: string; role: "context" | "spec" }[];
    spec_fields?: { name: string; value: string; role: "context" | "spec" }[];
    rule_broken: string;
    details: string;
  }[];
}

export interface PairwiseAuditResponse {
  experiment_id: string;
  model_a: string;
  model_b: string;
  id_column?: string | null;
  evaluated_fields: string[];
  total_compared: number;
  total_aspect_evaluations: number;
  agreements_count: number;
  disagreements_count: number;
  samples_with_discrepancy: number;
  discrepancies: {
    sample_index: number;
    sample_id?: string;
    id_column?: string;
    source_text: string;
    context_fields?: { name: string; value: string; role: "context" | "spec" }[];
    spec_fields?: { name: string; value: string; role: "context" | "spec" }[];
    differences: {
      dimension: string;
      model_a_val: string;
      model_b_val: string;
      quotes_a: string[];
      quotes_b: string[];
      typed_quotes_a?: { quote: string; polarity: "positive" | "negative" | "neutral"; is_verbatim: boolean }[];
      typed_quotes_b?: { quote: string; polarity: "positive" | "negative" | "neutral"; is_verbatim: boolean }[];
    }[];
  }[];
}

export interface MetricParameterSlot {
  key: string;
  label: string;
  description?: string;
  multiple?: boolean;
  allowedTypes?: Array<"output" | "spec" | "spec_col" | "context" | "input" | "id" | "gt">;
  specialOptions?: { value: string; label: string }[];
}

export interface MetricCatalogItem {
  id: string;
  name: string;
  category: "textual" | "consensus" | "congruence" | "operational" | "statistical" | "custom";
  categoryLabel: string;
  shortDesc: string;
  formulaTex: string;
  variables: { symbol: string; label: string }[];
  parameterSlots?: MetricParameterSlot[];
  interpretation: { range: string; label: string; badgeVariant?: string }[];
  citation: string;
  higherIsBetter: boolean;
  defaultEnabled?: boolean;
}

export interface User {
  id: number;
  username: string;
  full_name?: string;
  email?: string | null;
  is_active: boolean;
}

export interface UserConfig {
  ollama_url: string;
  default_sample_size: number;
  default_task_type: string;
  selected_models: string[];
  api_keys: Record<string, string>;
  language?: "es" | "uk" | "usa" | string;
}

export interface SavedBenchmarkSummary {
  id: string;
  name: string;
  description?: string;
  dataset_id: string;
  dataset_name: string;
  task_type: string;
  model_ids: string[];
  sample_size: number;
  created_at: string;
  model_count: number;
}

export interface SavedBenchmarkDetail {
  id: string;
  name: string;
  description?: string;
  dataset_id: string;
  dataset_name: string;
  task_type: string;
  template: string;
  system_prompt?: string;
  model_ids: string[];
  sample_size: number;
  model_summaries: Record<string, ModelBenchmarkSummary>;
  pairwise_matrix: PairwiseComparison[];
  best_performers: Record<string, string>;
  created_at: string;
}

export interface ExperimentSummary {
  id: string;
  name: string;
  description?: string;
  dataset_id: string;
  dataset_name: string;
  model_ids: string[];
  ground_truth_dataset_id?: string;
  ground_truth_dataset_ids?: string[];
  ground_truth_name?: string;
  task_type: string;
  sample_size: number;
  execution_mode: "sequential" | "parallel";
  status: "draft" | "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
  current_model_index: number;
  current_sample_index: number;
  total_samples: number;
  progress_pct: number;
  eval_spec?: Record<string, any>;
  summaries?: Record<string, ModelBenchmarkSummary>;
  created_at: string;
  started_at?: string;
  paused_at?: string;
  completed_at?: string;
  error_message?: string;
  is_shared?: boolean;
  is_shared_by_owner?: boolean;
  share_mode?: "view" | "edit" | "copy" | string | null;
  share_status?: "pending" | "accepted" | string | null;
  shared_by?: string | null;
  share_id?: number | null;
}

export interface ExperimentDetail extends ExperimentSummary {
  input_columns: string[];
  context_columns: string[];
  spec_columns?: string[];
  id_column?: string;
  template: string;
  system_prompt?: string;
  eval_spec?: Record<string, any>;
  raw_results: Record<string, any[]>;
  summaries: Record<string, ModelBenchmarkSummary>;
  pairwise_matrix: PairwiseComparison[];
  best_performers: Record<string, string>;
  model_temperatures?: Record<string, number>;
  updated_at?: string;
}

export interface ExperimentCreateRequest {
  name: string;
  description?: string;
  dataset_id: string;
  dataset_name?: string;
  input_columns: string[];
  context_columns: string[];
  spec_columns?: string[];
  id_column?: string;
  model_ids: string[];
  ground_truth_dataset_id?: string;
  ground_truth_dataset_ids?: string[];
  ground_truth_name?: string;
  template: string;
  system_prompt?: string;
  task_type?: string;
  eval_spec?: Record<string, any>;
  sample_size: number;
  execution_mode: "sequential" | "parallel";
  model_temperatures?: Record<string, number>;
}
