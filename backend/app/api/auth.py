from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.db.models import User, UserConfiguration
from backend.app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from backend.app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
    UserConfigOut,
    UserConfigUpdate,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security_scheme = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se proporcionaron credenciales de autenticación",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = payload["sub"]
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos"
        )
    
    access_token = create_access_token(data={"sub": user.username, "uid": user.id})
    config = user.configuration
    if not config:
        config = UserConfiguration(user_id=user.id)
        db.add(config)
        db.commit()
        db.refresh(config)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserOut(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            is_active=user.is_active
        ),
        config=UserConfigOut(
            ollama_url=config.ollama_url or "",
            default_sample_size=config.default_sample_size or 25,
            default_task_type=config.default_task_type or "numeric_math",
            selected_models=config.selected_models or [],
            api_keys=config.api_keys or {},
            language="es" if (config.language in ("sp", "es") or not config.language) else config.language
        )
    )

@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    clean_username = req.username.strip()
    if len(clean_username) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario debe tener al menos 3 caracteres"
        )
    if len(req.password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña debe tener al menos 4 caracteres"
        )
    existing = db.query(User).filter(User.username == clean_username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de usuario ya está registrado"
        )

    user = User(
        username=clean_username,
        full_name=(req.full_name or "").strip() or None,
        hashed_password=get_password_hash(req.password),
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    lang = req.language if req.language in ("es", "usa", "uk") else "es"
    config = UserConfiguration(user_id=user.id, language=lang)
    db.add(config)
    db.commit()
    db.refresh(config)

    access_token = create_access_token(data={"sub": user.username, "uid": user.id})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserOut(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            is_active=user.is_active
        ),
        config=UserConfigOut(
            ollama_url=config.ollama_url or "",
            default_sample_size=config.default_sample_size or 25,
            default_task_type=config.default_task_type or "numeric_math",
            selected_models=config.selected_models or [],
            api_keys=config.api_keys or {},
            language=lang
        )
    )

@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    config = user.configuration
    user_lang = config.language if config and config.language else "es"
    if user_lang == "sp":
        user_lang = "es"
    return {
        "user": UserOut(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            is_active=user.is_active
        ),
        "config": UserConfigOut(
            ollama_url=config.ollama_url if (config and config.ollama_url) else "",
            default_sample_size=config.default_sample_size if config else 25,
            default_task_type=config.default_task_type if config else "numeric_math",
            selected_models=config.selected_models if config else [],
            api_keys=config.api_keys if config else {},
            language=user_lang
        )
    }

@router.put("/config", response_model=UserConfigOut)
def update_user_config(
    update: UserConfigUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    config = user.configuration
    if not config:
        config = UserConfiguration(user_id=user.id)
        db.add(config)

    if update.ollama_url is not None:
        config.ollama_url = update.ollama_url
    if update.default_sample_size is not None:
        config.default_sample_size = update.default_sample_size
    if update.default_task_type is not None:
        config.default_task_type = update.default_task_type
    if update.selected_models is not None:
        config.selected_models = update.selected_models
    if update.api_keys is not None:
        config.api_keys = update.api_keys
    if update.language is not None:
        lang_val = update.language.lower()
        config.language = "es" if lang_val in ("sp", "es") else lang_val

    db.commit()
    db.refresh(config)

    res_lang = config.language or "es"
    if res_lang == "sp":
        res_lang = "es"

    return UserConfigOut(
        ollama_url=config.ollama_url,
        default_sample_size=config.default_sample_size,
        default_task_type=config.default_task_type,
        selected_models=config.selected_models or [],
        api_keys=config.api_keys or {},
        language=res_lang
    )
