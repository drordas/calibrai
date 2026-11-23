import uuid
import json
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from pydantic import BaseModel, Field
from backend.app.core.dataset_engine import dataset_engine
from backend.app.core.prompt_engine import prompt_engine
from backend.app.schemas.prompt import EvaluationSpec
from backend.app.llm.manager import llm_manager
from backend.app.metrics.engine import metrics_engine, ModelBenchmarkSummary, PairwiseComparison

class BenchmarkRunRequest(BaseModel):
    dataset_id: str
    model_ids: List[str]
    template: str
    system_prompt: Optional[str] = None
    sample_size: int = 25
    batch_size: int = 1
    api_keys: Dict[str, str] = Field(default_factory=dict)
    task_type: str = "generic"
    eval_spec: Optional[EvaluationSpec] = None
    model_temperatures: Dict[str, float] = Field(default_factory=dict)

class BenchmarkState(BaseModel):
    benchmark_id: str
    status: str  # "running", "completed", "failed"
    total_models: int
    current_model_index: int = 0
    current_model_id: str = ""
    current_sample_index: int = 0
    total_samples: int = 0
    model_summaries: Dict[str, ModelBenchmarkSummary] = Field(default_factory=dict)
    pairwise_matrix: List[PairwiseComparison] = Field(default_factory=list)
    best_performers: Dict[str, str] = Field(default_factory=dict)
    eval_spec: Optional[EvaluationSpec] = None

