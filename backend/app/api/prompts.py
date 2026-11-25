from typing import List, Optional
import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.db.models import SavedPrompt, PromptShare, DatasetShare, DatasetRecord, User
from backend.app.api.auth import get_current_user
from backend.app.core.config import settings
from backend.app.core.dataset_engine import dataset_engine
from backend.app.schemas.prompt import (
    PromptTemplateRequest,
    GeneratedPromptResponse,
    PromptValidationRequest,
    PromptValidationResponse
)
from backend.app.core.prompt_engine import prompt_engine

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


class SavePromptRequest(BaseModel):
    name: str
    dataset_id: str
    system_prompt: str = ""
    model_prompt: str


class UpdatePromptRequest(BaseModel):
    name: str
    dataset_id: Optional[str] = None
    system_prompt: str = ""
    model_prompt: str


class SavedPromptOut(BaseModel):
    id: int
    dataset_id: Optional[str] = None
    name: str
    system_prompt: str
    model_prompt: str
    created_at: str
    updated_at: str
    is_shared: bool = False
    is_shared_by_owner: bool = False
    shared_by: Optional[str] = None
    share_mode: Optional[str] = None
    share_id: Optional[int] = None


class PromptShareRequest(BaseModel):
    target_user_id: int
    share_mode: str = "view"  # "view" | "edit" | "copy"
    dataset_share_mode: Optional[str] = None  # "view" | "edit" | "copy" when dataset not yet shared


class PromptShareEntryOut(BaseModel):
    id: int
    target_user_id: int
    target_username: str
    share_mode: str
    status: str


class UpdatePromptShareModeRequest(BaseModel):
    share_mode: str

