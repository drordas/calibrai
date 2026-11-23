from typing import Optional, List, Dict, Any
from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    language: Optional[str] = "es"

class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    is_active: bool

class UserConfigOut(BaseModel):
    ollama_url: str
    default_sample_size: int
    default_task_type: str
    selected_models: List[str] = []
    api_keys: Dict[str, str] = {}
    language: str = "es"

class UserConfigUpdate(BaseModel):
    ollama_url: Optional[str] = None
    default_sample_size: Optional[int] = None
    default_task_type: Optional[str] = None
    selected_models: Optional[List[str]] = None
    api_keys: Optional[Dict[str, str]] = None
    language: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    config: UserConfigOut
