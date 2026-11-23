import asyncio
import datetime
import json
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from backend.app.db.session import SessionLocal
from backend.app.db.models import Experiment, UserConfiguration
from backend.app.core.dataset_engine import dataset_engine
from backend.app.core.prompt_engine import prompt_engine
from backend.app.schemas.prompt import EvaluationSpec
from backend.app.llm.manager import llm_manager
from backend.app.metrics.engine import metrics_engine, PairwiseComparison

class ExperimentQueueManager:
    """
    Native asynchronous Experiment Queue & Lifecycle Manager.
    Supports:
    - Sequential and parallel experiment queues
    - Row-by-row checkpointing directly into PostgreSQL
    - Pause, Resume, and Cancel without data loss or duplicate API calls
    - Progressive metrics re-computation
    """

    def __init__(self):
        self._pause_flags: Dict[str, bool] = {}
        self._cancel_flags: Dict[str, bool] = {}
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}
        self._queue_lock = asyncio.Lock()

    def is_running(self, exp_id: str) -> bool:
        task = self._active_tasks.get(exp_id)
        return task is not None and not task.done()

    def subscribe(self, exp_id: str) -> asyncio.Queue:
        """Subscribes an SSE or event listener to progress updates."""
        if exp_id not in self._subscribers:
            self._subscribers[exp_id] = []
        q = asyncio.Queue()
        self._subscribers[exp_id].append(q)
        return q

    def unsubscribe(self, exp_id: str, q: asyncio.Queue):
        if exp_id in self._subscribers and q in self._subscribers[exp_id]:
            self._subscribers[exp_id].remove(q)

    async def broadcast(self, exp_id: str, event_type: str, data: Dict[str, Any]):
        subscribers = self._subscribers.get(exp_id, [])
        msg = {"event": event_type, "data": data}
        for q in list(subscribers):
            try:
                q.put_nowait(msg)
            except Exception:
                pass

    async def enqueue_or_start(self, exp_id: str):
        """Starts experiment immediately if parallel or if no sequential is currently running."""
        async with self._queue_lock:
            db: Session = SessionLocal()
            try:
                exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
                if not exp:
                    return

                # If sequential, check if another sequential is currently executing
                if exp.execution_mode == "sequential":
                    active_running = db.query(Experiment).filter(
                        Experiment.status == "running",
                        Experiment.execution_mode == "sequential",
                        Experiment.id != exp_id
                    ).first()

                    if active_running and self.is_running(active_running.id):
                        exp.status = "queued"
                        db.commit()
                        await self.broadcast(exp_id, "status_change", {"status": "queued"})
                        return

                # Otherwise start execution directly
                self._pause_flags[exp_id] = False
                self._cancel_flags[exp_id] = False
                exp.status = "running"
                if not exp.started_at:
                    exp.started_at = datetime.datetime.utcnow()
                db.commit()
                
                await self.broadcast(exp_id, "status_change", {"status": "running"})
                task = asyncio.create_task(self._run_experiment_loop(exp_id))
                self._active_tasks[exp_id] = task
            finally:
                db.close()

    async def pause_experiment(self, exp_id: str):
        """Signals runner to pause after the current row completes."""
        self._pause_flags[exp_id] = True
        db: Session = SessionLocal()
        try:
            exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
            if exp and exp.status == "queued":
                exp.status = "paused"
                exp.paused_at = datetime.datetime.utcnow()
                db.commit()
                await self.broadcast(exp_id, "status_change", {"status": "paused"})
        finally:
            db.close()

    async def resume_experiment(self, exp_id: str):
        """Resumes a paused experiment from its row checkpoint."""
        await self.enqueue_or_start(exp_id)

    async def cancel_experiment(self, exp_id: str):
        """Cancels a running or queued experiment."""
        self._cancel_flags[exp_id] = True
        db: Session = SessionLocal()
        try:
            exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
            if exp:
                exp.status = "cancelled"
                db.commit()
                await self.broadcast(exp_id, "status_change", {"status": "cancelled"})
        finally:
            db.close()

        # Check if another sequential experiment is queued
        await self._check_next_in_queue()

    async def _check_next_in_queue(self):
        """Checks and starts the next queued sequential experiment."""
        async with self._queue_lock:
            db: Session = SessionLocal()
            try:
                next_exp = db.query(Experiment).filter(
                    Experiment.status == "queued",
                    Experiment.execution_mode == "sequential"
                ).order_by(Experiment.created_at.asc()).first()

                if next_exp:
                    next_id = next_exp.id
                    next_exp.status = "running"
                    if not next_exp.started_at:
                        next_exp.started_at = datetime.datetime.utcnow()
                    db.commit()
                    
                    self._pause_flags[next_id] = False
                    self._cancel_flags[next_id] = False
                    await self.broadcast(next_id, "status_change", {"status": "running"})
                    task = asyncio.create_task(self._run_experiment_loop(next_id))
                    self._active_tasks[next_id] = task
            finally:
                db.close()

    async def _run_experiment_loop(self, exp_id: str):
        """Main execution engine loop with row-by-row checkpointing."""
        db: Session = SessionLocal()
        try:
            exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
            if not exp:
                return

            user_config = db.query(UserConfiguration).filter(UserConfiguration.user_id == exp.user_id).first()
            api_keys = user_config.api_keys if user_config and user_config.api_keys else {}

            # 1. Clean prompt template & extract evaluation specification
            clean_template, eval_spec = prompt_engine.extract_evaluation_spec(exp.template, exp.task_type)
            if exp.eval_spec and isinstance(exp.eval_spec, dict):
                for k, v in exp.eval_spec.items():
                    if v is not None and hasattr(eval_spec, k):
                        setattr(eval_spec, k, v)

            # 2. Helper to extract ID from any row dict
            def extract_row_id(r_dict: dict) -> str:
                for k in ["id", "review_id", "sample_id", "key"]:
                    if k in r_dict and r_dict[k] is not None:
                        return str(r_dict[k]).strip()
                if exp.id_column and exp.id_column in r_dict and r_dict[exp.id_column] is not None:
                    return str(r_dict[exp.id_column]).strip()
                return ""

            # Fetch candidate input rows from DuckDB dataset
            paginated = dataset_engine.get_paginated_rows(
                dataset_id=exp.dataset_id,
                offset=0,
                limit=100000
            )
            raw_input_rows = paginated.rows

            # 3. If Ground Truth is selected, load GT datasets and perform strict INNER JOIN by ID
            gt_id_list = list(exp.ground_truth_dataset_ids or [])
            if exp.ground_truth_dataset_id and exp.ground_truth_dataset_id not in gt_id_list:
                gt_id_list.append(exp.ground_truth_dataset_id)

            gt_datasets_info = [] # List of tuples: (gt_id, display_name, gt_row_map)
            for gt_id in gt_id_list:
                try:
                    gt_ds_meta = dataset_engine.get_dataset(gt_id)
                    ds_name = gt_ds_meta.name if gt_ds_meta else gt_id
                    gt_paginated = dataset_engine.get_paginated_rows(
                        dataset_id=gt_id,
                        offset=0,
                        limit=100000
                    )
                    row_map = {}
                    for g_row in gt_paginated.rows:
                        gid = extract_row_id(g_row)
                        if gid:
                            row_map[gid] = g_row
                    if row_map:
                        gt_datasets_info.append((gt_id, ds_name, row_map))
                except Exception as gt_err:
                    print(f"[ExperimentQueue] Error loading ground truth dataset {gt_id}: {gt_err}")

            # Filter rows to only those present in ALL selected Ground Truth datasets (strict inner join)
            if gt_datasets_info:
                aligned_input_rows = [
                    r for r in raw_input_rows
                    if all(extract_row_id(r) in item[2] for item in gt_datasets_info)
                ]
                rows = aligned_input_rows[:exp.sample_size]
            else:
                rows = raw_input_rows[:exp.sample_size]

            total_rows = len(rows)
            exp.total_samples = total_rows
            db.commit()

            model_ids = list(exp.model_ids)
            total_steps = len(model_ids) * total_rows if (model_ids and total_rows) else 1

            raw_results: Dict[str, List[Dict[str, Any]]] = dict(exp.raw_results or {})
            for m in model_ids:
                if m not in raw_results:
                    raw_results[m] = []

            summaries: Dict[str, Any] = dict(exp.summaries or {})

            # 4. If Ground Truth datasets are present, construct human baseline for each rater aligned 1:1 with rows
            human_rater_ids = []
            for gt_id, gt_display_name, gt_map in gt_datasets_info:
                human_model_id = f"human_expert_{gt_id}" if len(gt_datasets_info) > 1 else "human_expert"
                human_rater_ids.append(human_model_id)
                try:
                    human_results = []
                    for idx, row in enumerate(rows):
                        rid = extract_row_id(row)
                        g_row = gt_map.get(rid, {})

                        parsed_gt = {}
                        if "_raw_json" in g_row and g_row["_raw_json"]:
                            try:
                                full_obj = json.loads(g_row["_raw_json"])
                                parsed_gt = full_obj.get("ground_truth") or full_obj.get("target") or full_obj
                            except Exception:
                                parsed_gt = dict(g_row)
                        else:
                            reconstructed = {}
                            for gk, gv in g_row.items():
                                if gk.startswith("ground_truth.") or gk.startswith("target."):
                                    parts = gk.split(".")
                                    if len(parts) >= 3:
                                        d_name, f_name = parts[1], parts[2]
                                        if d_name not in reconstructed:
                                            reconstructed[d_name] = {}
                                        try:
                                            reconstructed[d_name][f_name] = json.loads(gv) if (isinstance(gv, str) and gv.startswith("[")) else gv
                                        except Exception:
                                            reconstructed[d_name][f_name] = gv
                            parsed_gt = reconstructed if reconstructed else dict(g_row)

                        human_results.append({
                            "sample_index": idx,
                            "sample_id": rid,
                            "row_context": row,
                            "is_valid_json": True,
                            "parsed_json": parsed_gt,
                            "raw_response": json.dumps(parsed_gt, ensure_ascii=False),
                            "latency_ms": 0.0,
                            "prompt_tokens": 0,
                            "completion_tokens": 0,
                            "estimated_cost_usd": 0.0,
                            "success": True,
                            "model_id": human_model_id
                        })

                    raw_results[human_model_id] = human_results
                    human_summary = metrics_engine.compute_model_metrics(
                        model_id=human_model_id,
                        results=human_results,
                        eval_spec=eval_spec
                    )
                    h_dict = human_summary.model_dump()
                    h_dict["is_human_baseline"] = True
                    h_dict["model_name"] = gt_display_name if len(gt_datasets_info) > 1 else (exp.ground_truth_name or gt_display_name or "Experto Humano")
                    summaries[human_model_id] = h_dict
                except Exception as gt_err:
                    print(f"[ExperimentQueue] Note: error computing ground truth baseline for {gt_id}: {gt_err}")

            # Resume checkpoint tracking
            start_model_idx = exp.current_model_index or 0
            start_sample_idx = exp.current_sample_index or 0

            await self.broadcast(exp_id, "experiment_start", {
                "experiment_id": exp_id,
                "models": model_ids,
                "total_samples": total_rows,
                "total_steps": total_steps
            })

            # Iterate over models
            for m_idx in range(start_model_idx, len(model_ids)):
                model_id = model_ids[m_idx]
                row_start = start_sample_idx if m_idx == start_model_idx else 0
                exp.current_model_index = m_idx
                exp.current_sample_index = row_start
                eval_spec_dict = dict(exp.eval_spec or {}) if isinstance(exp.eval_spec, dict) else {}
                eval_spec_dict["_runtime_phase"] = "loading_vram"
                eval_spec_dict["_loading_model"] = model_id
                eval_spec_dict["_current_row"] = row_start
                exp.eval_spec = eval_spec_dict
                db.commit()

                await self.broadcast(exp_id, "model_loading_vram", {
                    "model_id": model_id,
                    "model_index": m_idx + 1,
                    "total_models": len(model_ids),
                })

                # Get model temperature if assigned
                model_temps = getattr(exp, "model_temperatures", {}) or (exp.eval_spec.get("model_temperatures") if isinstance(exp.eval_spec, dict) else {}) or {}
                assigned_temp = model_temps.get(model_id)
                if assigned_temp is None and "/" in model_id:
                    assigned_temp = model_temps.get(model_id.split("/")[-1])

                # Load model into memory in Ollama with assigned temperature (executed ONCE at model load time)
                custom_ollama = api_keys.get("ollama_url") or api_keys.get("ollama")
                await llm_manager.load_model(model_id, temperature=assigned_temp, custom_url=custom_ollama)

                eval_spec_dict = dict(exp.eval_spec or {}) if isinstance(exp.eval_spec, dict) else {}
                eval_spec_dict["_runtime_phase"] = "processing_rows"
                eval_spec_dict["_current_row"] = min(row_start + 1, total_rows)
                exp.eval_spec = eval_spec_dict
                db.commit()

                await self.broadcast(exp_id, "model_start", {
                    "model_id": model_id,
                    "model_index": m_idx + 1,
                    "total_models": len(model_ids),
                    "resumed_from_sample": row_start,
                    "temperature": assigned_temp if assigned_temp is not None else 0.8
                })

                for s_idx in range(row_start, total_rows):
                    # Check pause or cancel flags before invoking LLM
                    if self._pause_flags.get(exp_id):
                        exp.status = "paused"
                        exp.paused_at = datetime.datetime.utcnow()
                        db.commit()
                        await self.broadcast(exp_id, "status_change", {
                            "status": "paused",
                            "paused_at_model": model_id,
                            "paused_at_sample": s_idx
                        })
                        return

                    if self._cancel_flags.get(exp_id):
                        exp.status = "cancelled"
                        db.commit()
                        await self.broadcast(exp_id, "status_change", {"status": "cancelled"})
                        return

                    row = rows[s_idx]

                    # Render prompt using single-pass regex variable injection from dataset row
                    prompt = prompt_engine.render_prompt_variables(clean_template, row)

                    # Invoke Model (with fallback simulation for resilience)
                    response = await llm_manager.invoke_model(
                        model_id=model_id,
                        prompt=prompt,
                        system_prompt=exp.system_prompt,
                        api_keys=api_keys,
                        row_context=row,
                        eval_spec=eval_spec,
                        output_schema=eval_spec.output_schema if eval_spec else None
                    )


                    row_result = {
                        "sample_index": s_idx,
                        "row_context": row,
                        **response.model_dump()
                    }
                    raw_results[model_id].append(row_result)

                    # Compute progressive metrics for this model
                    current_summary = metrics_engine.compute_model_metrics(
                        model_id=model_id,
                        results=raw_results[model_id],
                        eval_spec=eval_spec
                    )
                    summaries[model_id] = current_summary.model_dump()

                    # Save row checkpoint directly to PostgreSQL
                    completed_steps = (m_idx * total_rows) + (s_idx + 1)
                    progress_pct = round(min(100.0, (completed_steps / total_steps) * 100.0), 1)

                    exp.current_model_index = m_idx
                    exp.current_sample_index = s_idx + 1
                    exp.progress_pct = progress_pct
                    exp.raw_results = raw_results
                    exp.summaries = summaries
                    eval_spec_dict = dict(exp.eval_spec or {}) if isinstance(exp.eval_spec, dict) else {}
                    eval_spec_dict["_runtime_phase"] = "processing_rows"
                    eval_spec_dict["_current_row"] = min(s_idx + 2, total_rows)
                    exp.eval_spec = eval_spec_dict
                    db.commit()

                    # Emit progressive sample update
                    sample_payload = {
                        "experiment_id": exp_id,
                        "model_id": model_id,
                        "model_index": m_idx + 1,
                        "total_models": len(model_ids),
                        "sample_index": s_idx + 1,
                        "total_samples": total_rows,
                        "progress_pct": progress_pct,
                        "latest_result": {
                            "row_id": row.get(exp.id_column or "review_id", str(s_idx + 1)),
                            "latency_ms": response.latency_ms,
                            "is_valid_json": response.is_valid_json,
                            "estimated_cost_usd": response.estimated_cost_usd,
                            "raw_response": (response.raw_response or "")[:200]
                        },
                        "current_summary": current_summary.model_dump()
                    }
                    await self.broadcast(exp_id, "sample_update", sample_payload)
                    await asyncio.sleep(0.01)

                    # Check if user requested pause right after row finished
                    if self._pause_flags.get(exp_id):
                        exp.status = "paused"
                        exp.paused_at = datetime.datetime.utcnow()
                        db.commit()
                        await self.broadcast(exp_id, "status_change", {
                            "status": "paused",
                            "paused_at_model": model_id,
                            "paused_at_sample": s_idx + 1
                        })
                        return

                # Model completed
                await self.broadcast(exp_id, "model_finished", {
                    "model_id": model_id,
                    "summary": summaries[model_id]
                })

            # All models completed: post-processing
            all_eval_raters = list(model_ids) + [h for h in human_rater_ids if h in raw_results]
            if "human_expert" in raw_results and "human_expert" not in all_eval_raters:
                all_eval_raters.append("human_expert")

            pairwise_list: List[PairwiseComparison] = []
            for i in range(len(all_eval_raters)):
                for j in range(i + 1, len(all_eval_raters)):
                    ma = all_eval_raters[i]
                    mb = all_eval_raters[j]
                    pair_comp = metrics_engine.compute_pairwise_comparison(
                        model_a=ma,
                        results_a=raw_results.get(ma, []),
                        model_b=mb,
                        results_b=raw_results.get(mb, []),
                        eval_spec=eval_spec
                    )
                    if (ma in human_rater_ids or ma == "human_expert") or (mb in human_rater_ids or mb == "human_expert"):
                        pair_comp.is_vs_human = True
                    pairwise_list.append(pair_comp)

            # Compute Human Baseline Ratio (Pilar 2, Nivel C: Agreement(LLM, Human) / Agreement(Human1, Human2))
            human_human_pairs = [
                p for p in pairwise_list
                if (p.model_a in human_rater_ids or p.model_a == "human_expert") and
                   (p.model_b in human_rater_ids or p.model_b == "human_expert")
            ]
            if human_human_pairs and human_human_pairs[0].cohens_kappa > 0:
                h_kappa = human_human_pairs[0].cohens_kappa
                for p in pairwise_list:
                    if p.is_vs_human:
                        p.human_baseline_ratio = round(p.cohens_kappa / h_kappa, 4)

            # Calculate top performers across metrics
            best_performers = self._calculate_best_performers(summaries)

            exp.status = "completed"
            exp.progress_pct = 100.0
            exp.completed_at = datetime.datetime.utcnow()
            exp.pairwise_matrix = [p.model_dump() for p in pairwise_list]
            exp.best_performers = best_performers
            eval_spec_dict = dict(exp.eval_spec or {}) if isinstance(exp.eval_spec, dict) else {}
            eval_spec_dict["_runtime_phase"] = "completed"
            exp.eval_spec = eval_spec_dict
            db.commit()

            completion_payload = {
                "experiment_id": exp_id,
                "status": "completed",
                "summaries": summaries,
                "pairwise_matrix": [p.model_dump() for p in pairwise_list],
                "best_performers": best_performers
            }
            await self.broadcast(exp_id, "experiment_completed", completion_payload)

        except Exception as e:
            print(f"[ExperimentQueue] Error running experiment {exp_id}: {e}")
            exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
            if exp:
                exp.status = "failed"
                exp.error_message = str(e)
                db.commit()
            await self.broadcast(exp_id, "status_change", {"status": "failed", "error": str(e)})
        finally:
            db.close()
            # If sequential, check if another experiment is waiting in queue
            await self._check_next_in_queue()

    def _calculate_best_performers(self, summaries: Dict[str, Any]) -> Dict[str, str]:
        if not summaries:
            return {}
        best: Dict[str, str] = {}
        models = list(summaries.keys())

        # Safely determine lowest latency, highest throughput, lowest cost, etc.
        try:
            best["latency"] = min(models, key=lambda m: summaries[m].get("mean_latency_ms", 999999))
            best["throughput"] = max(models, key=lambda m: summaries[m].get("throughput_tokens_sec", 0))
            best["cost"] = min(models, key=lambda m: summaries[m].get("total_cost_usd", 999999))
            best["json_validity"] = max(models, key=lambda m: summaries[m].get("json_validity_rate", 0))
            best["consistency"] = max(models, key=lambda m: summaries[m].get("internal_consistency_score", 0))
        except Exception:
            pass
        return best

experiment_queue = ExperimentQueueManager()