@router.post("/generate", response_model=GeneratedPromptResponse)
def generate_prompt_template(req: PromptTemplateRequest):
    try:
        return prompt_engine.generate_template(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/validate", response_model=PromptValidationResponse)
def validate_prompt_template(req: PromptValidationRequest):
    try:
        return prompt_engine.validate_prompt(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/saved", response_model=List[SavedPromptOut])
def list_saved_prompts(
    dataset_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_query = db.query(SavedPrompt).filter(SavedPrompt.user_id == current_user.id)
    if dataset_id:
        owned_query = owned_query.filter(SavedPrompt.dataset_id == dataset_id)
    owned_rows = owned_query.order_by(SavedPrompt.updated_at.desc(), SavedPrompt.id.desc()).all()

    owned_ids = [r.id for r in owned_rows]
    outgoing_shared_ids = set()
    if owned_ids:
        outgoing_shared_ids = {
            s.prompt_id
            for s in db.query(PromptShare)
            .filter(
                PromptShare.owner_user_id == current_user.id,
                PromptShare.prompt_id.in_(owned_ids),
                PromptShare.share_mode.in_(["view", "edit"]),
                PromptShare.status.in_(["pending", "accepted"]),
            )
            .all()
        }

    result: List[SavedPromptOut] = [
        SavedPromptOut(
            id=r.id,
            dataset_id=r.dataset_id,
            name=r.name,
            system_prompt=r.system_prompt or "",
            model_prompt=r.model_prompt,
            created_at=r.created_at.isoformat() if r.created_at else "",
            updated_at=r.updated_at.isoformat() if r.updated_at else "",
            is_shared=False,
            is_shared_by_owner=r.id in outgoing_shared_ids,
        )
        for r in owned_rows
    ]

    incoming_shares = (
        db.query(PromptShare)
        .filter(
            PromptShare.target_user_id == current_user.id,
            PromptShare.share_mode.in_(["view", "edit"]),
        )
        .all()
    )
    if incoming_shares:
        shared_prompt_ids = [s.prompt_id for s in incoming_shares]
        owner_ids = {s.owner_user_id for s in incoming_shares}
        owners = {u.id: u.username for u in db.query(User).filter(User.id.in_(owner_ids)).all()}
        shared_prompts_query = db.query(SavedPrompt).filter(SavedPrompt.id.in_(shared_prompt_ids))
        if dataset_id:
            shared_prompts_query = shared_prompts_query.filter(SavedPrompt.dataset_id == dataset_id)
        shared_map = {p.id: p for p in shared_prompts_query.all()}
        for s in incoming_shares:
            p = shared_map.get(s.prompt_id)
            if not p or p.user_id == current_user.id:
                continue
            result.append(
                SavedPromptOut(
                    id=p.id,
                    dataset_id=p.dataset_id,
                    name=p.name,
                    system_prompt=p.system_prompt or "",
                    model_prompt=p.model_prompt,
                    created_at=p.created_at.isoformat() if p.created_at else "",
                    updated_at=p.updated_at.isoformat() if p.updated_at else "",
                    is_shared=True,
                    is_shared_by_owner=False,
                    shared_by=owners.get(s.owner_user_id, ""),
                    share_mode=s.share_mode,
                    share_id=s.id,
                )
            )

    return result


@router.post("/saved", response_model=SavedPromptOut)
def create_saved_prompt(
    req: SavePromptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_name = req.name.strip()
    clean_dataset_id = (req.dataset_id or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre del prompt es obligatorio.")
    if not clean_dataset_id:
        raise HTTPException(status_code=400, detail="El dataset asociado es obligatorio.")
    if not req.model_prompt or not req.model_prompt.strip():
        raise HTTPException(status_code=400, detail="El prompt del modelo no puede estar vacío.")

    row = SavedPrompt(
        user_id=current_user.id,
        dataset_id=clean_dataset_id,
        name=clean_name,
        system_prompt=req.system_prompt or "",
        model_prompt=req.model_prompt,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SavedPromptOut(
        id=row.id,
        dataset_id=row.dataset_id,
        name=row.name,
        system_prompt=row.system_prompt or "",
        model_prompt=row.model_prompt,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


@router.put("/saved/{prompt_id}", response_model=SavedPromptOut)
def update_saved_prompt(
    prompt_id: int,
    req: UpdatePromptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(SavedPrompt).filter(SavedPrompt.id == prompt_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Prompt guardado no encontrado.")
    is_owner = row.user_id == current_user.id
    shared_edit = None
    if not is_owner:
        shared_edit = (
            db.query(PromptShare)
            .filter(
                PromptShare.prompt_id == prompt_id,
                PromptShare.target_user_id == current_user.id,
                PromptShare.share_mode == "edit",
            )
            .first()
        )
        if not shared_edit:
            raise HTTPException(status_code=403, detail="No tienes permiso de edición sobre este prompt.")
    clean_name = req.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre del prompt es obligatorio.")
    if not req.model_prompt or not req.model_prompt.strip():
        raise HTTPException(status_code=400, detail="El prompt del modelo no puede estar vacío.")

    row.name = clean_name
    if req.dataset_id is not None:
        row.dataset_id = req.dataset_id.strip() or None
    row.system_prompt = req.system_prompt or ""
    row.model_prompt = req.model_prompt
    db.commit()
    db.refresh(row)
    return SavedPromptOut(
        id=row.id,
        dataset_id=row.dataset_id,
        name=row.name,
        system_prompt=row.system_prompt or "",
        model_prompt=row.model_prompt,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
        is_shared=not is_owner,
        share_mode=shared_edit.share_mode if shared_edit else None,
        share_id=shared_edit.id if shared_edit else None,
    )


@router.get("/saved/{prompt_id}/shares", response_model=List[PromptShareEntryOut])
def list_prompt_shares(
    prompt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    shares = (
        db.query(PromptShare)
        .filter(
            PromptShare.prompt_id == prompt_id,
            PromptShare.owner_user_id == current_user.id,
            PromptShare.share_mode.in_(["view", "edit"]),
            PromptShare.status.in_(["pending", "accepted"]),
        )
        .all()
    )
    if not shares:
        return []
    user_ids = {s.target_user_id for s in shares}
    users = {u.id: u.username for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    return [
        PromptShareEntryOut(
            id=s.id,
            target_user_id=s.target_user_id,
            target_username=users.get(s.target_user_id, ""),
            share_mode=s.share_mode,
            status=s.status,
        )
        for s in shares
    ]


@router.patch("/saved/{prompt_id}/shares/{share_id}", response_model=PromptShareEntryOut)
def update_prompt_share_mode(
    prompt_id: int,
    share_id: int,
    req: UpdatePromptShareModeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.share_mode not in ("view", "edit"):
        raise HTTPException(status_code=400, detail="Modo de compartición inválido")
    share = (
        db.query(PromptShare)
        .filter(
            PromptShare.id == share_id,
            PromptShare.prompt_id == prompt_id,
            PromptShare.owner_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Compartición no encontrada")
    share.share_mode = req.share_mode
    db.commit()
    db.refresh(share)
    target_user = db.query(User).filter(User.id == share.target_user_id).first()
    return PromptShareEntryOut(
        id=share.id,
        target_user_id=share.target_user_id,
        target_username=target_user.username if target_user else "",
        share_mode=share.share_mode,
        status=share.status,
    )


@router.delete("/saved/{prompt_id}/shares/{share_id}")
def revoke_prompt_share(
    prompt_id: int,
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share = (
        db.query(PromptShare)
        .filter(
            PromptShare.id == share_id,
            PromptShare.prompt_id == prompt_id,
            PromptShare.owner_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Compartición no encontrada")
    db.delete(share)
    db.commit()
    return {"status": "revoked", "share_id": share_id}


@router.post("/saved/{prompt_id}/share")
def share_saved_prompt(
    prompt_id: int,
    req: PromptShareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prompt = (
        db.query(SavedPrompt)
        .filter(SavedPrompt.id == prompt_id, SavedPrompt.user_id == current_user.id)
        .first()
    )
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt guardado no encontrado.")
    if req.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes compartir un prompt contigo mismo.")

    target_user = db.query(User).filter(User.id == req.target_user_id, User.is_active == True).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario destino no encontrado.")

    mode = req.share_mode if req.share_mode in ("view", "edit", "copy") else "view"

    # Check whether the associated dataset is already shared with target_user (or owned by target_user)
    linked_dataset_id = (prompt.dataset_id or "").strip()
    effective_target_dataset_id = linked_dataset_id
    if linked_dataset_id:
        ds_rec = db.query(DatasetRecord).filter(DatasetRecord.dataset_id == linked_dataset_id).first()
        owned_by_target = bool(ds_rec and ds_rec.owner_user_id == target_user.id)
        existing_ds_share = (
            db.query(DatasetShare)
            .filter(
                DatasetShare.target_user_id == target_user.id,
                (DatasetShare.dataset_id == linked_dataset_id) | (DatasetShare.source_dataset_id == linked_dataset_id),
            )
            .first()
        )
        if not owned_by_target and not existing_ds_share:
            if not req.dataset_share_mode:
                ds_summary = dataset_engine.get_dataset(linked_dataset_id)
                return {
                    "status": "dataset_share_required",
                    "requires_dataset_share": True,
                    "dataset_id": linked_dataset_id,
                    "dataset_name": ds_summary.name if ds_summary else linked_dataset_id,
                    "target_user_id": target_user.id,
                    "target_username": target_user.username,
                }

            ds_mode = req.dataset_share_mode if req.dataset_share_mode in ("view", "edit", "copy") else "view"
            if ds_mode == "copy":
                ds_summary = dataset_engine.get_dataset(linked_dataset_id)
                meta = dataset_engine.datasets.get(linked_dataset_id)
                src_path = meta.get("file_path") if meta else None
                if not ds_summary or not src_path or not Path(src_path).exists():
                    raise HTTPException(status_code=500, detail="No se encontró el archivo origen del dataset para copiar.")
                copy_stem = f"copy_{uuid.uuid4().hex[:8]}_{Path(src_path).stem}"
                copy_filename = f"{copy_stem}{Path(src_path).suffix}"
                copy_path = settings.upload_dir / copy_filename
                shutil.copy2(src_path, copy_path)
                copied_summary = dataset_engine.register_dataset(
                    file_path=copy_path,
                    name=f"{ds_summary.name} (Copia)",
                    is_sample=False,
                    dataset_id=f"upload_{copy_stem}",
                    is_ground_truth=ds_summary.is_ground_truth,
                    force_new=True,
                )
                effective_target_dataset_id = copied_summary.id
                db.add(
                    DatasetRecord(
                        dataset_id=effective_target_dataset_id,
                        owner_user_id=target_user.id,
                        display_name=f"{ds_summary.name} (Copia)",
                        is_ground_truth=ds_summary.is_ground_truth,
                    )
                )

            db.add(
                DatasetShare(
                    dataset_id=effective_target_dataset_id,
                    source_dataset_id=linked_dataset_id,
                    owner_user_id=current_user.id,
                    target_user_id=target_user.id,
                    share_mode=ds_mode,
                    status="accepted",
                )
            )
            db.flush()
        elif existing_ds_share:
            effective_target_dataset_id = existing_ds_share.dataset_id

    if mode == "copy":
        cloned = SavedPrompt(
            user_id=target_user.id,
            dataset_id=effective_target_dataset_id or prompt.dataset_id,
            name=f"{prompt.name} (Copia)",
            system_prompt=prompt.system_prompt or "",
            model_prompt=prompt.model_prompt,
        )
        db.add(cloned)
        db.commit()
        return {"status": "shared", "prompt_id": cloned.id, "share_mode": "copy", "target_username": target_user.username}

    existing = (
        db.query(PromptShare)
        .filter(
            PromptShare.prompt_id == prompt_id,
            PromptShare.target_user_id == target_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Este prompt ya está compartido con ese usuario.")

    db.add(
        PromptShare(
            prompt_id=prompt_id,
            owner_user_id=current_user.id,
            target_user_id=target_user.id,
            share_mode=mode,
            status="accepted",
        )
    )
    db.commit()
    return {"status": "shared", "prompt_id": prompt_id, "share_mode": mode, "target_username": target_user.username}


@router.delete("/saved/{prompt_id}")
def delete_saved_prompt(
    prompt_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(SavedPrompt)
        .filter(SavedPrompt.id == prompt_id, SavedPrompt.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Prompt guardado no encontrado.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": prompt_id}
