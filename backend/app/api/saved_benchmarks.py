import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.db.models import User, SavedBenchmark
from backend.app.api.auth import get_current_user
from backend.app.schemas.saved_benchmark import (
    SaveBenchmarkRequest,
    SavedBenchmarkSummary,
    SavedBenchmarkDetail,
)

router = APIRouter(prefix="/api/benchmarks", tags=["saved_benchmarks"])

@router.post("/save", response_model=SavedBenchmarkSummary)
def save_benchmark(
    req: SaveBenchmarkRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    benchmark_id = req.benchmark_id or f"saved_{uuid.uuid4().hex[:10]}"
    
    # Check if existing to overwrite or create new
    existing = db.query(SavedBenchmark).filter(
        SavedBenchmark.id == benchmark_id,
        SavedBenchmark.user_id == user.id
    ).first()

    if existing:
        existing.name = req.name
        existing.description = req.description or ""
        existing.dataset_id = req.dataset_id
        existing.dataset_name = req.dataset_name or req.dataset_id
        existing.task_type = req.task_type
        existing.template = req.template
        existing.system_prompt = req.system_prompt or ""
        existing.model_ids = req.model_ids
        existing.sample_size = req.sample_size
        existing.model_summaries = req.model_summaries
        existing.pairwise_matrix = req.pairwise_matrix
        existing.best_performers = req.best_performers
        benchmark_obj = existing
    else:
        benchmark_obj = SavedBenchmark(
            id=benchmark_id,
            user_id=user.id,
            name=req.name,
            description=req.description or "",
            dataset_id=req.dataset_id,
            dataset_name=req.dataset_name or req.dataset_id,
            task_type=req.task_type,
            template=req.template,
            system_prompt=req.system_prompt or "",
            model_ids=req.model_ids,
            sample_size=req.sample_size,
            model_summaries=req.model_summaries,
            pairwise_matrix=req.pairwise_matrix,
            best_performers=req.best_performers
        )
        db.add(benchmark_obj)

    db.commit()
    db.refresh(benchmark_obj)

    return SavedBenchmarkSummary(
        id=benchmark_obj.id,
        name=benchmark_obj.name,
        description=benchmark_obj.description,
        dataset_id=benchmark_obj.dataset_id,
        dataset_name=benchmark_obj.dataset_name,
        task_type=benchmark_obj.task_type,
        model_ids=benchmark_obj.model_ids or [],
        sample_size=benchmark_obj.sample_size,
        created_at=benchmark_obj.created_at,
        model_count=len(benchmark_obj.model_ids or [])
    )

@router.get("/saved", response_model=List[SavedBenchmarkSummary])
def list_saved_benchmarks(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    benchmarks = db.query(SavedBenchmark).filter(
        SavedBenchmark.user_id == user.id
    ).order_by(SavedBenchmark.created_at.desc()).all()

    return [
        SavedBenchmarkSummary(
            id=b.id,
            name=b.name,
            description=b.description,
            dataset_id=b.dataset_id,
            dataset_name=b.dataset_name,
            task_type=b.task_type,
            model_ids=b.model_ids or [],
            sample_size=b.sample_size,
            created_at=b.created_at,
            model_count=len(b.model_ids or [])
        )
        for b in benchmarks
    ]

@router.get("/saved/{benchmark_id}", response_model=SavedBenchmarkDetail)
def get_saved_benchmark(
    benchmark_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    b = db.query(SavedBenchmark).filter(
        SavedBenchmark.id == benchmark_id,
        SavedBenchmark.user_id == user.id
    ).first()

    if not b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benchmark guardado no encontrado"
        )

    return SavedBenchmarkDetail(
        id=b.id,
        name=b.name,
        description=b.description,
        dataset_id=b.dataset_id,
        dataset_name=b.dataset_name,
        task_type=b.task_type,
        template=b.template,
        system_prompt=b.system_prompt,
        model_ids=b.model_ids or [],
        sample_size=b.sample_size,
        model_summaries=b.model_summaries or {},
        pairwise_matrix=b.pairwise_matrix or [],
        best_performers=b.best_performers or {},
        created_at=b.created_at
    )

@router.delete("/saved/{benchmark_id}")
def delete_saved_benchmark(
    benchmark_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    b = db.query(SavedBenchmark).filter(
        SavedBenchmark.id == benchmark_id,
        SavedBenchmark.user_id == user.id
    ).first()

    if not b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Benchmark guardado no encontrado"
        )

    db.delete(b)
    db.commit()
    return {"status": "success", "message": "Benchmark eliminado correctamente"}
