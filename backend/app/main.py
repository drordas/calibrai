from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.db.session import init_db
from backend.app.api.datasets import router as datasets_router
from backend.app.api.prompts import router as prompts_router
from backend.app.api.models import router as models_router
from backend.app.api.benchmark import router as benchmark_router
from backend.app.api.auth import router as auth_router
from backend.app.api.saved_benchmarks import router as saved_benchmarks_router
from backend.app.api.experiments import router as experiments_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize PostgreSQL tables and schema migrations
    init_db()
    yield

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="CalibrAI Platform with PostgreSQL Persistence & Authentication",
    lifespan=lifespan
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(saved_benchmarks_router)
app.include_router(experiments_router)
app.include_router(datasets_router)
app.include_router(prompts_router)
app.include_router(models_router)
app.include_router(benchmark_router)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.version,
        "database": "postgresql"
    }
