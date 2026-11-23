import os
from pathlib import Path
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads")))
SAMPLE_DIR = Path(os.getenv("SAMPLE_DIR", str(BASE_DIR.parent / "dataset")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseModel):
    app_name: str = "CalibrAI"
    version: str = "1.0.0"
    upload_dir: Path = UPLOAD_DIR
    sample_dir: Path = SAMPLE_DIR
    default_ollama_url: str = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")

settings = Settings()
