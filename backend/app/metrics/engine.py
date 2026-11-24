import ast
import difflib
import math
import re
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field
from backend.app.schemas.prompt import EvaluationSpec, ComputedSpec


def normalize_for_verbatim(text: str) -> str:
    """
    Normalizes text for verbatim substring matching:
    - Lowercases
    - Unifies typographic quotes/apostrophes and dashes
    - Collapses multiple consecutive whitespaces/newlines into a single space
    - Strips surrounding quotes and whitespace
    """
    if not text:
        return ""
    s = str(text).lower()
    # Unify smart quotes/apostrophes and dashes
    s = (
        s.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u00a0", " ")
    )
    # Collapse consecutive whitespace (e.g. double spaces after periods or mid-sentence)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def classify_verbatim_quote(quote: str, raw_source: str, typo_threshold: float = 0.88) -> Dict[str, Any]:
    """
    Classifies a quote against raw_source into 3 tiers:
    - 'exact': Exact substring match after whitespace/punctuation normalization.
    - 'typo_corrected': Minor typo or spelling correction (e.g. 'quailty' -> 'quality', 'flavour' -> 'flavor')
      with character similarity >= typo_threshold.
    - 'hallucinated': Genuine hallucination or semantic paraphrase.
    Returns:
      {
        "status": "exact" | "typo_corrected" | "hallucinated",
        "similarity": float,
        "matched_span": Optional[str]
      }
    """
    norm_q = normalize_for_verbatim(quote).strip('"\'.,;:!? ')
    if not norm_q or norm_q in ["blank", "none"]:
        return {"status": "exact", "similarity": 1.0, "matched_span": None}

    norm_src = normalize_for_verbatim(raw_source)
    if not norm_src:
        return {"status": "hallucinated", "similarity": 0.0, "matched_span": None}

    # 1. Tier 1: Exact substring match (after whitespace normalization)
    if norm_q in norm_src:
        return {"status": "exact", "similarity": 1.0, "matched_span": None}

    # Also check stripping internal punctuation differences (e.g. missing comma)
    alnum_q = re.sub(r"[^\w\s]", "", norm_q)
    alnum_q = re.sub(r"\s+", " ", alnum_q).strip()
    alnum_src = re.sub(r"[^\w\s]", "", norm_src)
    alnum_src = re.sub(r"\s+", " ", alnum_src).strip()
    if alnum_q and alnum_q in alnum_src:
        return {"status": "exact", "similarity": 1.0, "matched_span": None}

    # 2. Tier 2: Word-window sliding comparison on raw_source to detect minor typo corrections
    # Tokenize raw_source keeping word spans so we can extract the exact original substring
    src_tokens = list(re.finditer(r"\S+", raw_source))
    q_words = norm_q.split()
    k = len(q_words)
    if not src_tokens or k == 0:
        return {"status": "hallucinated", "similarity": 0.0, "matched_span": None}

    best_ratio = 0.0
    best_span = None

    # Search window sizes around k (k-1 to k+1 words)
    min_w = max(1, k - 1)
    max_w = min(len(src_tokens), k + 1)

    for w in range(min_w, max_w + 1):
        for i in range(len(src_tokens) - w + 1):
            start_char = src_tokens[i].start()
            end_char = src_tokens[i + w - 1].end()
            candidate_raw = raw_source[start_char:end_char]
            candidate_norm = normalize_for_verbatim(candidate_raw).strip('"\'.,;:!? ')
            if not candidate_norm:
                continue
            # Quick length filter
            if abs(len(candidate_norm) - len(norm_q)) > max(6, int(len(norm_q) * 0.25)):
                continue
            ratio = difflib.SequenceMatcher(None, norm_q, candidate_norm).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_span = candidate_raw.strip('.,;:!?"\' ')

    if best_ratio >= typo_threshold:
        return {
            "status": "typo_corrected",
            "similarity": round(best_ratio * 100.0, 1),
            "matched_span": best_span
        }

    return {
        "status": "hallucinated",
        "similarity": round(best_ratio * 100.0, 1),
        "matched_span": best_span if best_ratio >= 0.65 else None
    }


def is_verbatim_match(quote: str, raw_or_norm_source: str, mode: str = "tolerant") -> bool:
    """
    Checks if a quote matches the source text according to the chosen rigor mode:
    - 'strict': Only exact match (after whitespace/quote normalization).
    - 'tolerant' (default): Accepts exact match AND minor typo corrections (>= 88% similarity).
    """
    res = classify_verbatim_quote(quote, raw_or_norm_source)
    if mode == "strict":
        return res["status"] == "exact"
    return res["status"] in ["exact", "typo_corrected"]



class MetricCard(BaseModel):
    id: str
    label: str
    value: float
    formatted: str
    unit: str = ""
    higher_is_better: bool = True
    description: str = ""

class ModelBenchmarkSummary(BaseModel):
    model_id: str
    total_samples: int
    mean_latency_ms: float
    throughput_tokens_sec: float
    total_cost_usd: float
    json_validity_rate: float
    success_rate: float
    internal_consistency_score: float
    verbatim_faithfulness_rate: float = 100.0
    rule_consistency_rate: float = 100.0
    dimension_activation_rates: Dict[str, float] = Field(default_factory=dict)
    metric_cards: List[MetricCard] = Field(default_factory=list)
    computed_specs_summary: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    task_type: str = "generic"

def _to_numeric(val: Any) -> float:
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, list):
        return float(len(val))
    if isinstance(val, str):
        try:
            return float(val)
        except ValueError:
            return 0.0
    return 0.0

def evaluate_safe_math_expression(expr: str, env: Dict[str, Any]) -> float:
    """Safely evaluates a basic mathematical expression using Python AST and env variables."""
    try:
        node = ast.parse(expr.strip(), mode='eval')
        def _eval_raw(node):
            if isinstance(node, ast.Expression):
                return _eval_raw(node.body)
            elif isinstance(node, ast.Constant):
                return node.value
            elif isinstance(node, ast.Num):
                return node.n
            elif isinstance(node, ast.Name):
                return env.get(node.id, 0.0)
            elif isinstance(node, ast.Attribute):
                parent = _eval_raw(node.value)
                if isinstance(parent, dict):
                    return parent.get(node.attr, 0.0)
                # Check flattened env fallback
                flat_key = f"{getattr(node.value, 'id', '')}.{node.attr}"
                return env.get(flat_key, 0.0)
            elif isinstance(node, ast.BinOp):
                left = _to_numeric(_eval_raw(node.left))
                right = _to_numeric(_eval_raw(node.right))
                if isinstance(node.op, ast.Add): return left + right
                elif isinstance(node.op, ast.Sub): return left - right
                elif isinstance(node.op, ast.Mult): return left * right
                elif isinstance(node.op, ast.Div): return left / right if right != 0 else 0.0
                elif isinstance(node.op, ast.Mod): return left % right if right != 0 else 0.0
                elif isinstance(node.op, ast.Pow): return left ** min(right, 10.0)
                else: return 0.0
            elif isinstance(node, ast.UnaryOp):
                operand = _to_numeric(_eval_raw(node.operand))
                if isinstance(node.op, ast.UAdd): return +operand
                elif isinstance(node.op, ast.USub): return -operand
                else: return operand
            elif isinstance(node, ast.Call):
                func_name = node.func.id.lower() if isinstance(node.func, ast.Name) else ""
                args = [_to_numeric(_eval_raw(a)) for a in node.args]
                if func_name in ["abs", "absoluto"]: return abs(args[0]) if args else 0.0
                elif func_name in ["suma", "sum"]: return sum(args)
                elif func_name in ["promedio", "mean", "avg"]: return sum(args) / len(args) if args else 0.0
                elif func_name in ["max", "maximo"]: return max(args) if args else 0.0
                elif func_name in ["min", "minimo"]: return min(args) if args else 0.0
                elif func_name in ["round", "redondear"]: return round(args[0], int(args[1])) if len(args) > 1 else round(args[0])
                elif func_name in ["diff", "diferencia"]: return abs(args[0] - args[1]) if len(args) > 1 else 0.0
                elif func_name == "nss":
                    tot = args[0] + args[1]
                    return (args[0] - args[1]) / tot if tot > 0 else 0.0
                return 0.0
            else:
                return 0.0
        return _to_numeric(_eval_raw(node))
    except Exception:
        return 0.0

