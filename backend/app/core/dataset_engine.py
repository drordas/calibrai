import os
import re
import uuid
import json
import threading
import duckdb
import pandas as pd
from pathlib import Path
from typing import Dict, Any, List, Optional
from backend.app.core.config import settings
from backend.app.schemas.dataset import ColumnInfo, DatasetSummary, PaginatedRowsResponse

class DatasetEngine:
    def __init__(self):
        self._lock = threading.RLock()
        self.conn = duckdb.connect(database=":memory:")
        self.datasets: Dict[str, Dict[str, Any]] = {}
        self._load_sample_datasets()
        self._load_uploaded_datasets()

    def _load_sample_datasets(self):
        try:
            if settings.sample_dir.exists():
                for p in sorted(settings.sample_dir.glob("*.*")):
                    if p.suffix.lower() in [".csv", ".json", ".jsonl", ".xlsx", ".xls"]:
                        try:
                            self.register_dataset(p, name=p.stem.replace("_", " ").title(), is_sample=True, dataset_id=f"sample_{p.stem}")
                        except Exception as e:
                            print(f"Error loading sample dataset {p}: {e}")
        except Exception as e:
            print(f"Error scanning sample dir: {e}")

    def _load_uploaded_datasets(self):
        try:
            if settings.upload_dir.exists():
                for p in sorted(settings.upload_dir.glob("*.*")):
                    if p.suffix.lower() in [".csv", ".json", ".jsonl", ".xlsx", ".xls"]:
                        try:
                            # Skip if already registered from sample_dir with the same filename
                            if any(
                                meta.get("summary") and meta["summary"].filename == p.name
                                for meta in self.datasets.values()
                            ):
                                continue
                            self.register_dataset(
                                p,
                                name=p.stem.replace("_", " ").title(),
                                is_sample=False,
                                dataset_id=f"upload_{p.stem}",
                            )
                        except Exception as e:
                            print(f"Error loading uploaded dataset {p}: {e}")
        except Exception as e:
            print(f"Error scanning upload dir: {e}")

    def register_dataset(
        self,
        file_path: Path,
        name: Optional[str] = None,
        is_sample: bool = False,
        dataset_id: Optional[str] = None
    ) -> DatasetSummary:
        name = name or file_path.stem.replace("_", " ").title()
        file_ext = file_path.suffix.lower()

        # Extract internal benchmark ID from JSON if available
        benchmark_id: Optional[str] = None
        jdata = None
        if file_ext in [".json", ".jsonl"]:
            try:
                with open(file_path, "r", encoding="utf-8") as jf:
                    jdata = json.load(jf)
                if isinstance(jdata, dict) and jdata.get("id"):
                    benchmark_id = str(jdata["id"]).strip()
            except Exception:
                pass

        # De-duplication check: check if a dataset with same benchmark_id, dataset_id or filename already exists
        matched_existing_id: Optional[str] = None
        for existing_id, existing_meta in self.datasets.items():
            existing_summary = existing_meta.get("summary")
            if benchmark_id and getattr(existing_summary, "benchmark_id", None) == benchmark_id:
                matched_existing_id = existing_id
                break
            if benchmark_id and existing_id == benchmark_id:
                matched_existing_id = existing_id
                break
            if dataset_id and existing_id == dataset_id:
                matched_existing_id = existing_id
                break
            if existing_summary and existing_summary.filename == file_path.name:
                matched_existing_id = existing_id
                break

        if matched_existing_id:
            dataset_id = matched_existing_id
        elif not dataset_id:
            dataset_id = benchmark_id if benchmark_id else f"ds_{uuid.uuid4().hex[:10]}"

        table_name = f"t_{re.sub(r'[^a-zA-Z0-9_]', '_', dataset_id)}"

        # Drop old DuckDB table/view if updating an existing dataset
        try:
            self.conn.execute(f"DROP VIEW IF EXISTS {table_name}")
            self.conn.execute(f"DROP TABLE IF EXISTS {table_name}")
        except Exception:
            pass

        # Load into DuckDB table
        if file_ext == ".csv":
            self.conn.execute(f"""
                CREATE OR REPLACE TABLE {table_name} AS 
                SELECT * FROM read_csv_auto('{file_path}', all_varchar=false, header=true, ignore_errors=true);
            """)
        elif file_ext in [".json", ".jsonl"]:
            is_benchmark_json = False
            try:
                if jdata is None:
                    with open(file_path, "r", encoding="utf-8") as jf:
                        jdata = json.load(jf)
                
                rows_list = None
                if isinstance(jdata, dict):
                    for k in ["reviews", "items", "samples", "data", "rows"]:
                        if k in jdata and isinstance(jdata[k], list):
                            rows_list = jdata[k]
                            break
                elif isinstance(jdata, list):
                    rows_list = jdata

                if rows_list and len(rows_list) > 0 and isinstance(rows_list[0], dict):
                    records = []
                    for r in rows_list:
                        if not isinstance(r, dict):
                            continue
                        rid = str(r.get("id") or r.get("review_id") or "")
                        rec = {"id": rid, "_raw_json": json.dumps(r, ensure_ascii=False)}

                        # Flatten input
                        if "input" in r and isinstance(r["input"], dict):
                            for ik, iv in r["input"].items():
                                rec[f"input.{ik}"] = iv
                        
                        # Flatten ground_truth / target
                        gt = r.get("ground_truth") or r.get("target")
                        if gt and isinstance(gt, dict):
                            for gk, gv in gt.items():
                                if isinstance(gv, dict):
                                    for subk, subv in gv.items():
                                        rec[f"ground_truth.{gk}.{subk}"] = json.dumps(subv, ensure_ascii=False) if isinstance(subv, (list, dict)) else subv
                                else:
                                    rec[f"ground_truth.{gk}"] = json.dumps(gv, ensure_ascii=False) if isinstance(gv, (list, dict)) else gv
                        else:
                            for k, v in r.items():
                                if k not in ["id", "review_id", "input", "_raw_json"] and isinstance(v, dict):
                                    for subk, subv in v.items():
                                        rec[f"ground_truth.{k}.{subk}"] = json.dumps(subv, ensure_ascii=False) if isinstance(subv, (list, dict)) else subv

                        records.append(rec)

                    df = pd.DataFrame(records)
                    cur = self.conn.cursor()
                    cur.register(f"temp_df_{table_name}", df)
                    cur.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM temp_df_{table_name};")
                    cur.unregister(f"temp_df_{table_name}")
                    cur.close()
                    is_benchmark_json = True
            except Exception as e:
                print(f"[DatasetEngine] Custom JSON parsing fallback: {e}")

            if not is_benchmark_json:
                self.conn.execute(f"""
                    CREATE OR REPLACE TABLE {table_name} AS 
                    SELECT * FROM read_json_auto('{file_path}');
                """)
        elif file_ext in [".xlsx", ".xls"]:
            # Load Excel with Pandas then import to DuckDB
            df = pd.read_excel(file_path)
            cur = self.conn.cursor()
            cur.register(f"temp_df_{table_name}", df)
            cur.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM temp_df_{table_name};")
            cur.unregister(f"temp_df_{table_name}")
            cur.close()
        else:
            raise ValueError(f"Unsupported file format: {file_ext}. Supported: CSV, JSON, XLSX, XLS.")

        # Get total rows
        total_rows = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]

        # Get column info
        schema_info = self.conn.execute(f"DESCRIBE {table_name}").fetchall()
        columns: List[ColumnInfo] = []
        unique_columns: List[str] = []

        for col_name, col_type, null_allowed, key, default, extra in schema_info:
            # Get 3 non-null sample values safely
            try:
                samples = [
                    str(row[0]) for row in self.conn.execute(
                        f'SELECT CAST("{col_name}" AS VARCHAR) FROM {table_name} WHERE "{col_name}" IS NOT NULL LIMIT 3'
                    ).fetchall()
                ]
            except Exception:
                samples = []

            # Count nulls
            try:
                null_count = self.conn.execute(
                    f'SELECT COUNT(*) FROM {table_name} WHERE "{col_name}" IS NULL'
                ).fetchone()[0]
            except Exception:
                null_count = 0

            # Count distinct values to detect unique columns
            try:
                unique_count = self.conn.execute(
                    f'SELECT COUNT(DISTINCT "{col_name}") FROM {table_name} WHERE "{col_name}" IS NOT NULL'
                ).fetchone()[0]
            except Exception:
                unique_count = None

            is_unique_values = bool(unique_count is not None and total_rows > 0 and unique_count == total_rows and null_count == 0)
            has_internal_spaces = False
            if is_unique_values:
                try:
                    space_count = self.conn.execute(
                        f'SELECT COUNT(*) FROM {table_name} WHERE "{col_name}" IS NOT NULL AND regexp_matches(TRIM(CAST("{col_name}" AS VARCHAR)), \'\\s\')'
                    ).fetchone()[0]
                    has_internal_spaces = bool(space_count and space_count > 0)
                except Exception:
                    has_internal_spaces = any(bool(re.search(r"\s", s.strip())) for s in samples)

            is_unique = bool(is_unique_values and not has_internal_spaces)
            if is_unique:
                unique_columns.append(col_name)

            columns.append(ColumnInfo(
                name=col_name,
                data_type=col_type,
                sample_values=[str(s) for s in samples],
                null_count=null_count,
                unique_count=unique_count,
                is_unique=is_unique,
                is_id_candidate=False
            ))

        # Detect best ID column among unique columns
        detected_id: Optional[str] = None
        if unique_columns:
            id_pattern = re.compile(r"(^id$|_id$|^id_|uuid|guid|key|codigo|code|pk|hash|identifier|identificador)", re.IGNORECASE)
            best_id_col = None
            best_score = -1

            for col in columns:
                if col.is_unique:
                    score = 10  # Base score for any unique column
                    if id_pattern.search(col.name):
                        score += 100
                    if any(t in col.data_type.lower() for t in ["int", "bigint", "smallint", "uuid"]):
                        score += 30
                    # Average sample string length: IDs are typically short tokens (< 40 chars)
                    avg_len = sum(len(s) for s in col.sample_values) / max(len(col.sample_values), 1)
                    if avg_len < 40:
                        score += 20
                    # Penalize typical long text or timestamp columns if they happen to have unique values
                    if any(w in col.name.lower() for w in ["comment", "text", "description", "body", "date", "time", "url"]):
                        score -= 50

                    if score > best_score:
                        best_score = score
                        best_id_col = col.name

            if best_id_col:
                detected_id = best_id_col
                for col in columns:
                    if col.name == best_id_col:
                        col.is_id_candidate = True

        # Determine if dataset is Ground Truth (contains ground_truth annotations or dimensions)
        has_gt_cols = any(c.name.startswith("ground_truth.") or c.name.startswith("target.") for c in columns)
        has_eval_dims = any("." in c.name and not c.name.startswith("input.") for c in columns)
        is_gt = bool(has_gt_cols or has_eval_dims)

        file_size = file_path.stat().st_size if file_path.exists() else 0

        summary = DatasetSummary(
            id=dataset_id,
            name=name,
            filename=file_path.name,
            format=file_ext.lstrip("."),
            total_rows=total_rows,
            size_bytes=file_size,
            columns=columns,
            is_sample=is_sample,
            detected_id_column=detected_id,
            is_ground_truth=is_gt,
            benchmark_id=benchmark_id
        )

        # Pre-cache IDs for zero-latency compatibility checks without DuckDB query contention
        cached_ids = []
        try:
            with self._lock:
                id_query_col = detected_id or (columns[0].name if columns else "id")
                rows = self.conn.execute(
                    f'SELECT DISTINCT CAST("{id_query_col}" AS VARCHAR) FROM {table_name} WHERE "{id_query_col}" IS NOT NULL'
                ).fetchall()
                cached_ids = [str(r[0]) for r in rows if r[0] is not None and str(r[0]).strip()]
        except Exception as e:
            print(f"[DatasetEngine] Warning caching IDs for {dataset_id}: {e}")

        self.datasets[dataset_id] = {
            "summary": summary,
            "table_name": table_name,
            "file_path": file_path,
            "cached_ids": cached_ids
        }

        return summary

    def list_datasets(self) -> List[DatasetSummary]:
        return [meta["summary"] for meta in self.datasets.values()]

    def get_dataset(self, dataset_id: str) -> Optional[DatasetSummary]:
        meta = self.datasets.get(dataset_id)
        if not meta and self.datasets:
            if dataset_id in ["sample_reviews", "sample", "default"] or "sample" in dataset_id:
                first_sample = next((m for m in self.datasets.values() if m["summary"].is_sample), None)
                if first_sample:
                    meta = first_sample
        return meta["summary"] if meta else None

    def delete_dataset(self, dataset_id: str) -> bool:
        meta = self.datasets.pop(dataset_id, None)
        if not meta:
            return False

        table_name = meta.get("table_name")
        if table_name:
            try:
                self.conn.execute(f"DROP VIEW IF EXISTS {table_name}")
                self.conn.execute(f"DROP TABLE IF EXISTS {table_name}")
            except Exception:
                pass

        file_path = meta.get("file_path")
        summary = meta.get("summary")
        is_sample = getattr(summary, "is_sample", False)
        if file_path and isinstance(file_path, Path) and file_path.exists() and not is_sample:
            try:
                file_path.unlink()
            except Exception:
                pass

        return True

    def get_paginated_rows(
        self,
        dataset_id: str,
        offset: int = 0,
        limit: int = 50,
        columns: Optional[List[str]] = None,
        search: Optional[str] = None
    ) -> PaginatedRowsResponse:
        meta = self.datasets.get(dataset_id)
        if not meta and self.datasets:
            if dataset_id in ["sample_reviews", "sample", "default"] or "sample" in dataset_id:
                first_sample = next((m for m in self.datasets.values() if m["summary"].is_sample), None)
                if first_sample:
                    meta = first_sample

        if not meta:
            raise KeyError(f"Dataset {dataset_id} not found.")

        table_name = meta["table_name"]
        all_cols = [c.name for c in meta["summary"].columns]
        selected_cols = columns if columns and len(columns) > 0 else all_cols

        # Sanitize column names for query
        cols_sql = ", ".join([f'"{col}"' for col in selected_cols])

        where_clause = ""
        if search and search.strip():
            safe_search = search.strip().replace("'", "''")
            search_conditions = [
                f'CAST("{col}" AS VARCHAR) ILIKE \'%{safe_search}%\''
                for col in selected_cols
            ]
            where_clause = f" WHERE {' OR '.join(search_conditions)}"

        with self._lock:
            # Total rows matching search
            total_matching = self.conn.execute(
                f"SELECT COUNT(*) FROM {table_name}{where_clause}"
            ).fetchone()[0]

            # Fetch records
            query = f"SELECT {cols_sql} FROM {table_name}{where_clause} LIMIT {limit} OFFSET {offset}"
            df = self.conn.execute(query).df()

        # Convert to serializable dicts (handling NaN, timestamps)
        records = df.fillna("").to_dict(orient="records")
        for record in records:
            for k, v in record.items():
                if hasattr(v, "isoformat"):
                    record[k] = v.isoformat()

        return PaginatedRowsResponse(
            dataset_id=dataset_id,
            total_rows=total_matching,
            offset=offset,
            limit=limit,
            columns=selected_cols,
            rows=records
        )

    def get_dataset_ids(self, dataset_id: str) -> List[str]:
        if dataset_id not in self.datasets:
            return []
        meta = self.datasets[dataset_id]
        if meta.get("cached_ids"):
            return meta["cached_ids"]

        table_name = meta["table_name"]
        id_col = meta["summary"].detected_id_column

        if not id_col:
            for c in meta["summary"].columns:
                if c.name.lower() in ["id", "review_id", "sample_id", "key"]:
                    id_col = c.name
                    break

        if not id_col and meta["summary"].columns:
            id_col = meta["summary"].columns[0].name

        try:
            with self._lock:
                rows = self.conn.execute(
                    f'SELECT DISTINCT CAST("{id_col}" AS VARCHAR) FROM {table_name} WHERE "{id_col}" IS NOT NULL'
                ).fetchall()
            cached = [str(r[0]) for r in rows if r[0] is not None and str(r[0]).strip()]
            meta["cached_ids"] = cached
            return cached
        except Exception as e:
            print(f"[DatasetEngine] Error getting IDs for {dataset_id}: {e}")
            return []

    def get_dataset_schema_info(self, dataset_id: str) -> Dict[str, Any]:
        if dataset_id not in self.datasets:
            return {}
        meta = self.datasets[dataset_id]
        if meta.get("cached_schema"):
            return meta["cached_schema"]

        table_name = meta["table_name"]
        cols = [c.name for c in meta["summary"].columns]

        # Detect input fields
        input_fields = []
        for c in cols:
            if c.startswith("input."):
                input_fields.append(c.replace("input.", ""))
            elif c.lower() in ["review_comment", "comment", "review_text", "text", "body", "review_rating", "rating"]:
                input_fields.append(c)

        # Detect ground_truth dimensions and fields
        dimensions: Dict[str, Dict[str, Any]] = {}
        for c in cols:
            parts = c.split(".")
            dim_name, field_name = None, None
            if len(parts) >= 3 and parts[0] in ["ground_truth", "target"]:
                dim_name = parts[1]
                field_name = parts[2]
            elif len(parts) == 2 and parts[0] not in ["input"]:
                dim_name = parts[0]
                field_name = parts[1]

            if dim_name and field_name:
                if dim_name not in dimensions:
                    dimensions[dim_name] = {
                        "name": dim_name,
                        "sentiment_field": None,
                        "markers_fields": [],
                        "sentiment_categories": []
                    }
                if "sentiment" in field_name.lower():
                    dimensions[dim_name]["sentiment_field"] = field_name
                    try:
                        with self._lock:
                            cat_rows = self.conn.execute(
                                f'SELECT DISTINCT CAST("{c}" AS VARCHAR) FROM {table_name} WHERE "{c}" IS NOT NULL'
                            ).fetchall()
                        cats = [str(cr[0]) for cr in cat_rows if cr[0] and str(cr[0]).strip()]
                        dimensions[dim_name]["sentiment_categories"] = cats
                    except Exception:
                        pass
                elif any(m in field_name.lower() for m in ["marker", "cita", "snippet"]):
                    dimensions[dim_name]["markers_fields"].append(field_name)

        has_ground_truth = len(dimensions) > 0
        all_sentiment_cats = set()
        for d in dimensions.values():
            all_sentiment_cats.update(d.get("sentiment_categories", []))

        schema_res = {
            "dataset_id": dataset_id,
            "id_column": meta["summary"].detected_id_column,
            "has_ground_truth": has_ground_truth,
            "input_fields": list(set(input_fields)),
            "dimensions": list(dimensions.values()),
            "sentiment_categories": sorted(list(all_sentiment_cats))
        }
        meta["cached_schema"] = schema_res
        return schema_res

    def check_ground_truth_compatibility(self, input_dataset_id: str, ground_truth_dataset_id: str) -> Dict[str, Any]:
        input_ids = set(self.get_dataset_ids(input_dataset_id))
        gt_ids = set(self.get_dataset_ids(ground_truth_dataset_id))

        common_ids = input_ids.intersection(gt_ids)
        total_input = len(input_ids)
        overlap_pct = (len(common_ids) / total_input * 100.0) if total_input > 0 else 0.0

        schema = self.get_dataset_schema_info(ground_truth_dataset_id)
        compatible = (len(common_ids) > 0) and schema.get("has_ground_truth", False)

        error_msg = None
        if len(common_ids) == 0:
            error_msg = "El dataset seleccionado como Ground Truth no comparte ningún ID con el dataset de entrada."
        elif not schema.get("has_ground_truth", False):
            error_msg = "El dataset no contiene dimensiones evaluables de Ground Truth (ej. brand_awareness.sentiment, etc.)."

        return {
            "compatible": compatible,
            "common_ids_count": len(common_ids),
            "total_input_ids": total_input,
            "total_ground_truth_ids": len(gt_ids),
            "overlap_percentage": round(overlap_pct, 1),
            "schema": schema,
            "error": error_msg
        }

    def get_compatible_ground_truths(self, input_dataset_id: str) -> List[Dict[str, Any]]:
        compatibles = []
        for ds_id in self.datasets:
            if ds_id == input_dataset_id:
                continue
            res = self.check_ground_truth_compatibility(input_dataset_id, ds_id)
            if res.get("compatible"):
                compatibles.append({
                    "dataset_id": ds_id,
                    "dataset_name": self.datasets[ds_id]["summary"].name,
                    "filename": self.datasets[ds_id]["summary"].filename,
                    "common_ids_count": res["common_ids_count"],
                    "total_ground_truth_ids": res["total_ground_truth_ids"],
                    "overlap_percentage": res["overlap_percentage"],
                    "dimensions_count": len(res.get("schema", {}).get("dimensions", [])),
                    "schema": res.get("schema")
                })
        return compatibles

dataset_engine = DatasetEngine()

