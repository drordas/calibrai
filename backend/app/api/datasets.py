import shutil
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from backend.app.core.config import settings
from backend.app.core.dataset_engine import dataset_engine
from backend.app.schemas.dataset import DatasetSummary, PaginatedRowsResponse

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

@router.get("", response_model=List[DatasetSummary])
def list_datasets():
    return dataset_engine.list_datasets()

@router.get("/{dataset_id}", response_model=DatasetSummary)
def get_dataset(dataset_id: str):
    ds = dataset_engine.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds

@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str):
    success = dataset_engine.delete_dataset(dataset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")
    return {"status": "deleted", "dataset_id": dataset_id}


@router.get("/{dataset_id}/rows", response_model=PaginatedRowsResponse)
def get_dataset_rows(
    dataset_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    columns: Optional[str] = Query(None, description="Comma-separated column names"),
    search: Optional[str] = Query(None)
):
    col_list = [c.strip() for c in columns.split(",") if c.strip()] if columns else None
    try:
        return dataset_engine.get_paginated_rows(
            dataset_id=dataset_id,
            offset=offset,
            limit=limit,
            columns=col_list,
            search=search
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{dataset_id}/compatible-ground-truths")
def get_compatible_ground_truths(dataset_id: str):
    try:
        return dataset_engine.get_compatible_ground_truths(dataset_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/check-compatibility")
def check_compatibility(
    input_dataset_id: str = Query(...),
    ground_truth_dataset_id: str = Query(...)
):
    try:
        return dataset_engine.check_ground_truth_compatibility(input_dataset_id, ground_truth_dataset_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload", response_model=DatasetSummary)
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    expected_input_dataset_id: Optional[str] = Form(None)
):
    ext = Path(file.filename).suffix.lower()
    if ext not in [".csv", ".json", ".jsonl", ".xlsx", ".xls"]:
        raise HTTPException(
            status_code=400,
            detail=f"Formato '{ext}' no soportado. Por favor sube archivos CSV, JSON o Excel (.xlsx/.xls)."
        )

    file_path = settings.upload_dir / file.filename
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        summary = dataset_engine.register_dataset(
            file_path=file_path,
            name=name or Path(file.filename).stem.replace("_", " ").title()
        )

        # If an expected input dataset ID is provided, validate compatibility
        if expected_input_dataset_id:
            compat = dataset_engine.check_ground_truth_compatibility(expected_input_dataset_id, summary.id)
            if not compat.get("compatible"):
                dataset_engine.delete_dataset(summary.id)
                raise HTTPException(
                    status_code=400,
                    detail=compat.get("error") or "El archivo de Ground Truth subido no comparte IDs coincidentes con el dataset de entrada seleccionado."
                )

        return summary
    except HTTPException:
        raise
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Error procesando dataset: {str(e)}")

