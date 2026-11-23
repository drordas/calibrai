import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Query, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session
from backend.app.api.auth import get_current_user, get_optional_current_user
from backend.app.core.config import settings
from backend.app.core.dataset_engine import dataset_engine
from backend.app.db.models import DatasetRecord, DatasetShare, Experiment, User
from backend.app.db.session import get_db
from backend.app.schemas.dataset import (
    DatasetRenameRequest,
    DatasetShareEntryOut,
    DatasetShareRequest,
    DatasetShareRespondRequest,
    DatasetSummary,
    PaginatedRowsResponse,
    ShareUserOut,
)

router = APIRouter(prefix="/api/datasets", tags=["datasets"])

def _ensure_dataset_ownership(datasets: List[DatasetSummary], db: Session) -> Dict[str, DatasetRecord]:
    records = {r.dataset_id: r for r in db.query(DatasetRecord).all()}
    first_user = db.query(User).order_by(User.id.asc()).first()
    if first_user:
        added = False
        for ds in datasets:
            if ds.id not in records:
                rec = DatasetRecord(
                    dataset_id=ds.id,
                    owner_user_id=first_user.id,
                    display_name=ds.name,
                    is_ground_truth=ds.is_ground_truth,
                )
                db.add(rec)
                records[ds.id] = rec
                added = True
        if added:
            db.commit()
    return records


@router.get("", response_model=List[DatasetSummary])
def list_datasets(
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    datasets = dataset_engine.list_datasets()
    if not current_user:
        return datasets

    records = _ensure_dataset_ownership(datasets, db)

    incoming_shares = (
        db.query(DatasetShare)
        .filter(
            DatasetShare.target_user_id == current_user.id,
            DatasetShare.status.in_(["pending", "accepted"]),
        )
        .all()
    )
    outgoing_shared_ids = {
        (s.source_dataset_id or s.dataset_id)
        for s in db.query(DatasetShare)
        .filter(
            DatasetShare.owner_user_id == current_user.id,
            DatasetShare.share_mode.in_(["view", "edit", "copy"]),
        )
        .all()
    }

    owner_ids = {s.owner_user_id for s in incoming_shares}
    owners = (
        {
            u.id: u.username
            for u in db.query(User).filter(User.id.in_(owner_ids)).all()
        }
        if owner_ids
        else {}
    )
    share_by_dataset = {s.dataset_id: s for s in incoming_shares}

    enriched: List[DatasetSummary] = []
    for ds in datasets:
        rec = records.get(ds.id)
        share = share_by_dataset.get(ds.id)
        is_owner = bool(rec and rec.owner_user_id == current_user.id)

        # Only show datasets owned by this user or shared with this user
        if not is_owner and not share:
            continue

        overrides: Dict[str, Any] = {}
        if rec:
            if rec.display_name:
                overrides["name"] = rec.display_name
            if rec.is_ground_truth is not None:
                overrides["is_ground_truth"] = rec.is_ground_truth

        if share:
            if share.custom_name:
                overrides["name"] = share.custom_name
            overrides.update(
                {
                    "is_shared": True,
                    "is_shared_by_owner": ds.id in outgoing_shared_ids,
                    "share_mode": share.share_mode,
                    "share_status": share.status,
                    "shared_by": owners.get(share.owner_user_id, ""),
                    "share_id": share.id,
                }
            )
        else:
            overrides["is_shared_by_owner"] = ds.id in outgoing_shared_ids

        enriched.append(ds.model_copy(update=overrides))
    return enriched


@router.get("/share/users", response_model=List[ShareUserOut])
def list_shareable_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User)
        .filter(
            User.is_active == True,
            User.id != current_user.id,
            User.allow_dataset_sharing == True,
        )
        .order_by(User.username.asc())
        .all()
    )
    return [
        ShareUserOut(id=u.id, username=u.username, full_name=u.full_name)
        for u in users
    ]


