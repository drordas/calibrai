from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.db.models import ConnectionProfile, ConnectionProfileShare, User
from backend.app.api.auth import get_current_user
from backend.app.llm.base import ModelCatalogItem
from backend.app.llm.manager import llm_manager

router = APIRouter(prefix="/api/models", tags=["models"])

class CheckOllamaRequest(BaseModel):
    url: Optional[str] = None

class CheckOllamaResponse(BaseModel):
    is_online: bool
    models: List[str]

class DiscoverLocalRequest(BaseModel):
    url: str = ""
    profile_id: Optional[int] = None

class DiscoverLocalResponse(BaseModel):
    is_online: bool
    resolved_url: str
    models: List[ModelCatalogItem]
    excluded_remote_models: int = 0
    error: Optional[str] = None

class DiscoverRemoteRequest(BaseModel):
    provider: str
    api_key: str = ""
    profile_id: Optional[int] = None

class DiscoverRemoteResponse(BaseModel):
    is_valid: bool
    provider: str
    models: List[ModelCatalogItem]
    error: Optional[str] = None

class DetectVramResponse(BaseModel):
    detected: bool
    is_local: bool = True
    gpu_name: Optional[str] = None
    vram_gb: Optional[float] = None
    recommended_options: List[int] = [6, 8, 12, 16, 24, 32, 48, 80]

class CalculateContextRequest(BaseModel):
    dataset_id: str
    input_columns: List[str] = []
    context_columns: List[str] = []
    template: Optional[str] = None
    completion_tokens: int = 512

class CalculateContextResponse(BaseModel):
    dataset_id: str
    total_rows_evaluated: int
    columns_evaluated: List[str]
    fixed_prompt_chars: int
    fixed_prompt_tokens: int
    max_injected_chars: int
    max_injected_tokens: int
    max_total_chars: int
    estimated_prompt_tokens: int
    completion_tokens: int
    total_raw_tokens: int
    required_context_tokens: int
    avg_injected_chars: float = 0.0
    avg_injected_tokens: int = 0
    avg_prompt_tokens: int = 0
    avg_total_raw_tokens: int = 0
    explanation: str

@router.get("", response_model=List[ModelCatalogItem])
async def list_models():
    return await llm_manager.get_available_models()

