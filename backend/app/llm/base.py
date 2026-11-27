import time
import json
import re
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List, Tuple
from pydantic import BaseModel, Field

class LLMResponse(BaseModel):
    model_id: str
    provider: str
    raw_response: str
    parsed_json: Optional[Dict[str, Any]] = None
    is_valid_json: bool = False
    latency_ms: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    estimated_cost_usd: float = 0.0
    success: bool = True
    error_message: Optional[str] = None

class ModelCatalogItem(BaseModel):
    id: str
    name: str
    provider: str  # "ollama", "openai", "gemini", "anthropic", "groq", "sim"
    is_local: bool
    context_window: int = 8192
    cost_per_million_input: float = 0.0
    cost_per_million_output: float = 0.0
    is_available: bool = False
    description: str = ""
    size_bytes: Optional[int] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None
    estimated_vram_gb: Optional[float] = None
    category: str = "texto"  # "texto" | "programacion" | "imagenes" | "omnimodales"
    billing_tier: Optional[str] = None  # "free" | "paid" | None
    rpm_limit: Optional[int] = None
    tpm_limit: Optional[int] = None

def clean_marker_fragments(val: str) -> List[str]:
    """Cleans marker string split by || and removes 'blank', brackets, or empty tokens."""
    if not val:
        return []
    val = val.strip()
    if val.lower() in ["blank", "none", "null", "[]", "[\"\"]", "['-']", "-", ""]:
        return []
    if val.startswith("[") and val.endswith("]"):
        try:
            parsed_list = json.loads(val)
            if isinstance(parsed_list, list):
                return [str(x).strip(" \"'") for x in parsed_list if str(x).strip(" \"'") and str(x).strip(" \"'").lower() != "blank"]
        except Exception:
            val = val.strip("[]")

    frags = [f.strip(" \"'") for f in val.split("||")]
    return [f for f in frags if f and f.lower() != "blank"]