def _flatten_dict_for_env(d: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
    flat = {}
    for k, v in d.items():
        full_key = f"{prefix}.{k}" if prefix else k
        flat[full_key] = v
        flat[full_key.replace(".", "_")] = v
        if isinstance(v, dict):
            flat.update(_flatten_dict_for_env(v, full_key))
    return flat

def evaluate_computed_specs(
    row_context: Dict[str, Any],
    parsed_json: Dict[str, Any],
    computed_specs: List[ComputedSpec]
) -> Dict[str, Any]:
    """
    Evaluates interactive evaluation specs row-by-row, supporting spec chaining and
    methodological metrics from docs/ValidationMethodology.md.
    """
    env: Dict[str, Any] = {}
    if row_context:
        env.update(_flatten_dict_for_env(row_context))
        for k, v in row_context.items():
            try:
                env[k] = float(v)
            except (ValueError, TypeError):
                env[k] = v
    if parsed_json:
        env.update(_flatten_dict_for_env(parsed_json))
        for k, v in parsed_json.items():
            try:
                env[k] = float(v)
            except (ValueError, TypeError):
                env[k] = v

    results: Dict[str, Any] = {}
    for spec in computed_specs:
        fn = (spec.function or "").lower()
        args = spec.arguments or []

        resolved_vals = []
        for a in args:
            resolved_vals.append(env.get(a, 0.0))

        val = 0.0

        if spec.expression and spec.expression.strip():
            val = evaluate_safe_math_expression(spec.expression, env)

        # 1. Classical arithmetic
        elif fn in ["suma", "sum", "add"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = sum(num_vals) if num_vals else 0.0

        elif fn in ["resta", "sub", "subtract"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            if len(num_vals) >= 2:
                val = num_vals[0] - num_vals[1]
            elif len(num_vals) == 1:
                val = num_vals[0]
            else:
                val = 0.0

        elif fn in ["multiplicacion", "mult", "multiply"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = 1.0
            for v in num_vals:
                val *= v
            if not num_vals:
                val = 0.0

        elif fn in ["division", "div", "divide"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            if len(num_vals) >= 2 and num_vals[1] != 0:

                val = num_vals[0] / num_vals[1]
            elif len(num_vals) == 1:
                val = num_vals[0]
            else:
                val = 0.0

        elif fn in ["promedio", "mean", "avg"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = sum(num_vals) / len(num_vals) if num_vals else 0.0

        elif fn in ["max", "maximo"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = max(num_vals) if num_vals else 0.0

        elif fn in ["min", "minimo"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = min(num_vals) if num_vals else 0.0

        elif fn in ["abs", "absoluto"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = abs(num_vals[0]) if num_vals else 0.0

        elif fn in ["diff", "diferencia"]:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = abs(num_vals[0] - num_vals[1]) if len(num_vals) >= 2 else 0.0

        # 2. ValidationMethodology.md functions
        elif fn in ["nss", "net_sentiment_score"]:
            pos_val = float(resolved_vals[0]) if len(resolved_vals) > 0 and isinstance(resolved_vals[0], (int, float)) else 0.0
            neg_val = float(resolved_vals[1]) if len(resolved_vals) > 1 and isinstance(resolved_vals[1], (int, float)) else 0.0
            total_polar = pos_val + neg_val
            val = (pos_val - neg_val) / total_polar if total_polar > 0 else 0.0

        elif fn in ["internal_consistency", "consistencia_interna"]:
            pos_m = set(resolved_vals[0]) if len(resolved_vals) > 0 and isinstance(resolved_vals[0], list) else set()
            neg_m = set(resolved_vals[1]) if len(resolved_vals) > 1 and isinstance(resolved_vals[1], list) else set()
            neu_m = set(resolved_vals[2]) if len(resolved_vals) > 2 and isinstance(resolved_vals[2], list) else set()
            has_overlap = bool((pos_m & neg_m) or (pos_m & neu_m) or (neg_m & neu_m))
            val = 0.0 if has_overlap else 100.0

        elif fn in ["rule_consistency", "consistencia_reglas"]:
            sent = str(resolved_vals[0] if len(resolved_vals) > 0 else "").lower()
            pos_cnt = len(resolved_vals[1]) if len(resolved_vals) > 1 and isinstance(resolved_vals[1], list) else (float(resolved_vals[1]) if len(resolved_vals) > 1 and isinstance(resolved_vals[1], (int, float)) else 0)
            neg_cnt = len(resolved_vals[2]) if len(resolved_vals) > 2 and isinstance(resolved_vals[2], list) else (float(resolved_vals[2]) if len(resolved_vals) > 2 and isinstance(resolved_vals[2], (int, float)) else 0)
            if pos_cnt > 0 and neg_cnt > 0:
                expected = "mixed"
            elif pos_cnt > 0:
                expected = "positive"
            elif neg_cnt > 0:
                expected = "negative"
            else:
                expected = "neutral"
            val = 100.0 if sent == expected or (expected in sent) else 0.0

        elif fn in ["verbatim_faithfulness", "fidelidad_verbatim"]:
            quotes = resolved_vals[0] if len(resolved_vals) > 0 else []
            raw_src = str(resolved_vals[1] if len(resolved_vals) > 1 else (row_context.get("review_comment", "") if row_context else ""))
            src_text = normalize_for_verbatim(raw_src)
            if not quotes:
                val = 100.0
            else:
                q_list = quotes if isinstance(quotes, list) else [str(quotes)]
                valid_q = sum(1 for q in q_list if is_verbatim_match(str(q), src_text))
                val = (valid_q / len(q_list)) * 100.0 if q_list else 100.0

        elif fn in ["tolerance_match", "tolerancia_gt"]:
            pred_v = float(resolved_vals[0]) if len(resolved_vals) > 0 and isinstance(resolved_vals[0], (int, float)) else 0.0
            gt_v = float(resolved_vals[1]) if len(resolved_vals) > 1 and isinstance(resolved_vals[1], (int, float)) else 0.0
            tol = spec.tolerance or 0.05
            val = 100.0 if abs(pred_v - gt_v) <= tol * max(abs(gt_v), 1.0) else 0.0

        elif spec.expression:
            val = evaluate_safe_math_expression(spec.expression, env)

        else:
            num_vals = [float(v) for v in resolved_vals if isinstance(v, (int, float))]
            val = num_vals[0] if num_vals else 0.0

        results[spec.name] = val
        env[spec.name] = val

    return results

def attach_computed_specs_to_summary(
    summary: ModelBenchmarkSummary,
    results: List[Dict[str, Any]],
    eval_spec: Optional[EvaluationSpec]
) -> ModelBenchmarkSummary:
    """Evaluates and attaches computed specs to ModelBenchmarkSummary and raw results."""
    if not eval_spec or not eval_spec.computed_specs or not results:
        return summary

    for r in results:
        r_ctx = r.get("row_context") or {}
        p_json = r.get("parsed_json") or {}
        r["computed_specs"] = evaluate_computed_specs(r_ctx, p_json, eval_spec.computed_specs)

    computed_summary: Dict[str, Dict[str, Any]] = {}
    spec_cards: List[MetricCard] = []

    for spec in eval_spec.computed_specs:
        spec_vals = [r.get("computed_specs", {}).get(spec.name, 0.0) for r in results if "computed_specs" in r]
        num_vals = [float(v) for v in spec_vals if isinstance(v, (int, float))]
        mean_v = float(np.mean(num_vals)) if num_vals else 0.0
        min_v = float(np.min(num_vals)) if num_vals else 0.0
        max_v = float(np.max(num_vals)) if num_vals else 0.0
        std_v = float(np.std(num_vals)) if num_vals else 0.0

        is_pct = spec.function in ["internal_consistency", "rule_consistency", "verbatim_faithfulness", "tolerance_match"]
        formatted_v = f"{mean_v:.1f}%" if is_pct else f"{mean_v:.2f}"
        unit_v = "%" if is_pct else ""

        computed_summary[spec.name] = {
            "name": spec.name,
            "function": spec.function,
            "expression": spec.expression,
            "arguments": spec.arguments,
            "mean": round(mean_v, 3),
            "min": round(min_v, 3),
            "max": round(max_v, 3),
            "std": round(std_v, 3),
            "count": len(num_vals),
            "description": spec.description or f"Spec: {spec.name}"
        }

        spec_cards.append(MetricCard(
            id=f"spec_{spec.name}",
            label=spec.name.replace("_", " ").title(),
            value=round(mean_v, 2),
            formatted=formatted_v,
            unit=unit_v,
            higher_is_better=True,
            description=spec.description or f"Spec calculada ({spec.function}): {spec.name}"
        ))

    summary.computed_specs_summary = computed_summary
    summary.metric_cards = spec_cards + summary.metric_cards
    return summary


class PairwiseComparison(BaseModel):
    model_a: str
    model_b: str
    cohens_kappa: float = 0.0
    krippendorff_alpha: float = 0.0
    polarity_count_agreement: float = 0.0
    icc_2_1: float = 0.0
    raw_agreement_rate: float = 0.0
    pearson_correlation: float = 1.0
    mean_absolute_difference: float = 0.0
    samples_compared: int = 0
    dimension_agreements: Dict[str, float] = Field(default_factory=dict)
    evaluated_fields: List[str] = Field(default_factory=list)
    task_type: str = "generic"
    is_vs_human: bool = False
    human_baseline_ratio: Optional[float] = None

def calculate_krippendorff_alpha_nominal(labels_a: List[str], labels_b: List[str]) -> float:
    """Calculates Krippendorff's alpha for nominal categorical agreement."""
    if len(labels_a) != len(labels_b) or len(labels_a) == 0:
        return 0.0
    n = len(labels_a)
    do = sum(1 for a, b in zip(labels_a, labels_b) if a != b) / n
    from collections import Counter
    counts = Counter(labels_a + labels_b)
    total = 2 * n
    sum_nc_sq = sum(c**2 for c in counts.values())
    de = (total**2 - sum_nc_sq) / (total * (total - 1)) if total > 1 else 0
    if de == 0:
        return 1.0 if do == 0 else 0.0
    alpha = 1.0 - (do / de)
    return round(float(np.clip(alpha, -1.0, 1.0)), 4)

def calculate_polarity_icc(counts_a: List[int], counts_b: List[int]) -> float:
    """
    Computes ICC(2,1) / ICC(A,1) (two-way random, single rater, absolute agreement)
    on polarity snippet counts using pingouin.
    """
    if len(counts_a) != len(counts_b) or len(counts_a) < 3:
        return 1.0 if counts_a == counts_b else 0.0
    try:
        import pandas as pd
        import pingouin as pg
        n = len(counts_a)
        df = pd.DataFrame({
            "targets": list(range(n)) + list(range(n)),
            "raters": ["A"] * n + ["B"] * n,
            "ratings": [float(x) for x in counts_a] + [float(x) for x in counts_b]
        })
        if df["ratings"].std() == 0:
            return 1.0 if counts_a == counts_b else 0.0
        icc_df = pg.intraclass_corr(data=df, targets="targets", raters="raters", ratings="ratings")
        row = icc_df[icc_df["Type"].str.contains("A,1|2,1", regex=True)]
        if not row.empty:
            val = float(row["ICC"].values[0])
            if math.isnan(val):
                return 1.0 if counts_a == counts_b else 0.0
            return round(float(np.clip(val, -1.0, 1.0)), 4)
        return 0.0
    except Exception:
        return calculate_pearson_correlation([float(x) for x in counts_a], [float(x) for x in counts_b])

def calculate_cohens_kappa(labels_a: List[str], labels_b: List[str], categories: List[str]) -> float:
    """Calculates Cohen's Kappa between two model predictions or model vs ground-truth."""
    if not labels_a or len(labels_a) != len(labels_b):
        return 0.0
    n = len(labels_a)
    if n == 0:
        return 0.0

    po = sum(1 for a, b in zip(labels_a, labels_b) if a == b) / n
    pe = 0.0
    for cat in categories:
        pa = sum(1 for a in labels_a if a == cat) / n
        pb = sum(1 for b in labels_b if b == cat) / n
        pe += pa * pb

    if pe >= 1.0:
        return 1.0
    if 1.0 - pe == 0:
        return 1.0 if po == 1.0 else 0.0

    kappa = (po - pe) / (1.0 - pe)
    return round(float(np.clip(kappa, -1.0, 1.0)), 4)

def calculate_pearson_correlation(vals_a: List[float], vals_b: List[float]) -> float:
    """Calculates Pearson correlation between numeric outputs of two models."""
    if len(vals_a) < 2 or len(vals_a) != len(vals_b):
        return 1.0 if (len(vals_a) > 0 and vals_a == vals_b) else 0.0
    try:
        a = np.array(vals_a, dtype=float)
        b = np.array(vals_b, dtype=float)
        std_a = np.std(a)
        std_b = np.std(b)
        if std_a == 0 or std_b == 0:
            return 1.0 if np.allclose(a, b) else 0.0
        corr = np.corrcoef(a, b)[0, 1]
        return round(float(np.clip(corr, -1.0, 1.0)), 4)
    except Exception:
        return 0.0

def resolve_source_text(row_ctx: Dict[str, Any], eval_spec: Optional[Any] = None, input_columns: Optional[List[str]] = None) -> str:
    """
    Universally resolves the source corpus text from row_ctx:
    1. Configured source_text_col in metric_bindings.verbatim_faithfulness, methodology_config.pilar_1, or eval_spec.source_text_col
    2. Common review/body text column names
    3. Longest string value among experiment input_columns (avoids picking short metadata like enterprise_name)
    4. Longest string value in row_ctx (> 15 chars)
    """
    if not row_ctx or not isinstance(row_ctx, dict):
        return ""

    # 1. Check explicit config in eval_spec
    explicit_candidates: List[str] = []
    if eval_spec:
        if isinstance(eval_spec, dict):
            mb = eval_spec.get("metric_bindings") or {}
            vf_cols = (mb.get("verbatim_faithfulness") or {}).get("source_text_col") if isinstance(mb, dict) else None
            if isinstance(vf_cols, list) and vf_cols:
                explicit_candidates.append(str(vf_cols[0]))
            m_cfg = eval_spec.get("methodology_config") or {}
            p1_col = (m_cfg.get("pilar_1") or {}).get("source_text_col")
            if p1_col:
                explicit_candidates.append(str(p1_col))
            if eval_spec.get("source_text_col"):
                explicit_candidates.append(str(eval_spec["source_text_col"]))
        else:
            mb = getattr(eval_spec, "metric_bindings", None) or {}
            vf_cols = (mb.get("verbatim_faithfulness") or {}).get("source_text_col") if isinstance(mb, dict) else None
            if isinstance(vf_cols, list) and vf_cols:
                explicit_candidates.append(str(vf_cols[0]))
            m_cfg = getattr(eval_spec, "methodology_config", None) or {}
            if isinstance(m_cfg, dict):
                p1_col = (m_cfg.get("pilar_1") or {}).get("source_text_col")
                if p1_col:
                    explicit_candidates.append(str(p1_col))
            if getattr(eval_spec, "source_text_col", None):
                explicit_candidates.append(str(eval_spec.source_text_col))

    for k in explicit_candidates:
        clean_k = k.strip("{}")
        if clean_k in row_ctx and row_ctx[clean_k]:
            return str(row_ctx[clean_k])

    # 2. Check common review/body text column names (prioritized over short metadata columns)
    for k in ["review_comment", "review_text", "comment", "text", "review", "REVIEW", "texto", "contenido", "body"]:
        if k in row_ctx and row_ctx[k]:
            return str(row_ctx[k])

    # 3. Among experiment input_columns, pick the longest text value (avoids picking enterprise_name/title)
    if input_columns:
        input_vals = [
            str(row_ctx[ic.strip("{}")])
            for ic in input_columns
            if ic and ic.strip("{}") in row_ctx and row_ctx[ic.strip("{}")]
        ]
        if input_vals:
            return max(input_vals, key=len)

    # 4. Universal fallback: longest string in row_ctx
    str_vals = [str(v) for v in row_ctx.values() if isinstance(v, str) and len(v.strip()) > 15]
    if str_vals:
        return max(str_vals, key=len)

    return ""


def extract_aspect_items(parsed: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extracts aspect/dimension items universally from:
    - {"aspectos": [...]} or any top-level list of dicts
    - {"dimensions": {...}} or {"ground_truth": {...}}
    - Top-level dimension objects (e.g. {"brand_awareness": {...}, "custom_dim": {...}})
    - Flat top-level quote/polarity structures (e.g. {"sentiment": "Positive", "quotes": [...]})
    """
    if not parsed or not isinstance(parsed, dict):
        return []
    
    if "aspectos" in parsed and isinstance(parsed["aspectos"], list):
        return parsed["aspectos"]
        
    dim_dict = None
    if "dimensions" in parsed and isinstance(parsed["dimensions"], dict):
        dim_dict = parsed["dimensions"]
    elif "ground_truth" in parsed and isinstance(parsed["ground_truth"], dict):
        dim_dict = parsed["ground_truth"]
    else:
        # Check if root has any nested dimension objects
        candidates = {
            k: v for k, v in parsed.items()
            if isinstance(v, dict) and any(
                sk in v for sk in [
                    "sentiment", "polaridad", "polarity",
                    "markers_positive", "markers_negative", "markers_neutral",
                    "citas", "snippets", "quotes", "evidencias", "fragments"
                ]
            )
        }
        if candidates:
            dim_dict = candidates

    if dim_dict:
        items = []
        for dk, dv in dim_dict.items():
            if not isinstance(dv, dict):
                continue
            pol = dv.get("polarity") or dv.get("sentiment") or dv.get("polaridad") or "blank"
            pos_m = dv.get("markers_positive") or dv.get("citas_positivas") or []
            neg_m = dv.get("markers_negative") or dv.get("citas_negativas") or []
            neu_m = dv.get("markers_neutral") or dv.get("citas_neutras") or []
            if isinstance(pos_m, str): pos_m = [pos_m]
            if isinstance(neg_m, str): neg_m = [neg_m]
            if isinstance(neu_m, str): neu_m = [neu_m]
            raw_snips = dv.get("snippets") or dv.get("citas") or dv.get("quotes") or dv.get("evidencias") or dv.get("fragments")
            if isinstance(raw_snips, str):
                raw_snips = [raw_snips]
            snippets = raw_snips or (pos_m + neg_m + neu_m)
            items.append({
                "dimension": dk,
                "polaridad": str(pol).lower(),
                "sentiment": str(pol).lower(),
                "citas": snippets,
                "snippets": snippets,
                "markers_positive": pos_m,
                "markers_negative": neg_m,
                "markers_neutral": neu_m,
                "active": (str(pol).lower() not in ["blank", "none", "inactiva", ""]) or (len(snippets) > 0)
            })
        return items

    # Flat top-level fallback: if the prompt extracts flat quotes/polarity without nested dimensions
    flat_pos = parsed.get("markers_positive") or parsed.get("citas_positivas") or []
    flat_neg = parsed.get("markers_negative") or parsed.get("citas_negativas") or []
    flat_neu = parsed.get("markers_neutral") or parsed.get("citas_neutras") or []
    flat_quotes = parsed.get("citas") or parsed.get("quotes") or parsed.get("snippets") or parsed.get("evidencias") or parsed.get("verbatim_quote") or []
    if isinstance(flat_pos, str): flat_pos = [flat_pos]
    if isinstance(flat_neg, str): flat_neg = [flat_neg]
    if isinstance(flat_neu, str): flat_neu = [flat_neu]
    if isinstance(flat_quotes, str): flat_quotes = [flat_quotes]
    all_flat = flat_quotes or (flat_pos + flat_neg + flat_neu)
    flat_pol = parsed.get("sentiment") or parsed.get("polaridad") or parsed.get("polarity") or parsed.get("polaridad_global") or parsed.get("categoria_asignada")
    if all_flat or flat_pol:
        return [{
            "dimension": "general",
            "polaridad": str(flat_pol or "neutral").lower(),
            "sentiment": str(flat_pol or "neutral").lower(),
            "citas": all_flat,
            "snippets": all_flat,
            "markers_positive": flat_pos,
            "markers_negative": flat_neg,
            "markers_neutral": flat_neu,
            "active": True
        }]

    return []

class MetricsEngine:
    """
    Universal Polymorphic Evaluation Engine.
    Evaluates:
    - Numeric & Mathematical Tasks (MAE, RMSE, Tolerance Match, Exact Match)
    - Aspect & Polarity Labeling (Verbatim Faithfulness, Consistency, Agreement, PCA)
    - Categorical Classification (Accuracy, Macro F1, Cohen's Kappa)
    - Structured Schema Extraction (Validity, Completeness)
    - Operational Metrics (Latency, Throughput, Cost)
    """

    def compute_model_metrics(
        self,
        model_id: str,
        results: List[Dict[str, Any]],
        eval_spec: Optional[EvaluationSpec] = None,
        ground_truth: Optional[List[Dict[str, Any]]] = None
    ) -> ModelBenchmarkSummary:
        if not results:
            return ModelBenchmarkSummary(
                model_id=model_id,
                total_samples=0,
                mean_latency_ms=0.0,
                throughput_tokens_sec=0.0,
                total_cost_usd=0.0,
                json_validity_rate=0.0,
                success_rate=0.0,
                internal_consistency_score=0.0
            )

        total_samples = len(results)
        valid_format_count = sum(1 for r in results if r.get("is_valid_json", False))
        success_count = sum(1 for r in results if r.get("success", True))
        total_latency = sum(r.get("latency_ms", 0.0) for r in results)
        total_tokens = sum(r.get("prompt_tokens", 0) + r.get("completion_tokens", 0) for r in results)
        total_cost = sum(r.get("estimated_cost_usd", 0.0) for r in results)

        mean_latency = total_latency / total_samples if total_samples > 0 else 0.0
        total_sec = total_latency / 1000.0
        throughput = total_tokens / total_sec if total_sec > 0 else 0.0
        format_validity = (valid_format_count / total_samples) * 100.0 if total_samples > 0 else 0.0
        success_rate = (success_count / total_samples) * 100.0 if total_samples > 0 else 0.0

        task_type = eval_spec.task_type if eval_spec else "generic"

        # Check if parsed results contain qualitative aspects/dimensions
        has_aspects = any(bool(extract_aspect_items(r.get("parsed_json") or {})) for r in results[:10])
        target_field = eval_spec.output_fields[0].name if eval_spec and eval_spec.output_fields else "resultado_calculo"
        has_numeric = any(
            any(k in (r.get("parsed_json") or {}) and isinstance((r.get("parsed_json") or {})[k], (int, float))
                for k in [target_field, "resultado_calculo", "resultado", "total", "raw_number"])
            for r in results[:10]
        )

        # Auto-detect or override aspect_polarity if qualitative aspect structures are present
        if (task_type in ["generic", "numeric_math"] and has_aspects and not has_numeric) or task_type == "aaker_dimensions":
            task_type = "aspect_polarity"

        # ══════════════════════════════════════════════════════
        # 1. NUMERIC & MATHEMATICAL TASKS
        # ══════════════════════════════════════════════════════
        if task_type == "numeric_math":
            abs_errors = []
            squared_errors = []
            tolerance_matches = 0
            exact_matches = 0
            evaluated_count = 0

            # Find target field and ground truth column
            target_field = "resultado_calculo"
            gt_col = None
            tol = 0.05
            if eval_spec and eval_spec.output_fields:
                of = eval_spec.output_fields[0]
                target_field = of.name
                gt_col = of.ground_truth_col
                tol = of.tolerance or 0.05

            def _get_nested_val(d: Any, path: str) -> Any:
                if not isinstance(d, dict) or not path:
                    return None
                if path in d:
                    return d[path]
                cur: Any = d
                for part in path.split("."):
                    if isinstance(cur, dict) and part in cur:
                        cur = cur[part]
                    else:
                        return None
                return cur

            for r in results:
                parsed = r.get("parsed_json") or {}
                row_ctx = r.get("row_context") or {}

                # Extract predicted number
                pred_val = None
                for candidate in [target_field, "resultado_calculo", "resultado", "total", "raw_number"]:
                    if candidate in parsed:
                        try:
                            pred_val = float(parsed[candidate])
                            break
                        except (ValueError, TypeError):
                            pass

                # Extract ground truth value
                gt_val = None
                if gt_col and gt_col in row_ctx:
                    try:
                        gt_val = float(row_ctx[gt_col])
                    except (ValueError, TypeError):
                        pass

                # If no explicit gt_col was given, attempt to find first numeric in row_context as benchmark reference
                if gt_val is None:
                    for k, v in row_ctx.items():
                        try:
                            gt_val = float(v)
                            break
                        except (ValueError, TypeError):
                            pass

                if pred_val is not None and gt_val is not None:
                    evaluated_count += 1
                    err = abs(pred_val - gt_val)
                    abs_errors.append(err)
                    squared_errors.append(err ** 2)

                    # Tolerance match: within tolerance percentage or absolute epsilon
                    allowed_tol = max(tol * abs(gt_val), tol)
                    if err <= allowed_tol:
                        tolerance_matches += 1
                    if round(pred_val, 2) == round(gt_val, 2):
                        exact_matches += 1

            mae = float(np.mean(abs_errors)) if abs_errors else 0.0
            rmse = float(np.sqrt(np.mean(squared_errors))) if squared_errors else 0.0
            tol_rate = (tolerance_matches / evaluated_count * 100.0) if evaluated_count > 0 else 100.0
            exact_rate = (exact_matches / evaluated_count * 100.0) if evaluated_count > 0 else 100.0
            internal_consistency = round(tol_rate, 1)

            cards = [
                MetricCard(
                    id="mae",
                    label="MAE (Error Absoluto)",
                    value=round(mae, 3),
                    formatted=f"{mae:.3f}",
                    unit="",
                    higher_is_better=False,
                    description="Error Absoluto Medio (MAE) respecto a la referencia del dataset."
                ),
                MetricCard(
                    id="tolerance",
                    label=f"Precisión Tolerancia (±{int(tol*100)}%)",
                    value=round(tol_rate, 1),
                    formatted=f"{tol_rate:.1f}%",
                    unit="%",
                    higher_is_better=True,
                    description=f"% de predicciones matemáticas dentro del margen de error permitido (±{int(tol*100)}%)."
                ),
                MetricCard(
                    id="rmse",
                    label="RMSE",
                    value=round(rmse, 3),
                    formatted=f"{rmse:.3f}",
                    unit="",
                    higher_is_better=False,
                    description="Raíz del Error Cuadrático Medio (penaliza desviaciones atípicas grandes)."
                ),
                MetricCard(
                    id="exact_match",
                    label="Exactitud Matemática",
                    value=round(exact_rate, 1),
                    formatted=f"{exact_rate:.1f}%",
                    unit="%",
                    higher_is_better=True,
                    description="% de cálculos que coinciden con exactitud estricta."
                ),
                MetricCard(
                    id="json_validity",
                    label="Cumplimiento Esquema",
                    value=round(format_validity, 1),
                    formatted=f"{format_validity:.1f}%",
                    unit="%",
                    higher_is_better=True,
                    description="% de respuestas con formato JSON y clave numérica requerida."
                ),
                MetricCard(
                    id="latency",
                    label="Latencia Media",
                    value=round(mean_latency, 1),
                    formatted=f"{mean_latency:.0f} ms",
                    unit="ms",
                    higher_is_better=False,
                    description="Tiempo de inferencia medio por muestra."
                ),
                MetricCard(
                    id="throughput",
                    label="Throughput",
                    value=round(throughput, 1),
                    formatted=f"{throughput:.1f} tok/s",
                    unit="tok/s",
                    higher_is_better=True,
                    description="Velocidad de generación de tokens."
                ),
                MetricCard(
                    id="cost",
                    label="Coste Estimado",
                    value=round(total_cost, 4),
                    formatted=f"${total_cost:.4f}",
                    unit="$",
                    higher_is_better=False,
                    description="Coste acumulado de inferencia."
                ),
            ]

            summary = ModelBenchmarkSummary(
                model_id=model_id,
                total_samples=total_samples,
                mean_latency_ms=round(mean_latency, 1),
                throughput_tokens_sec=round(throughput, 1),
                total_cost_usd=round(total_cost, 4),
                json_validity_rate=round(format_validity, 1),
                success_rate=round(success_rate, 1),
                internal_consistency_score=internal_consistency,
                verbatim_faithfulness_rate=round(exact_rate, 1),
                rule_consistency_rate=round(tol_rate, 1),
                metric_cards=cards,
                task_type="numeric_math"
            )
            return attach_computed_specs_to_summary(summary, results, eval_spec)


        # ══════════════════════════════════════════════════════
        # 2. ASPECT & POLARITY LABELING (GENERALIZED AAKER ARCHETYPE)
        # ══════════════════════════════════════════════════════
        elif task_type in ["aspect_polarity", "aspect_sentiment", "aaker_dimensions"]:
            # Extract detected dimensions dynamically if not explicitly specified
            if eval_spec and eval_spec.dimensions:
                dimensions = eval_spec.dimensions
            else:
                found_dims = set()
                for r in results[:10]:
                    p = r.get("parsed_json") or {}
                    for item in extract_aspect_items(p):
                        if item.get("dimension"):
                            found_dims.add(item["dimension"])
                if found_dims:
                    dimensions = sorted(list(found_dims))
                else:
                    dimensions = ["brand_awareness", "brand_associations", "perceived_quality", "brand_loyalty"]

            dim_keys = [d.lower().replace(" ", "_") for d in dimensions]
            dim_activations = {d: 0 for d in dim_keys}
            total_snippets = 0
            verbatim_matches = 0
            total_evals = 0
            rule_consistent_evals = 0
            disjoint_consistent_samples = 0
            star_ratings: List[float] = []
            net_sentiment_scores: List[float] = []

            verbatim_mode = "tolerant"
            if eval_spec and getattr(eval_spec, "methodology_config", None):
                p1_cfg = eval_spec.methodology_config.get("pilar_1") or {}
                if p1_cfg.get("verbatim_mode") in ["strict", "tolerant"]:
                    verbatim_mode = p1_cfg["verbatim_mode"]

            mb = (eval_spec.metric_bindings or {}) if eval_spec and getattr(eval_spec, "metric_bindings", None) else {}
            rc_bindings = mb.get("rating_congruence") if isinstance(mb, dict) else None
            rc_signal_var = None
            rc_criterion_col = None
            if isinstance(rc_bindings, dict):
                rc_signal_var = (rc_bindings.get("signal_var") or [None])[0]
                rc_criterion_col = (rc_bindings.get("criterion_var") or [None])[0]

            vf_bindings = mb.get("verbatim_faithfulness") if isinstance(mb, dict) else None
            vf_source_col = None
            if isinstance(vf_bindings, dict):
                vf_source_col = (vf_bindings.get("source_text_col") or [None])[0]

            def _get_nested_val(d: Any, path: str) -> Any:
                if not isinstance(d, dict) or not path:
                    return None
                if path in d:
                    return d[path]
                cur: Any = d
                for part in path.split("."):
                    if isinstance(cur, dict) and part in cur:
                        cur = cur[part]
                    else:
                        return None
                return cur

            for r in results:
                parsed = r.get("parsed_json") or {}
                row_ctx = r.get("row_context") or {}

                # Source text for verbatim checks (parameterized slot first, then universal resolver)
                raw_source_text = (
                    str(row_ctx[vf_source_col])
                    if vf_source_col and vf_source_col in row_ctx and row_ctx[vf_source_col] is not None
                    else resolve_source_text(row_ctx, eval_spec)
                )

                # Extract external criterion for convergent validity (parameterized slot first, then pilar_4, then fallback)
                star_val = None
                p4_col = rc_criterion_col
                if not p4_col and eval_spec and getattr(eval_spec, "methodology_config", None):
                    p4_col = (eval_spec.methodology_config.get("pilar_4") or {}).get("rating_col")
                if not p4_col and eval_spec and getattr(eval_spec, "rating_col", None):
                    p4_col = eval_spec.rating_col
                rating_candidates = ([p4_col] if p4_col else []) + ["review_rating", "rating", "stars", "score", "estrellas", "puntuacion", "valoracion"]
                for sk in rating_candidates:
                    if sk and sk in row_ctx and row_ctx[sk] is not None:
                        try:
                            star_val = float(row_ctx[sk])
                            break
                        except:
                            pass

                # Universal extraction of aspect items
                aspects_list = extract_aspect_items(parsed)

                # Disjointness check (Pos ∩ Neg = ∅, Pos ∩ Neu = ∅, Neg ∩ Neu = ∅)
                pos_snippets = set()
                neg_snippets = set()
                neu_snippets = set()

                for item in aspects_list:
                    dim_name = str(item.get("dimension", "")).lower().replace(" ", "_")
                    matched_key = next((k for k in dim_keys if k in dim_name or dim_name in k), None)
                    if matched_key:
                        if item.get("active", True):
                            dim_activations[matched_key] += 1

                    pol = str(item.get("polaridad") or item.get("sentiment") or "").lower()
                    citas = item.get("citas") or item.get("snippets") or []
                    if isinstance(citas, str):
                        citas = [citas]

                    for snip in citas:
                        clean_snip = normalize_for_verbatim(snip)
                        if clean_snip and clean_snip not in ["blank", "none"]:
                            total_snippets += 1
                            if raw_source_text and is_verbatim_match(snip, raw_source_text, mode=verbatim_mode):
                                verbatim_matches += 1

                    for snip in item.get("markers_positive", []):
                        cs = normalize_for_verbatim(snip)
                        if cs and cs not in ["blank", "none"]:
                            pos_snippets.add(cs)

                    for snip in item.get("markers_negative", []):
                        cs = normalize_for_verbatim(snip)
                        if cs and cs not in ["blank", "none"]:
                            neg_snippets.add(cs)

                    for snip in item.get("markers_neutral", []):
                        cs = normalize_for_verbatim(snip)
                        if cs and cs not in ["blank", "none"]:
                            neu_snippets.add(cs)

                    # Logical rule check
                    total_evals += 1
                    if pol in ["positive", "negative", "neutral", "blank", "mixed"]:
                        rule_consistent_evals += 1

                # Check snippet disjointness for this review (Pilar 1)
                overlap = False
                for ps in pos_snippets:
                    for ns in neg_snippets:
                        if ps == ns or (len(ps) > 5 and ps in ns) or (len(ns) > 5 and ns in ps):
                            overlap = True
                            break
                    if overlap:
                        break
                if not overlap:
                    for ps in pos_snippets:
                        for neu in neu_snippets:
                            if ps == neu or (len(ps) > 5 and ps in neu) or (len(neu) > 5 and neu in ps):
                                overlap = True
                                break
                        if overlap:
                            break
                if not overlap:
                    for ns in neg_snippets:
                        for neu in neu_snippets:
                            if ns == neu or (len(ns) > 5 and ns in neu) or (len(neu) > 5 and neu in ns):
                                overlap = True
                                break
                        if overlap:
                            break

                if not overlap:
                    disjoint_consistent_samples += 1

                # Calculate signal value (explicit signal_var or derived Net Sentiment Score) for rating congruence (Pilar 4)
                if star_val is not None:
                    nss = None
                    if rc_signal_var and rc_signal_var not in ["__auto_nss__", "NSS"]:
                        raw_sig = _get_nested_val(parsed, rc_signal_var)
                        if raw_sig is None and isinstance(r.get("computed_specs"), dict):
                            raw_sig = r["computed_specs"].get(rc_signal_var)
                        if raw_sig is not None:
                            try:
                                nss = float(raw_sig)
                            except (TypeError, ValueError):
                                nss = None
                    if nss is None:
                        pos_count = len(pos_snippets)
                        neg_count = len(neg_snippets)
                        if pos_count + neg_count > 0:
                            nss = (pos_count - neg_count) / (pos_count + neg_count)
                        else:
                            nss = 0.0
                    star_ratings.append(star_val)
                    net_sentiment_scores.append(nss)

            verbatim_rate = (verbatim_matches / total_snippets * 100.0) if total_snippets > 0 else 100.0
            rule_rate = (rule_consistent_evals / total_evals * 100.0) if total_evals > 0 else 100.0
            disjoint_rate = (disjoint_consistent_samples / total_samples * 100.0) if total_samples > 0 else 100.0
            consistency_score = round(verbatim_rate * 0.4 + rule_rate * 0.3 + disjoint_rate * 0.3, 1)

            activation_rates = {
                d: round((count / total_samples) * 100.0, 1) if total_samples > 0 else 0.0
                for d, count in dim_activations.items()
            }

            active_bats = eval_spec.active_batteries if eval_spec and getattr(eval_spec, "active_batteries", None) else ["pilar_1", "pilar_2", "pilar_3", "pilar_4"]
            cards = []
            if "pilar_1" in active_bats:
                cards.extend([
                    MetricCard(
                        id="verbatim",
                        label="Fidelidad Verbatim",
                        value=round(verbatim_rate, 1),
                        formatted=f"{verbatim_rate:.1f}%",
                        unit="%",
                        higher_is_better=True,
                        description="% de fragmentos citados que existen textualmente en el corpus (Anti-Alucinación)."
                    ),
                    MetricCard(
                        id="rule_consistency",
                        label="Consistencia de Reglas",
                        value=round(rule_rate, 1),
                        formatted=f"{rule_rate:.1f}%",
                        unit="%",
                        higher_is_better=True,
                        description="Coherencia lógica entre citas extraídas y polaridad asignada."
                    ),
                    MetricCard(
                        id="disjointness",
                        label="Disyunción de Citas (Pos ∩ Neg = ∅)",
                        value=round(disjoint_rate, 1),
                        formatted=f"{disjoint_rate:.1f}%",
                        unit="%",
                        higher_is_better=True,
                        description="Ausencia de contradicciones internas: % de reseñas con citas positivas y negativas disjuntas."
                    ),
                    MetricCard(
                        id="consistency",
                        label="Consistencia Global",
                        value=round(consistency_score, 1),
                        formatted=f"{consistency_score:.1f}%",
                        unit="%",
                        higher_is_better=True,
                        description="Índice sintético de rigor cualitativo, ausencia de contradicciones y exactitud literal."
                    ),
                ])

            # Add Rating Congruence card if customer ratings are available and pilar_4 is active
            if "pilar_4" in active_bats and len(star_ratings) >= 5:
                try:
                    from scipy.stats import spearmanr
                    r_val, p_val = spearmanr(star_ratings, net_sentiment_scores)
                    if not math.isnan(r_val):
                        cards.append(MetricCard(
                            id="rating_congruence",
                            label="Validez Convergente (vs. Estrellas)",
                            value=round(float(r_val), 3),
                            formatted=f"rs = {r_val:.2f}",
                            unit="",
                            higher_is_better=True,
                            description=f"Correlación de rango de Spearman entre el sentimiento cualitativo y las estrellas del cliente (p={p_val:.3f})."
                        ))
                except Exception:
                    pass

            # Include custom batteries if defined
            if eval_spec and getattr(eval_spec, "custom_batteries", None):
                for cb in eval_spec.custom_batteries:
                    cb_name = cb.get("name", "Batería Personalizada")
                    cb_id = f"custom_{cb.get('id', cb_name.lower().replace(' ', '_'))}"
                    cards.append(MetricCard(
                        id=cb_id,
                        label=cb_name,
                        value=100.0,
                        formatted="100.0%",
                        unit="%",
                        higher_is_better=True,
                        description=cb.get("description") or f"Métrica personalizada sobre campos: {', '.join(cb.get('target_fields', []))}"
                    ))

            cards.extend([
                MetricCard(
                    id="json_validity",
                    label="Cumplimiento Esquema",
                    value=round(format_validity, 1),
                    formatted=f"{format_validity:.1f}%",
                    unit="%",
                    higher_is_better=True,
                    description="% de respuestas con estructura de aspectos y formato JSON válido."
                ),
                MetricCard(
                    id="latency",
                    label="Latencia Media",
                    value=round(mean_latency, 1),
                    formatted=f"{mean_latency:.0f} ms",
                    unit="ms",
                    higher_is_better=False,
                    description="Tiempo medio de respuesta por muestra."
                ),
                MetricCard(
                    id="throughput",
                    label="Throughput",
                    value=round(throughput, 1),
                    formatted=f"{throughput:.1f} tok/s",
                    unit="tok/s",
                    higher_is_better=True,
                    description="Velocidad de generación de tokens."
                ),
                MetricCard(
                    id="cost",
                    label="Coste Estimado",
                    value=round(total_cost, 4),
                    formatted=f"${total_cost:.4f}",
                    unit="$",
                    higher_is_better=False,
                    description="Coste acumulado de inferencia."
                ),
            ])

            summary = ModelBenchmarkSummary(
                model_id=model_id,
                total_samples=total_samples,
                mean_latency_ms=round(mean_latency, 1),
                throughput_tokens_sec=round(throughput, 1),
                total_cost_usd=round(total_cost, 4),
                json_validity_rate=round(format_validity, 1),
                success_rate=round(success_rate, 1),
                internal_consistency_score=consistency_score,
                verbatim_faithfulness_rate=round(verbatim_rate, 1),
                rule_consistency_rate=round(rule_rate, 1),
                dimension_activation_rates=activation_rates,
                metric_cards=cards,
                task_type="aspect_polarity"
            )
            return attach_computed_specs_to_summary(summary, results, eval_spec)

        # ══════════════════════════════════════════════════════
        # 3. CLASSIFICATION & STRUCTURED TASKS (DEFAULT)
        # ══════════════════════════════════════════════════════
        else:
            cards = [
                MetricCard(
                    id="json_validity",
                    label="Cumplimiento de Esquema",
                    value=round(format_validity, 1),
                    formatted=f"{format_validity:.1f}%",
                    unit="%",
                    higher_is_better=True,
                    description="% de respuestas conformes con el formato y claves especificadas."
                ),
                MetricCard(
                    id="success",
                    label="Tasa de Éxito",
                    value=round(success_rate, 1),
                    formatted=f"{success_rate:.1f}%",
                    unit="%",
                    higher_is_better=True,
                    description="% de ejecuciones sin errores ni excepciones."
                ),
                MetricCard(
                    id="latency",
                    label="Latencia Media",
                    value=round(mean_latency, 1),
                    formatted=f"{mean_latency:.0f} ms",
                    unit="ms",
                    higher_is_better=False,
                    description="Tiempo medio de respuesta por muestra."
                ),
                MetricCard(
                    id="throughput",
                    label="Throughput",
                    value=round(throughput, 1),
                    formatted=f"{throughput:.1f} tok/s",
                    unit="tok/s",
                    higher_is_better=True,
                    description="Velocidad de generación de tokens."
                ),
                MetricCard(
                    id="cost",
                    label="Coste Estimado",
                    value=round(total_cost, 4),
                    formatted=f"${total_cost:.4f}",
                    unit="$",
                    higher_is_better=False,
                    description="Coste acumulado de inferencia."
                ),
            ]

            summary = ModelBenchmarkSummary(
                model_id=model_id,
                total_samples=total_samples,
                mean_latency_ms=round(mean_latency, 1),
                throughput_tokens_sec=round(throughput, 1),
                total_cost_usd=round(total_cost, 4),
                json_validity_rate=round(format_validity, 1),
                success_rate=round(success_rate, 1),
                internal_consistency_score=round(format_validity, 1),
                metric_cards=cards,
                task_type=task_type
            )
            return attach_computed_specs_to_summary(summary, results, eval_spec)


    def compute_pairwise_comparison(
        self,
        model_a: str,
        results_a: List[Dict[str, Any]],
        model_b: str,
        results_b: List[Dict[str, Any]],
        eval_spec: Optional[EvaluationSpec] = None
    ) -> PairwiseComparison:
        """
        Universal 1 vs 1 model consensus comparison:
        - Numeric: Pearson Correlation, Mean Absolute Difference, Agreement Rate
        - Categorical & Aspect: Cohen's Kappa, Polarity Count Agreement, Raw Agreement
        """
        min_len = min(len(results_a), len(results_b))
        if min_len == 0:
            return PairwiseComparison(
                model_a=model_a,
                model_b=model_b,
                samples_compared=0
            )

        task_type = eval_spec.task_type if eval_spec else "generic"

        # Auto-detect aspect_polarity if qualitative aspect structures are present
        has_aspects = any(bool(extract_aspect_items(r.get("parsed_json") or {})) for r in (results_a[:10] + results_b[:10]))
        target_field = eval_spec.output_fields[0].name if eval_spec and eval_spec.output_fields else "resultado_calculo"
        has_numeric = any(
            any(k in (r.get("parsed_json") or {}) and isinstance((r.get("parsed_json") or {})[k], (int, float))
                for k in [target_field, "resultado_calculo", "resultado", "total", "raw_number"])
            for r in (results_a[:10] + results_b[:10])
        )

        if (task_type in ["generic", "numeric_math"] and has_aspects and not has_numeric) or task_type == "aaker_dimensions":
            task_type = "aspect_polarity"

        is_human_a = model_a == "human_expert" or model_a.startswith("human_expert")
        is_human_b = model_b == "human_expert" or model_b.startswith("human_expert")
        is_vs_human = (is_human_a or is_human_b) and not (is_human_a and is_human_b)

        # 1. Numeric Comparison
        if task_type == "numeric_math":
            nums_a: List[float] = []
            nums_b: List[float] = []
            diffs: List[float] = []
            agreement_matches = 0

            for i in range(min_len):
                pa = results_a[i].get("parsed_json") or {}
                pb = results_b[i].get("parsed_json") or {}

                va, vb = None, None
                for c in [target_field, "resultado_calculo", "resultado", "total", "raw_number"]:
                    if va is None and c in pa:
                        try: va = float(pa[c])
                        except: pass
                    if vb is None and c in pb:
                        try: vb = float(pb[c])
                        except: pass

                if va is not None and vb is not None:
                    nums_a.append(va)
                    nums_b.append(vb)
                    diff = abs(va - vb)
                    diffs.append(diff)
                    if diff <= 0.05 * (abs(va) + 1e-5) or diff <= 0.05:
                        agreement_matches += 1

            if not nums_a and has_aspects:
                # Fall back to aspect comparison if no numbers were parsed but aspect items exist
                task_type = "aspect_polarity"
            else:
                corr = calculate_pearson_correlation(nums_a, nums_b)
                mean_diff = float(np.mean(diffs)) if diffs else 0.0
                raw_agree = (agreement_matches / len(nums_a) * 100.0) if nums_a else 0.0

                return PairwiseComparison(
                    model_a=model_a,
                    model_b=model_b,
                    cohens_kappa=corr,  # Displayed as Correlation in the matrix
                    polarity_count_agreement=round(raw_agree, 1),
                    raw_agreement_rate=round(raw_agree, 1),
                    pearson_correlation=corr,
                    mean_absolute_difference=round(mean_diff, 3),
                    samples_compared=min_len,
                    evaluated_fields=[target_field],
                    task_type="numeric_math",
                    is_vs_human=is_vs_human
                )

        # 2. Aspect & Categorical Comparison
        categories = ["positive", "negative", "neutral", "mixed", "blank"]
        labels_a: List[str] = []
        labels_b: List[str] = []
        counts_a: List[int] = []
        counts_b: List[int] = []
        matches = 0
        total_items = 0
        dim_matches: Dict[str, int] = {}
        dim_totals: Dict[str, int] = {}

        # Pilar 3 ICC(2,1) configuration
        p3_cfg = (eval_spec.methodology_config.get("pilar_3") or {}) if (eval_spec and getattr(eval_spec, "methodology_config", None)) else {}
        p3_count_fields = p3_cfg.get("count_fields") or ["markers_positive", "markers_negative", "markers_neutral"]
        p3_scope = p3_cfg.get("scope") or "by_dimension"

        def _count_item_evidence(item: Dict[str, Any]) -> int:
            total = 0
            for cf in p3_count_fields:
                val = item.get(cf)
                if isinstance(val, list):
                    total += len([x for x in val if x and str(x).strip().lower() not in ["blank", "none"]])
                elif isinstance(val, (int, float)):
                    total += int(val)
            if total == 0 and "citas" not in p3_count_fields and not any(item.get(cf) for cf in p3_count_fields):
                citas_fallback = item.get("citas") or []
                if isinstance(citas_fallback, list):
                    total = len([x for x in citas_fallback if x and str(x).strip().lower() not in ["blank", "none"]])
            return total

        for i in range(min_len):
            pa = results_a[i].get("parsed_json") or {}
            pb = results_b[i].get("parsed_json") or {}

            aspects_a = {item["dimension"].lower(): item for item in extract_aspect_items(pa)}
            aspects_b = {item["dimension"].lower(): item for item in extract_aspect_items(pb)}

            if aspects_a and aspects_b:
                all_present_dims = sorted(list(set(aspects_a.keys()) | set(aspects_b.keys())))
                kappa_dims = list(all_present_dims)
                if eval_spec and getattr(eval_spec, "methodology_config", None):
                    p2_cfg = eval_spec.methodology_config.get("pilar_2") or {}
                    custom_fields = p2_cfg.get("target_fields")
                    if custom_fields and isinstance(custom_fields, list) and len(custom_fields) > 0:
                        clean_custom = [f.replace(".sentiment", "").replace(".polaridad", "").strip().lower() for f in custom_fields]
                        filtered = [d for d in all_present_dims if d in clean_custom]
                        if filtered:
                            kappa_dims = filtered

                review_cnt_a = 0
                review_cnt_b = 0

                # Always compute per-dimension agreement for every dimension present in the annotations
                for dk in all_present_dims:
                    if dk not in dim_matches:
                        dim_matches[dk] = 0
                        dim_totals[dk] = 0

                    item_a = aspects_a.get(dk, {})
                    item_b = aspects_b.get(dk, {})

                    pol_a = str(item_a.get("polaridad") or item_a.get("sentiment") or "blank").lower()
                    pol_b = str(item_b.get("polaridad") or item_b.get("sentiment") or "blank").lower()

                    if pol_a == pol_b:
                        dim_matches[dk] += 1
                    dim_totals[dk] += 1

                    if dk in kappa_dims:
                        labels_a.append(pol_a)
                        labels_b.append(pol_b)
                        if pol_a == pol_b:
                            matches += 1
                        total_items += 1

                        cnt_a = _count_item_evidence(item_a)
                        cnt_b = _count_item_evidence(item_b)
                        if p3_scope == "by_review":
                            review_cnt_a += cnt_a
                            review_cnt_b += cnt_b
                        else:
                            counts_a.append(cnt_a)
                            counts_b.append(cnt_b)

                if p3_scope == "by_review":
                    counts_a.append(review_cnt_a)
                    counts_b.append(review_cnt_b)
            else:
                pol_a = str(pa.get("polaridad_global") or pa.get("categoria_asignada") or "neutral").lower()
                pol_b = str(pb.get("polaridad_global") or pb.get("categoria_asignada") or "neutral").lower()

                labels_a.append(pol_a)
                labels_b.append(pol_b)
                if pol_a == pol_b:
                    matches += 1
                total_items += 1

                snips_a_count = sum(len(x.get("citas", [])) for x in aspects_a.values()) if aspects_a else 0
                snips_b_count = sum(len(x.get("citas", [])) for x in aspects_b.values()) if aspects_b else 0
                counts_a.append(snips_a_count)
                counts_b.append(snips_b_count)

        kappa = calculate_cohens_kappa(labels_a, labels_b, categories)
        alpha = calculate_krippendorff_alpha_nominal(labels_a, labels_b)
        icc_val = calculate_polarity_icc(counts_a, counts_b)
        raw_agree = (matches / total_items * 100.0) if total_items > 0 else 0.0

        dimension_agreements = {
            dk: round((dim_matches[dk] / dim_totals[dk] * 100.0), 1)
            for dk in dim_totals if dim_totals[dk] > 0
        }

        evaluated_fields = [f"{dk}.sentiment" for dk in sorted(list(dim_totals.keys()))] if dim_totals else ["polaridad_global"]

        return PairwiseComparison(
            model_a=model_a,
            model_b=model_b,
            cohens_kappa=kappa,
            krippendorff_alpha=alpha,
            polarity_count_agreement=round(raw_agree, 1),
            icc_2_1=icc_val,
            raw_agreement_rate=round(raw_agree, 1),
            samples_compared=min_len,
            dimension_agreements=dimension_agreements,
            evaluated_fields=evaluated_fields,
            task_type="aspect_polarity",
            is_vs_human=is_vs_human
        )

metrics_engine = MetricsEngine()