def _resolve_profile_access(db: Session, profile_id: int, user_id: int):
    profile = db.query(ConnectionProfile).filter(ConnectionProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil de conexión no encontrado.")
    if profile.user_id == user_id:
        return profile, None
    share = (
        db.query(ConnectionProfileShare)
        .filter(
            ConnectionProfileShare.profile_id == profile_id,
            ConnectionProfileShare.target_user_id == user_id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=403, detail="No tienes acceso a este perfil de conexión.")
    return profile, share


@router.get("/detect-vram", response_model=DetectVramResponse)
async def detect_vram(
    url: Optional[str] = None,
    profile_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_url = url
    max_vram_cap = None
    if profile_id is not None:
        profile, share = _resolve_profile_access(db, profile_id, current_user.id)
        if profile.provider != "ollama":
            raise HTTPException(status_code=400, detail="El perfil seleccionado no es de tipo Ollama.")
        target_url = profile.ollama_url
        if share and share.max_vram_gb is not None:
            max_vram_cap = float(share.max_vram_gb)

    data = await llm_manager.detect_system_vram(target_url)
    if max_vram_cap is not None:
        if data.get("vram_gb") is not None:
            data["vram_gb"] = min(float(data["vram_gb"]), max_vram_cap)
        data["recommended_options"] = [opt for opt in data.get("recommended_options", []) if opt <= max_vram_cap]
    return DetectVramResponse(**data)

@router.post("/calculate-context", response_model=CalculateContextRequest if False else CalculateContextResponse)
def calculate_context(req: CalculateContextRequest):
    data = llm_manager.calculate_dataset_context(
        dataset_id=req.dataset_id,
        input_columns=req.input_columns,
        context_columns=req.context_columns,
        template=req.template,
        completion_tokens=req.completion_tokens
    )
    return CalculateContextResponse(**data)

@router.post("/check-ollama", response_model=CheckOllamaResponse)
async def check_ollama(req: CheckOllamaRequest):
    if req.url:
        llm_manager.ollama_base_url = req.url
    is_online, models = await llm_manager.check_ollama_status(req.url)
    return CheckOllamaResponse(is_online=is_online, models=models)

@router.post("/discover-local", response_model=DiscoverLocalResponse)
async def discover_local(
    req: DiscoverLocalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_url = req.url
    is_shared = False
    if req.profile_id is not None:
        profile, share = _resolve_profile_access(db, req.profile_id, current_user.id)
        if profile.provider != "ollama":
            raise HTTPException(status_code=400, detail="El perfil seleccionado no es de tipo Ollama.")
        target_url = profile.ollama_url
        is_shared = share is not None

    is_online, resolved_url, models, excluded_count, err = await llm_manager.discover_local_models(target_url)
    return DiscoverLocalResponse(
        is_online=is_online,
        resolved_url="" if is_shared else resolved_url,
        models=models,
        excluded_remote_models=excluded_count,
        error=err
    )

@router.post("/discover-remote", response_model=DiscoverRemoteResponse)
async def discover_remote(
    req: DiscoverRemoteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_provider = req.provider
    target_key = req.api_key
    if req.profile_id is not None:
        profile, _ = _resolve_profile_access(db, req.profile_id, current_user.id)
        target_provider = profile.provider
        target_key = profile.api_key

    is_valid, models, err = await llm_manager.discover_remote_models(target_provider, target_key)
    return DiscoverRemoteResponse(
        is_valid=is_valid,
        provider=target_provider,
        models=models,
        error=err
    )


class SaveConnectionProfileRequest(BaseModel):
    name: str
    provider: str
    ollama_url: str = ""
    api_key: str = ""
    vram_gb: Optional[float] = None


class ShareConnectionProfileRequest(BaseModel):
    target_user_id: int
    max_vram_gb: Optional[float] = None


class ConnectionProfileShareOut(BaseModel):
    id: int
    profile_id: int
    target_user_id: int
    target_username: str
    max_vram_gb: Optional[float] = None
    created_at: str


class ConnectionProfileOut(BaseModel):
    id: int
    name: str
    provider: str
    ollama_url: str
    api_key: str
    vram_gb: Optional[float] = None
    is_shared: bool = False
    owner_username: Optional[str] = None
    max_vram_gb: Optional[float] = None
    created_at: str
    updated_at: str


def _serialize_profile(
    row: ConnectionProfile,
    is_shared: bool = False,
    owner_username: Optional[str] = None,
    max_vram_gb: Optional[float] = None,
) -> ConnectionProfileOut:
    return ConnectionProfileOut(
        id=row.id,
        name=row.name,
        provider=row.provider,
        ollama_url="" if is_shared else (row.ollama_url or ""),
        api_key="" if is_shared else (row.api_key or ""),
        vram_gb=max_vram_gb if is_shared else row.vram_gb,
        is_shared=is_shared,
        owner_username=owner_username,
        max_vram_gb=max_vram_gb if is_shared else row.vram_gb,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


@router.get("/profiles", response_model=List[ConnectionProfileOut])
def list_connection_profiles(
    provider: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned_q = db.query(ConnectionProfile).filter(ConnectionProfile.user_id == current_user.id)
    if provider:
        owned_q = owned_q.filter(ConnectionProfile.provider == provider.strip().lower())
    owned_rows = owned_q.order_by(ConnectionProfile.updated_at.desc(), ConnectionProfile.id.desc()).all()

    result: List[ConnectionProfileOut] = [
        _serialize_profile(r, is_shared=False, owner_username=current_user.username)
        for r in owned_rows
    ]

    shared_q = (
        db.query(ConnectionProfileShare, ConnectionProfile, User)
        .join(ConnectionProfile, ConnectionProfileShare.profile_id == ConnectionProfile.id)
        .join(User, ConnectionProfileShare.owner_user_id == User.id)
        .filter(ConnectionProfileShare.target_user_id == current_user.id)
    )
    if provider:
        shared_q = shared_q.filter(ConnectionProfile.provider == provider.strip().lower())
    shared_rows = shared_q.order_by(ConnectionProfileShare.created_at.desc()).all()

    for share, prof, owner in shared_rows:
        result.append(
            _serialize_profile(
                prof,
                is_shared=True,
                owner_username=owner.username,
                max_vram_gb=share.max_vram_gb,
            )
        )
    return result


@router.post("/profiles", response_model=ConnectionProfileOut)
def create_connection_profile(
    req: SaveConnectionProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_name = req.name.strip()
    clean_provider = req.provider.strip().lower()
    clean_url = req.ollama_url.strip()
    clean_key = req.api_key.strip()

    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre del perfil no puede estar vacío.")

    duplicate = (
        db.query(ConnectionProfile)
        .filter(
            ConnectionProfile.user_id == current_user.id,
            func.lower(ConnectionProfile.name) == clean_name.lower(),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail=f"Ya tienes un perfil llamado '{clean_name}'. Usa un nombre único.")

    if clean_provider == "ollama":
        if not clean_url:
            raise HTTPException(status_code=400, detail="La URL de Ollama es obligatoria para este perfil.")
        if req.vram_gb is None or req.vram_gb <= 0:
            raise HTTPException(status_code=400, detail="Debes seleccionar la VRAM del sistema antes de guardar un perfil local.")
    else:
        if not clean_key:
            raise HTTPException(status_code=400, detail="La API-Key es obligatoria para un perfil en la nube.")

    row = ConnectionProfile(
        user_id=current_user.id,
        name=clean_name,
        provider=clean_provider,
        ollama_url=clean_url if clean_provider == "ollama" else "",
        api_key="" if clean_provider == "ollama" else clean_key,
        vram_gb=float(req.vram_gb) if clean_provider == "ollama" and req.vram_gb is not None else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_profile(row, is_shared=False, owner_username=current_user.username)


@router.get("/profiles/{profile_id}/shares", response_model=List[ConnectionProfileShareOut])
def list_profile_shares(
    profile_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(ConnectionProfile)
        .filter(ConnectionProfile.id == profile_id, ConnectionProfile.user_id == current_user.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil de conexión no encontrado.")

    rows = (
        db.query(ConnectionProfileShare, User)
        .join(User, ConnectionProfileShare.target_user_id == User.id)
        .filter(ConnectionProfileShare.profile_id == profile_id)
        .order_by(ConnectionProfileShare.created_at.desc())
        .all()
    )
    return [
        ConnectionProfileShareOut(
            id=s.id,
            profile_id=s.profile_id,
            target_user_id=s.target_user_id,
            target_username=u.username,
            max_vram_gb=s.max_vram_gb,
            created_at=s.created_at.isoformat() if s.created_at else "",
        )
        for s, u in rows
    ]


@router.post("/profiles/{profile_id}/share", response_model=ConnectionProfileShareOut)
def share_connection_profile(
    profile_id: int,
    req: ShareConnectionProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = (
        db.query(ConnectionProfile)
        .filter(ConnectionProfile.id == profile_id, ConnectionProfile.user_id == current_user.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil de conexión no encontrado.")
    if req.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes compartir un perfil contigo mismo.")

    target_user = db.query(User).filter(User.id == req.target_user_id, User.is_active == True).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario destino no encontrado.")

    assigned_vram = None
    if profile.provider == "ollama":
        owner_vram = float(profile.vram_gb or 0)
        if owner_vram <= 0:
            raise HTTPException(status_code=400, detail="El perfil local no tiene una VRAM válida configurada.")
        assigned_vram = float(req.max_vram_gb if req.max_vram_gb is not None else owner_vram)
        if assigned_vram <= 0 or assigned_vram > owner_vram:
            raise HTTPException(
                status_code=400,
                detail=f"La VRAM compartida debe ser mayor que 0 y no superar los {owner_vram} GB del perfil.",
            )

    existing = (
        db.query(ConnectionProfileShare)
        .filter(
            ConnectionProfileShare.profile_id == profile_id,
            ConnectionProfileShare.target_user_id == req.target_user_id,
        )
        .first()
    )
    if existing:
        existing.max_vram_gb = assigned_vram
        db.commit()
        db.refresh(existing)
        share_row = existing
    else:
        share_row = ConnectionProfileShare(
            profile_id=profile_id,
            owner_user_id=current_user.id,
            target_user_id=req.target_user_id,
            max_vram_gb=assigned_vram,
        )
        db.add(share_row)
        db.commit()
        db.refresh(share_row)

    return ConnectionProfileShareOut(
        id=share_row.id,
        profile_id=share_row.profile_id,
        target_user_id=share_row.target_user_id,
        target_username=target_user.username,
        max_vram_gb=share_row.max_vram_gb,
        created_at=share_row.created_at.isoformat() if share_row.created_at else "",
    )


@router.delete("/profiles/{profile_id}/shares/{share_id}")
def revoke_profile_share(
    profile_id: int,
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    share = (
        db.query(ConnectionProfileShare)
        .filter(
            ConnectionProfileShare.id == share_id,
            ConnectionProfileShare.profile_id == profile_id,
            ConnectionProfileShare.owner_user_id == current_user.id,
        )
        .first()
    )
    if not share:
        raise HTTPException(status_code=404, detail="Compartición no encontrada.")
    db.delete(share)
    db.commit()
    return {"status": "revoked", "id": share_id}


@router.put("/profiles/{profile_id}", response_model=ConnectionProfileOut)
def update_connection_profile(
    profile_id: int,
    req: SaveConnectionProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ConnectionProfile)
        .filter(ConnectionProfile.id == profile_id, ConnectionProfile.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Perfil de conexión no encontrado o no eres el propietario.")

    clean_name = req.name.strip()
    clean_url = req.ollama_url.strip()
    clean_key = req.api_key.strip()

    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre del perfil no puede estar vacío.")

    duplicate = (
        db.query(ConnectionProfile)
        .filter(
            ConnectionProfile.user_id == current_user.id,
            ConnectionProfile.id != profile_id,
            func.lower(ConnectionProfile.name) == clean_name.lower(),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail=f"Ya tienes un perfil llamado '{clean_name}'. Usa un nombre único.")

    if row.provider == "ollama":
        if not clean_url:
            raise HTTPException(status_code=400, detail="La URL de Ollama es obligatoria para este perfil.")
        if req.vram_gb is None or req.vram_gb <= 0:
            raise HTTPException(status_code=400, detail="Debes indicar una VRAM válida (mayor que 0 GB) para el perfil local.")
        row.ollama_url = clean_url
        row.vram_gb = float(req.vram_gb)
        # Clamp any existing shares that exceed the updated VRAM
        db.query(ConnectionProfileShare).filter(
            ConnectionProfileShare.profile_id == profile_id,
            ConnectionProfileShare.max_vram_gb > float(req.vram_gb),
        ).update({ConnectionProfileShare.max_vram_gb: float(req.vram_gb)}, synchronize_session=False)
    else:
        if not clean_key:
            raise HTTPException(status_code=400, detail="La API-Key es obligatoria para un perfil en la nube.")
        row.api_key = clean_key

    row.name = clean_name
    db.commit()
    db.refresh(row)
    return _serialize_profile(row, is_shared=False, owner_username=current_user.username)


@router.delete("/profiles/{profile_id}")
def delete_connection_profile(
    profile_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ConnectionProfile)
        .filter(ConnectionProfile.id == profile_id, ConnectionProfile.user_id == current_user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Perfil de conexión no encontrado.")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": profile_id}
