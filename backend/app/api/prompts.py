from fastapi import APIRouter, HTTPException
from backend.app.schemas.prompt import (
    PromptTemplateRequest,
    GeneratedPromptResponse,
    PromptValidationRequest,
    PromptValidationResponse
)
from backend.app.core.prompt_engine import prompt_engine

router = APIRouter(prefix="/api/prompts", tags=["prompts"])

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
