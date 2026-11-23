import re
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
    UserProfileUpdate,
    UserProfileResponse,
)

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_language(lang: Optional[str]) -> str:
    if not lang:
        return "es"
    clean = lang.lower().strip()
    if clean in ("sp", "es"):
        return "es"
    if clean in ("uk", "usa"):
        return clean
    return "es"


def _build_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        is_active=user.is_active,
    )


def _build_config_out(config: Optional[UserConfiguration]) -> UserConfigOut:
    return UserConfigOut(
        ollama_url=(config.ollama_url or "") if config else "",
        default_sample_size=(config.default_sample_size or 25) if config else 25,
        default_task_type=(config.default_task_type or "numeric_math") if config else "numeric_math",
        selected_models=(config.selected_models or []) if config else [],
        api_keys=(config.api_keys or {}) if config else {},
        language=_normalize_language(config.language if config else "es"),
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
        user=_build_user_out(user),
        config=_build_config_out(config),
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

    clean_email = (req.email or "").strip().lower() or None
    if clean_email:
        if not EMAIL_REGEX.match(clean_email):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El correo electrónico no tiene un formato válido"
            )
        if db.query(User).filter(User.email == clean_email).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El correo electrónico ya está registrado"
            )

    user = User(
        username=clean_username,
        full_name=(req.full_name or "").strip() or None,
        email=clean_email,
        hashed_password=get_password_hash(req.password),
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    lang = _normalize_language(req.language)
    config = UserConfiguration(user_id=user.id, language=lang)
    db.add(config)
    db.commit()
    db.refresh(config)

    access_token = create_access_token(data={"sub": user.username, "uid": user.id})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=_build_user_out(user),
        config=_build_config_out(config),
    )

@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "user": _build_user_out(user),
        "config": _build_config_out(user.configuration),
    }

@router.put("/profile", response_model=UserProfileResponse)
def update_user_profile(
    update: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if update.email is not None:
        clean_email = update.email.strip().lower()
        if clean_email:
            if not EMAIL_REGEX.match(clean_email):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="El correo electrónico no tiene un formato válido"
                )
            existing_email = db.query(User).filter(
                User.email == clean_email,
                User.id != user.id
            ).first()
            if existing_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Ese correo electrónico ya está en uso por otro usuario"
                )
            user.email = clean_email
        else:
            user.email = None

    if update.full_name is not None:
        user.full_name = update.full_name.strip() or None

    if update.new_password is not None and update.new_password != "":
        if not update.current_password or not verify_password(update.current_password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La contraseña actual es incorrecta"
            )
        if len(update.new_password) < 4:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La nueva contraseña debe tener al menos 4 caracteres"
            )
        user.hashed_password = get_password_hash(update.new_password)

    config = user.configuration
    if not config:
        config = UserConfiguration(user_id=user.id)
        db.add(config)

    if update.language is not None:
        config.language = _normalize_language(update.language)

    db.commit()
    db.refresh(user)
    db.refresh(config)

    return UserProfileResponse(
        user=_build_user_out(user),
        config=_build_config_out(config),
    )

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