def parse_structured_block_format(text: str) -> Tuple[Optional[Dict[str, Any]], bool]:
    """
    Parses non-JSON key-value structured blocks for Aaker and custom dimensions:
    DIMENSION_NAME
    SENTIMENT: <Positive|Negative|Neutral|Mixed|blank>
    MARKERS_POSITIVE: fragment1 || fragment2 — or blank
    MARKERS_NEGATIVE: ...
    MARKERS_NEUTRAL: ...
    """
    dims = ["BRAND_AWARENESS", "BRAND_ASSOCIATIONS", "PERCEIVED_QUALITY", "BRAND_LOYALTY"]
    
    # Check if dimension headings appear
    found_any = any(re.search(rf"\b{d}\b", text, re.IGNORECASE) for d in dims)
    if not found_any:
        return None, False

    result = {
        "format": "structured_blocks",
        "dimensions": {}
    }

    pattern = rf"(BRAND_AWARENESS|BRAND_ASSOCIATIONS|PERCEIVED_QUALITY|BRAND_LOYALTY)([\s\S]*?)(?=(?:BRAND_AWARENESS|BRAND_ASSOCIATIONS|PERCEIVED_QUALITY|BRAND_LOYALTY)|\Z)"
    matches = list(re.finditer(pattern, text, re.IGNORECASE))

    for m in matches:
        dim_raw = m.group(1).upper()
        dim_key = dim_raw.lower()
        content = m.group(2)

        sent_m = re.search(r"SENTIMENT:[ \t]*([^\n\r]*)", content, re.IGNORECASE)
        raw_sentiment = (sent_m.group(1).strip() if sent_m else "") or "blank"

        pos_m = re.search(r"MARKERS_POSITIVE:[ \t]*([^\n\r]*)", content, re.IGNORECASE)
        pos_raw = (pos_m.group(1).strip() if pos_m else "") or "blank"

        neg_m = re.search(r"MARKERS_NEGATIVE:[ \t]*([^\n\r]*)", content, re.IGNORECASE)
        neg_raw = (neg_m.group(1).strip() if neg_m else "") or "blank"

        neu_m = re.search(r"MARKERS_NEUTRAL:[ \t]*([^\n\r]*)", content, re.IGNORECASE)
        neu_raw = (neu_m.group(1).strip() if neu_m else "") or "blank"

        pos_frags = clean_marker_fragments(pos_raw)
        neg_frags = clean_marker_fragments(neg_raw)
        neu_frags = clean_marker_fragments(neu_raw)

        # Rule derivation logic as defined in the prompt:
        # only POSITIVE -> Positive; only NEGATIVE -> Negative; only NEUTRAL -> Neutral
        # more than one -> Mixed; none -> blank
        pos_filled = len(pos_frags) > 0
        neg_filled = len(neg_frags) > 0
        neu_filled = len(neu_frags) > 0
        filled_count = sum([pos_filled, neg_filled, neu_filled])

        if filled_count == 0:
            expected_sent = "blank"
        elif filled_count > 1:
            expected_sent = "Mixed"
        elif pos_filled:
            expected_sent = "Positive"
        elif neg_filled:
            expected_sent = "Negative"
        else:
            expected_sent = "Neutral"

        is_rule_consistent = (raw_sentiment.lower() == expected_sent.lower())
        is_active = (raw_sentiment.lower() != "blank") or (len(pos_frags) + len(neg_frags) + len(neu_frags) > 0)

        # Polarity mapping for compatibility
        polarity = "neutral"
        if raw_sentiment.lower() in ["positive", "negative", "neutral", "mixed"]:
            polarity = raw_sentiment.lower()
        elif pos_filled and not neg_filled:
            polarity = "positive"
        elif neg_filled and not pos_filled:
            polarity = "negative"

        result["dimensions"][dim_key] = {
            "active": is_active,
            "sentiment": raw_sentiment,
            "expected_sentiment": expected_sent,
            "is_rule_consistent": is_rule_consistent,
            "polarity": polarity if is_active else None,
            "markers_positive": pos_frags,
            "markers_negative": neg_frags,
            "markers_neutral": neu_frags,
            "snippets": pos_frags + neg_frags + neu_frags
        }

    is_valid = len(result["dimensions"]) >= 2
    return result, is_valid

def extract_and_parse_json(text: str) -> Tuple[Optional[Dict[str, Any]], bool]:
    text = text.strip()
    try:
        return json.loads(text), True
    except Exception:
        pass

    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        try:
            return json.loads(match.group(1).strip()), True
        except Exception:
            pass

    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(text[first_brace:last_brace + 1]), True
        except Exception:
            pass

    return None, False

def parse_schema_structured_blocks(text: str, output_schema: Dict[str, Any]) -> Dict[str, Any]:
    """
    Schema-driven structured block parser.
    Matches top-level keys from `output_schema` (case-insensitive) as section headers
    in `text`, and extracts nested fields (or scalar/list values) dynamically.
    """
    dict_keys = [k for k, v in output_schema.items() if isinstance(v, dict)]
    if not dict_keys:
        return {}

    escaped_keys = [re.escape(k) for k in sorted(dict_keys, key=len, reverse=True)]
    header_union = "|".join(escaped_keys)
    pattern = rf"(?im)^[ \t]*({header_union})\b([\s\S]*?)(?=^[ \t]*(?:{header_union})\b|\Z)"
    matches = list(re.finditer(pattern, text))
    if not matches:
        return {}

    key_lookup = {k.lower(): k for k in dict_keys}
    dimensions: Dict[str, Any] = {}

    for m in matches:
        raw_header = m.group(1).lower()
        canonical_key = key_lookup.get(raw_header)
        if not canonical_key:
            continue
        content = m.group(2)
        sub_schema = output_schema.get(canonical_key) or {}
        section_obj: Dict[str, Any] = {}

        for sub_k, sub_def in sub_schema.items():
            sub_match = re.search(rf"(?i)\b{re.escape(sub_k)}\b[ \t]*[:=][ \t]*([^\n\r]*)", content)
            raw_val = sub_match.group(1).strip() if sub_match else ""

            if isinstance(sub_def, list):
                if not raw_val or raw_val.lower() in ("blank", "none", "n/a", "null", "[]"):
                    section_obj[sub_k] = []
                elif "||" in raw_val:
                    section_obj[sub_k] = clean_marker_fragments(raw_val)
                else:
                    section_obj[sub_k] = [x.strip(" \"'[]") for x in raw_val.split(",") if x.strip(" \"'[]") and x.strip(" \"'[]").lower() != "blank"]
            elif isinstance(sub_def, bool):
                section_obj[sub_k] = any(w in raw_val.lower() for w in ("true", "si", "sí", "1", "yes")) if raw_val else bool(sub_def)
            elif isinstance(sub_def, (int, float)):
                num_m = re.search(r"[-+]?\d*\.?\d+", raw_val) if raw_val else None
                section_obj[sub_k] = float(num_m.group(0)) if num_m else float(sub_def)
            else:
                cleaned = raw_val.strip(" \"'") if raw_val else "blank"
                section_obj[sub_k] = cleaned

        dimensions[canonical_key] = section_obj

    return {"format": "structured_blocks", "dimensions": dimensions}


