from typing import List, Optional, Dict
from fastapi import APIRouter
from pydantic import BaseModel
from backend.app.llm.base import ModelCatalogItem
from backend.app.llm.manager import llm_manager

router = APIRouter(prefix="/api/models", tags=["models"])

class CheckOllamaRequest(BaseModel):
    url: Optional[str] = None

class CheckOllamaResponse(BaseModel):
    is_online: bool
    models: List[str]

class DiscoverLocalRequest(BaseModel):
    url: str = "http://localhost:11434"

class DiscoverLocalResponse(BaseModel):
    is_online: bool
    resolved_url: str
    models: List[ModelCatalogItem]
    excluded_remote_models: int = 0
    error: Optional[str] = None

class DiscoverRemoteRequest(BaseModel):
    provider: str
    api_key: str

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

@router.get("/detect-vram", response_model=DetectVramResponse)
async def detect_vram(url: Optional[str] = None):
    data = await llm_manager.detect_system_vram(url)
    return DetectVramResponse(**data)

@router.post("/calculate-context", response_model=CalculateContextResponse)
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
async def discover_local(req: DiscoverLocalRequest):
    is_online, resolved_url, models, excluded_count, err = await llm_manager.discover_local_models(req.url)
    return DiscoverLocalResponse(
        is_online=is_online,
        resolved_url=resolved_url,
        models=models,
        excluded_remote_models=excluded_count,
        error=err
    )

@router.post("/discover-remote", response_model=DiscoverRemoteResponse)
async def discover_remote(req: DiscoverRemoteRequest):
    is_valid, models, err = await llm_manager.discover_remote_models(req.provider, req.api_key)
    return DiscoverRemoteResponse(
        is_valid=is_valid,
        provider=req.provider,
        models=models,
        error=err
    )
