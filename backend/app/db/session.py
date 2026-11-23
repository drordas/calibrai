import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from backend.app.db.models import Base, User, UserConfiguration, SavedBenchmark, Experiment
from backend.app.core.security import get_password_hash

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://benchmarker:benchmarker_secret@localhost:5434/llm_benchmark"
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initializes PostgreSQL tables, schema migrations, and optional env-configured seed user."""
    Base.metadata.create_all(bind=engine)

    # Ensure schema migrations for language and ground_truth columns
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE user_configurations ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'es'"))
            conn.execute(text("ALTER TABLE experiments ADD COLUMN IF NOT EXISTS ground_truth_dataset_id VARCHAR(100)"))
            conn.execute(text("ALTER TABLE experiments ADD COLUMN IF NOT EXISTS ground_truth_dataset_ids JSONB DEFAULT '[]'::jsonb"))
            conn.execute(text("ALTER TABLE experiments ADD COLUMN IF NOT EXISTS ground_truth_name VARCHAR(255) DEFAULT 'Experto Humano'"))
            conn.execute(text("ALTER TABLE experiments ADD COLUMN IF NOT EXISTS model_temperatures JSONB DEFAULT '{}'::jsonb"))
            conn.commit()
    except Exception as e:
        print(f"[init_db] Note on schema check: {e}")

    # Optional seed user via environment variables (never hardcoded in source)
    seed_user = os.getenv("DEFAULT_ADMIN_USER", "").strip()
    seed_pass = os.getenv("DEFAULT_ADMIN_PASSWORD", "")
    if not seed_user or not seed_pass:
        return

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.username == seed_user).first()
        if not user:
            user = User(
                username=seed_user,
                hashed_password=get_password_hash(seed_pass),
                full_name=os.getenv("DEFAULT_ADMIN_NAME", "").strip() or None,
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            config = UserConfiguration(
                user_id=user.id,
                ollama_url="",
                default_sample_size=25,
                default_task_type="numeric_math",
                selected_models=[],
                api_keys={}
            )
            db.add(config)
            db.commit()
        elif not user.configuration:
            config = UserConfiguration(
                user_id=user.id,
                ollama_url="",
                default_sample_size=25,
                default_task_type="numeric_math",
                selected_models=[],
                api_keys={}
            )
            db.add(config)
            db.commit()
    except Exception as e:
        print(f"[init_db] Error initializing database: {e}")
        db.rollback()
    finally:
        db.close()