@router.get("/{dataset_id}/shares", response_model=List[DatasetShareEntryOut])
def list_dataset_shares(
    dataset_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    shares = (
        db.query(DatasetShare)
        .filter(
            DatasetShare.dataset_id == dataset_id,
            DatasetShare.owner_user_id == current_user.id,
            DatasetShare.share_mode.in_(["view", "edit"]),
        )
        .all()
    )
    if not shares:
        return []
    user_ids = {s.target_user_id for s in shares}
    users = {u.id: u.username for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    return [
        DatasetShareEntryOut(
            id=s.id,
            target_user_id=s.target_user_id,
            target_username=users.get(s.target_user_id, ""),
            share_mode=s.share_mode,
            status=s.status,
        )
        for s in shares
    ]


@router.delete("/{dataset_id}/shares/{share_id}")
def revoke_dataset_share(
    dataset_id: str,
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share = (
        db.query(DatasetShare)
        .filter(
            DatasetShare.id == share_id,
            DatasetShare.dataset_id == dataset_id,
            DatasetShare.owner_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Compartición no encontrada")
    db.delete(share)
    db.commit()
    return {"status": "revoked", "share_id": share_id}


@router.post("/{dataset_id}/share")
def share_dataset(
    dataset_id: str,
    req: DatasetShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = dataset_engine.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")
    if req.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes compartir un dataset contigo mismo")

    if current_user.allow_dataset_sharing is False:
        raise HTTPException(
            status_code=403,
            detail="Tienes deshabilitada la opción de compartir datasets en tu perfil.",
        )

    mode = req.share_mode if req.share_mode in ("view", "edit", "copy") else "view"
    target_user = db.query(User).filter(User.id == req.target_user_id, User.is_active == True).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario destino no encontrado")
    if target_user.allow_dataset_sharing is False:
        raise HTTPException(
            status_code=400,
            detail="Este usuario no tiene habilitada la recepción de datasets compartidos.",
        )

    target_dataset_id = dataset_id
    if mode == "copy":
        meta = dataset_engine.datasets.get(dataset_id)
        src_path = meta.get("file_path") if meta else None
        if not src_path or not Path(src_path).exists():
            raise HTTPException(status_code=500, detail="No se encontró el archivo origen del dataset para copiar")
        copy_stem = f"copy_{uuid.uuid4().hex[:8]}_{Path(src_path).stem}"
        copy_filename = f"{copy_stem}{Path(src_path).suffix}"
        copy_path = settings.upload_dir / copy_filename
        shutil.copy2(src_path, copy_path)
        copied_summary = dataset_engine.register_dataset(
            file_path=copy_path,
            name=f"{ds.name} (Copia)",
            is_sample=False,
            dataset_id=f"upload_{copy_stem}",
            is_ground_truth=ds.is_ground_truth,
        )
        target_dataset_id = copied_summary.id
        db.add(
            DatasetRecord(
                dataset_id=target_dataset_id,
                owner_user_id=target_user.id,
                display_name=f"{ds.name} (Copia)",
                is_ground_truth=ds.is_ground_truth,
            )
        )

    existing = (
        db.query(DatasetShare)
        .filter(
            DatasetShare.dataset_id == target_dataset_id,
            DatasetShare.target_user_id == target_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Este dataset ya está compartido con ese usuario.",
        )

    db.add(
        DatasetShare(
            dataset_id=target_dataset_id,
            source_dataset_id=dataset_id,
            owner_user_id=current_user.id,
            target_user_id=target_user.id,
            share_mode=mode,
            status="pending",
        )
    )
    db.commit()
    return {"status": "shared", "dataset_id": target_dataset_id, "share_mode": mode, "target_username": target_user.username}


@router.post("/shares/{share_id}/respond")
def respond_to_dataset_share(
    share_id: int,
    req: DatasetShareRespondRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share = (
        db.query(DatasetShare)
        .filter(
            DatasetShare.id == share_id,
            DatasetShare.target_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Invitación de dataset no encontrada")

    if req.accept:
        share.status = "accepted"
        db.commit()
        return {"status": "accepted", "share_id": share_id}

    is_copy = share.share_mode == "copy"
    copy_ds_id = share.dataset_id
    db.delete(share)
    db.commit()
    if is_copy:
        dataset_engine.delete_dataset(copy_ds_id)
    return {"status": "rejected", "share_id": share_id}


@router.get("/{dataset_id}", response_model=DatasetSummary)
def get_dataset(dataset_id: str):
    ds = dataset_engine.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


@router.patch("/{dataset_id}", response_model=DatasetSummary)
def rename_dataset(
    dataset_id: str,
    req: DatasetRenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ds = dataset_engine.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    clean_name = req.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre del dataset no puede estar vacío")

    share = (
        db.query(DatasetShare)
        .filter(
            DatasetShare.dataset_id == dataset_id,
            DatasetShare.target_user_id == current_user.id,
        )
        .first()
    )
    if share and share.share_mode != "copy":
        share.custom_name = clean_name
        db.commit()
        return ds.model_copy(update={"name": clean_name})

    rec = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == dataset_id).first()
    if rec:
        rec.display_name = clean_name
    else:
        db.add(
            DatasetRecord(
                dataset_id=dataset_id,
                owner_user_id=current_user.id,
                display_name=clean_name,
                is_ground_truth=ds.is_ground_truth,
            )
        )
    if dataset_id in dataset_engine.datasets and dataset_engine.datasets[dataset_id].get("summary"):
        dataset_engine.datasets[dataset_id]["summary"].name = clean_name
    db.commit()
    return ds.model_copy(update={"name": clean_name})

@router.delete("/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    exp_query = db.query(Experiment).filter(
        or_(
            Experiment.dataset_id == dataset_id,
            Experiment.ground_truth_dataset_id == dataset_id,
        )
    )
    if current_user:
        shared_for_user = (
            db.query(DatasetShare)
            .filter(
                DatasetShare.dataset_id == dataset_id,
                DatasetShare.target_user_id == current_user.id,
            )
            .first()
        )
        if shared_for_user:
            exp_query.filter(Experiment.user_id == current_user.id).delete(synchronize_session=False)
            is_copy = shared_for_user.share_mode == "copy"
            db.delete(shared_for_user)
            db.commit()
            if is_copy:
                dataset_engine.delete_dataset(dataset_id)
            return {"status": "unshared", "dataset_id": dataset_id}

    active_shares = (
        db.query(DatasetShare)
        .filter(
            DatasetShare.dataset_id == dataset_id,
            DatasetShare.share_mode.in_(["view", "edit"]),
        )
        .count()
    )
    if active_shares > 0:
        raise HTTPException(
            status_code=400,
            detail="No puedes eliminar este dataset mientras esté compartido con otros usuarios. Deja de compartirlo primero.",
        )

    deleted_experiments = exp_query.delete(synchronize_session=False)
    db.query(DatasetShare).filter(DatasetShare.dataset_id == dataset_id).delete(synchronize_session=False)
    db.query(DatasetRecord).filter(DatasetRecord.dataset_id == dataset_id).delete(synchronize_session=False)
    db.commit()

    success = dataset_engine.delete_dataset(dataset_id)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset no encontrado")
    return {"status": "deleted", "dataset_id": dataset_id, "deleted_experiments": deleted_experiments}


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

@router.get("/{dataset_id}/export")
def export_dataset(
    dataset_id: str,
    format: str = Query("csv", pattern="^(csv|json)$"),
):
    try:
        content, media_type, filename = dataset_engine.export_dataset(dataset_id, fmt=format)
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="Dataset not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=DatasetSummary)
async def upload_dataset(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    expected_input_dataset_id: Optional[str] = Form(None),
    is_ground_truth: Optional[bool] = Form(None),
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
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
            name=name or Path(file.filename).stem.replace("_", " ").title(),
            is_ground_truth=is_ground_truth,
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

        if current_user:
            existing_rec = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == summary.id).first()
            if existing_rec:
                existing_rec.owner_user_id = current_user.id
                existing_rec.display_name = summary.name
                existing_rec.is_ground_truth = summary.is_ground_truth
            else:
                db.add(
                    DatasetRecord(
                        dataset_id=summary.id,
                        owner_user_id=current_user.id,
                        display_name=summary.name,
                        is_ground_truth=summary.is_ground_truth,
                    )
                )
            db.commit()

        return summary
    except HTTPException:
        raise
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        raise HTTPException(status_code=500, detail=f"Error procesando dataset: {str(e)}")