def assemble_backend_json(
    text: str,
    output_schema: Optional[Dict[str, Any]] = None,
    row_context: Optional[Dict[str, Any]] = None
) -> Tuple[Dict[str, Any], bool]:
    """
    Constructs the structured JSON object on the backend:
    Even if the LLM output is free text, messy, or makes syntax mistakes,
    the backend extracts the target values and generates a 100% valid dictionary conforming to output_schema.
    """
    if not output_schema:
        res, valid = extract_and_parse_response(text)
        return res or {}, valid

    # 1. First check if model emitted valid JSON or key-values
    parsed, _ = extract_and_parse_response(text)
    parsed = parsed or {}

    # 1b. Merge schema-driven structured blocks if detected
    schema_blocks = parse_schema_structured_blocks(text, output_schema)
    if schema_blocks.get("dimensions"):
        existing_dims = parsed.get("dimensions") if isinstance(parsed.get("dimensions"), dict) else {}
        parsed["dimensions"] = {**existing_dims, **schema_blocks["dimensions"]}

    constructed = {}
    text_clean = text.strip()

    # Find all numbers in text in order of appearance
    all_numbers = [float(n) for n in re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", text_clean) if n not in [".", "+", "-"]]
    num_idx = 0

    for key, default_val in output_schema.items():
        # 1. Check if already present directly in parsed
        if key in parsed:
            constructed[key] = parsed[key]
            continue
        
        # 2. Check case-insensitive key in parsed
        found_in_parsed = False
        for pk, pv in parsed.items():
            if pk.lower() == key.lower():
                constructed[key] = pv
                found_in_parsed = True
                break
        if found_in_parsed:
            continue

        # 3. Check inside parsed["dimensions"] or parsed["ground_truth"]
        dim_candidates = {}
        if isinstance(parsed.get("dimensions"), dict):
            dim_candidates.update(parsed["dimensions"])
        if isinstance(parsed.get("ground_truth"), dict):
            dim_candidates.update(parsed["ground_truth"])
        
        dim_source = None
        for dk, dv in dim_candidates.items():
            if dk.lower() == key.lower():
                dim_source = dv
                break

        if dim_source is not None:
            if isinstance(default_val, dict):
                sub_dict = {}
                for sub_k, sub_def in default_val.items():
                    if sub_k in dim_source:
                        sub_dict[sub_k] = dim_source[sub_k]
                    elif sub_k.lower() in dim_source:
                        sub_dict[sub_k] = dim_source[sub_k.lower()]
                    elif sub_k == "markers_positive":
                        sub_dict[sub_k] = dim_source.get("markers_positive", [])
                    elif sub_k == "markers_negative":
                        sub_dict[sub_k] = dim_source.get("markers_negative", [])
                    elif sub_k == "markers_neutral":
                        sub_dict[sub_k] = dim_source.get("markers_neutral", [])
                    elif sub_k in ["sentiment", "polaridad", "polarity"]:
                        sub_dict[sub_k] = dim_source.get("sentiment") or dim_source.get("polarity") or "blank"
                    else:
                        sub_dict[sub_k] = sub_def
                constructed[key] = sub_dict
                continue
            else:
                constructed[key] = dim_source
                continue

        # 4. Try regex search: "key": value or key: value or key = value
        pattern = rf"(?:[\"']?{re.escape(key)}[\"']?[ \t]*[:=][ \t]*)([^\n\r,}}]+)"
        match = re.search(pattern, text_clean, re.IGNORECASE)

        if isinstance(default_val, dict):
            constructed[key] = dict(default_val)

        elif isinstance(default_val, (int, float)):
            if match:
                try:
                    num_str = re.search(r"[-+]?\d*\.?\d+", match.group(1))
                    if num_str:
                        constructed[key] = float(num_str.group(0))
                        continue
                except (ValueError, TypeError):
                    pass
            # If no direct match, grab sequential number from text if available
            if num_idx < len(all_numbers):
                constructed[key] = all_numbers[num_idx]
                num_idx += 1
            else:
                constructed[key] = float(default_val)

        elif isinstance(default_val, list):
            # If list of quotes or markers
            if match:
                val_str = match.group(1).strip("[]\"' ")
                items = [x.strip(" \"'") for x in val_str.split(",") if x.strip(" \"'")]
                constructed[key] = items
            else:
                constructed[key] = []

        elif isinstance(default_val, bool):
            if match:
                val_lower = match.group(1).lower()
                constructed[key] = True if any(w in val_lower for w in ["true", "si", "sí", "1", "yes"]) else False
            else:
                constructed[key] = bool(default_val)

        else:
            # String or generic
            if match:
                constructed[key] = match.group(1).strip(" \"',")
            else:
                constructed[key] = str(default_val) if default_val is not None else ""

    return constructed, True

def extract_and_parse_response(
    text: str,
    output_schema: Optional[Dict[str, Any]] = None
) -> Tuple[Optional[Dict[str, Any]], bool]:
    """
    Universal parser trying:
    1. Output Schema backend assembly (if schema provided)
    2. JSON format (Direct, Markdown ```json, or Braced {...})
    3. Structured Block Format (Non-JSON Aaker or aspect blocks)
    4. Numeric extraction (if output is a single number or result: X)
    5. Key-Value colon lines
    """
    if output_schema:
        return assemble_backend_json(text, output_schema)

    text_clean = text.strip()

    # 1. Try JSON first
    json_res, json_valid = extract_and_parse_json(text_clean)
    if json_valid:
        return json_res, True

    # 2. Try structured block format
    block_res, block_valid = parse_structured_block_format(text_clean)
    if block_valid:
        return block_res, True

    # 3. Try Numeric extraction (e.g. "resultado: 45.2", "45.2", "total = 120")
    num_match = re.search(r"(?:resultado|total|resultado_calculo|answer|result)?\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)", text_clean, re.IGNORECASE)
    if num_match:
        try:
            val = float(num_match.group(1))
            return {"resultado_calculo": val, "raw_number": val}, True
        except ValueError:
            pass

    # 4. Try Key-Value parsing
    kv_pairs = {}
    for line in text_clean.split("\n"):
        if ":" in line:
            k, v = line.split(":", 1)
            k_clean = k.strip().lower().replace(" ", "_")
            if len(k_clean) > 0 and len(k_clean) < 50:
                kv_pairs[k_clean] = v.strip()
    if len(kv_pairs) >= 1:
        return kv_pairs, True

    # Fallback to whatever partially parsed block we have
    if block_res is not None:
        return block_res, False

    return None, False


class BaseLLM(ABC):
    @property
    @abstractmethod
    def provider(self) -> str: pass

    @abstractmethod
    async def generate(
        self,
        model_name: str,
        prompt: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 1000
    ) -> LLMResponse:
        pass
