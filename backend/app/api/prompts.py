from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.db.models import SavedPrompt, User
from backend.app.api.auth import get_current_user
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
    system_prompt: str = ""
    model_prompt: str


class SavedPromptOut(BaseModel):
    id: int
    name: str
    system_prompt: str
    model_prompt: str
    created_at: str
    updated_at: str

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(SavedPrompt)
        .filter(SavedPrompt.user_id == current_user.id)
        .order_by(SavedPrompt.updated_at.desc(), SavedPrompt.id.desc())
        .all()
    )
    return [
        SavedPromptOut(
            id=r.id,
            name=r.name,
            system_prompt=r.system_prompt or "",
            model_prompt=r.model_prompt,
            created_at=r.created_at.isoformat() if r.created_at else "",
            updated_at=r.updated_at.isoformat() if r.updated_at else "",
        )
        for r in rows
    ]


@router.post("/saved", response_model=SavedPromptOut)
def create_saved_prompt(
    req: SavePromptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_name = req.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre del prompt es obligatorio.")
    if not req.model_prompt or not req.model_prompt.strip():
        raise HTTPException(status_code=400, detail="El prompt del modelo no puede estar vacío.")

    row = SavedPrompt(
        user_id=current_user.id,
        name=clean_name,
        system_prompt=req.system_prompt or "",
        model_prompt=req.model_prompt,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return SavedPromptOut(
        id=row.id,
        name=row.name,
        system_prompt=row.system_prompt or "",
        model_prompt=row.model_prompt,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


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