class BenchmarkRunner:
    def __init__(self):
        self.runs: Dict[str, Dict[str, Any]] = {}

    def get_run(self, benchmark_id: str) -> Optional[Dict[str, Any]]:
        return self.runs.get(benchmark_id)

    async def run_benchmark_stream(self, req: BenchmarkRunRequest) -> AsyncGenerator[str, None]:
        benchmark_id = f"bm_{uuid.uuid4().hex[:8]}"
        
        # 1. Extract evaluation spec and clean prompt template (strip eval-spec block for LLM)
        clean_template, eval_spec = prompt_engine.extract_evaluation_spec(req.template, req.task_type)
        if req.eval_spec:
            eval_spec = req.eval_spec

        # 2. Fetch sample rows from DuckDB
        paginated = dataset_engine.get_paginated_rows(
            dataset_id=req.dataset_id,
            offset=0,
            limit=req.sample_size
        )
        rows = paginated.rows
        total_rows = len(rows)

        # Storage for this run
        raw_results: Dict[str, List[Dict[str, Any]]] = {m: [] for m in req.model_ids}
        summaries: Dict[str, ModelBenchmarkSummary] = {}

        self.runs[benchmark_id] = {
            "id": benchmark_id,
            "request": req.model_dump(),
            "clean_template": clean_template,
            "eval_spec": eval_spec.model_dump() if eval_spec else None,
            "raw_results": raw_results,
            "summaries": summaries,
            "status": "running"
        }

        # Yield benchmark start event
        yield f"event: benchmark_start\ndata: {json.dumps({'benchmark_id': benchmark_id, 'models': req.model_ids, 'total_samples': total_rows, 'task_type': eval_spec.task_type if eval_spec else req.task_type})}\n\n"

        batch_size = max(1, req.batch_size)

        # 3. Execution across selected models
        for m_idx, model_id in enumerate(req.model_ids):
            assigned_temp = req.model_temperatures.get(model_id) if hasattr(req, "model_temperatures") else None
            custom_ollama = req.api_keys.get("ollama_url") or req.api_keys.get("ollama")
            await llm_manager.load_model(model_id, temperature=assigned_temp, custom_url=custom_ollama)

            yield f"event: model_start\ndata: {json.dumps({'model_id': model_id, 'model_index': m_idx + 1, 'total_models': len(req.model_ids), 'batch_size': batch_size, 'temperature': assigned_temp if assigned_temp is not None else 0.8})}\n\n"

            async def _process_single_row(s_idx: int, row: Dict[str, Any]):
                # Render clean prompt with single-pass regex variable injection
                prompt = prompt_engine.render_prompt_variables(clean_template, row)

                # Call LLM (Ollama, Cloud, or polymorphic simulation fallback)
                response = await llm_manager.invoke_model(
                    model_id=model_id,
                    prompt=prompt,
                    system_prompt=req.system_prompt,
                    api_keys=req.api_keys,
                    row_context=row,
                    eval_spec=eval_spec,
                    output_schema=eval_spec.output_schema if eval_spec else None
                )
                return s_idx, row, response


            for chunk_start in range(0, total_rows, batch_size):
                chunk_items = list(enumerate(rows[chunk_start:chunk_start + batch_size], start=chunk_start))
                # Execute chunk concurrently
                chunk_results = await asyncio.gather(*[_process_single_row(s_idx, r) for s_idx, r in chunk_items])
                # Ensure ordered results by sample index
                chunk_results.sort(key=lambda x: x[0])

                for s_idx, row, response in chunk_results:
                    row_result = {
                        "sample_index": s_idx,
                        "row_context": row,
                        **response.model_dump()
                    }
                    raw_results[model_id].append(row_result)

                    # Compute progressive metrics for this model so far
                    current_summary = metrics_engine.compute_model_metrics(
                        model_id=model_id,
                        results=raw_results[model_id],
                        eval_spec=eval_spec
                    )
                    summaries[model_id] = current_summary

                    # Emit progressive sample update
                    update_payload = {
                        "benchmark_id": benchmark_id,
                        "model_id": model_id,
                        "sample_index": s_idx + 1,
                        "total_samples": total_rows,
                        "latest_result": {
                            "row_id": row.get("review_id", str(s_idx + 1)),
                            "latency_ms": response.latency_ms,
                            "is_valid_json": response.is_valid_json,
                            "estimated_cost_usd": response.estimated_cost_usd,
                            "parsed_json": response.parsed_json
                        },
                        "current_summary": current_summary.model_dump()
                    }
                    yield f"event: sample_update\ndata: {json.dumps(update_payload)}\n\n"
                    await asyncio.sleep(0.005)

            # Model finished
            yield f"event: model_finished\ndata: {json.dumps({'model_id': model_id, 'summary': summaries[model_id].model_dump()})}\n\n"

        # 4. Post-execution: Pairwise comparisons (1 vs 1 matrix)
        pairwise_list: List[PairwiseComparison] = []
        for i in range(len(req.model_ids)):
            for j in range(i + 1, len(req.model_ids)):
                ma = req.model_ids[i]
                mb = req.model_ids[j]
                pair_comp = metrics_engine.compute_pairwise_comparison(
                    model_a=ma,
                    results_a=raw_results[ma],
                    model_b=mb,
                    results_b=raw_results[mb],
                    eval_spec=eval_spec
                )
                pairwise_list.append(pair_comp)

        # 5. Determine best performers dynamically according to active metric cards
        best_performers = self._calculate_best_performers(summaries)

        self.runs[benchmark_id]["status"] = "completed"
        self.runs[benchmark_id]["pairwise_matrix"] = [p.model_dump() for p in pairwise_list]
        self.runs[benchmark_id]["best_performers"] = best_performers

        # Yield completion
        completion_payload = {
            "benchmark_id": benchmark_id,
            "status": "completed",
            "task_type": eval_spec.task_type if eval_spec else req.task_type,
            "summaries": {k: v.model_dump() for k, v in summaries.items()},
            "pairwise_matrix": [p.model_dump() for p in pairwise_list],
            "best_performers": best_performers
        }
        yield f"event: benchmark_completed\ndata: {json.dumps(completion_payload)}\n\n"

    def _calculate_best_performers(self, summaries: Dict[str, ModelBenchmarkSummary]) -> Dict[str, str]:
        """Calculates which model achieved the top score in each dynamic metric for green highlighting."""
        if not summaries:
            return {}

        best: Dict[str, str] = {}
        models = list(summaries.keys())

        # Collect all metric card IDs present across summaries
        card_ids = set()
        for s in summaries.values():
            for c in s.metric_cards:
                card_ids.add((c.id, c.higher_is_better))

        for card_id, higher_is_better in card_ids:
            try:
                def get_val(m: str):
                    for c in summaries[m].metric_cards:
                        if c.id == card_id:
                            return c.value
                    return 0.0

                if higher_is_better:
                    best[card_id] = max(models, key=get_val)
                else:
                    best[card_id] = min(models, key=get_val)
            except Exception:
                pass

        # Standard operational fallbacks
        best["latency"] = min(models, key=lambda m: summaries[m].mean_latency_ms)
        best["throughput"] = max(models, key=lambda m: summaries[m].throughput_tokens_sec)
        best["cost"] = min(models, key=lambda m: summaries[m].total_cost_usd)
        best["json_validity"] = max(models, key=lambda m: summaries[m].json_validity_rate)
        best["consistency"] = max(models, key=lambda m: summaries[m].internal_consistency_score)

        return best

benchmark_runner = BenchmarkRunner()
