import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(200), default="David Rordas")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    configuration = relationship("UserConfiguration", back_populates="user", uselist=False, cascade="all, delete-orphan")
    saved_benchmarks = relationship("SavedBenchmark", back_populates="user", cascade="all, delete-orphan")
    experiments = relationship("Experiment", back_populates="user", cascade="all, delete-orphan")

class UserConfiguration(Base):
    __tablename__ = "user_configurations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    ollama_url = Column(String(255), default="")
    default_sample_size = Column(Integer, default=25)
    default_task_type = Column(String(100), default="aaker_dimensions")
    selected_models = Column(JSONB, default=list)
    api_keys = Column(JSONB, default=dict)
    language = Column(String(10), default="es")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="configuration")

class SavedBenchmark(Base):
    __tablename__ = "saved_benchmarks"

    id = Column(String(50), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    dataset_id = Column(String(100), nullable=False)
    dataset_name = Column(String(255), default="")
    task_type = Column(String(100), default="aaker_dimensions")
    template = Column(Text, nullable=False)
    system_prompt = Column(Text, default="")
    model_ids = Column(JSONB, default=list)
    sample_size = Column(Integer, default=25)
    model_summaries = Column(JSONB, default=dict)
    pairwise_matrix = Column(JSONB, default=list)
    best_performers = Column(JSONB, default=dict)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    user = relationship("User", back_populates="saved_benchmarks")

class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(String(50), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    dataset_id = Column(String(100), nullable=False)
    dataset_name = Column(String(255), default="")
    
    # Columns definition
    input_columns = Column(JSONB, default=list)
    context_columns = Column(JSONB, default=list)
    id_column = Column(String(100), nullable=True)
    
    # Models to benchmark
    model_ids = Column(JSONB, default=list)

    # Optional Ground Truth / Human Expert baseline dataset
    ground_truth_dataset_id = Column(String(100), nullable=True)
    ground_truth_dataset_ids = Column(JSONB, default=list, nullable=True)
    ground_truth_name = Column(String(255), nullable=True, default="Experto Humano")
    
    # Prompt and spec
    template = Column(Text, nullable=False)
    system_prompt = Column(Text, default="")
    task_type = Column(String(100), default="generic")
    eval_spec = Column(JSONB, default=dict)
    
    # Execution configuration
    sample_size = Column(Integer, default=25)
    execution_mode = Column(String(50), default="sequential") # "sequential" or "parallel"
    model_temperatures = Column(JSONB, default=dict)
    
    # Status and checkpoint state
    status = Column(String(50), default="draft", index=True) # "draft", "queued", "running", "paused", "completed", "failed", "cancelled"
    current_model_index = Column(Integer, default=0)
    current_sample_index = Column(Integer, default=0) # Row checkpoint index
    total_samples = Column(Integer, default=0)
    progress_pct = Column(Float, default=0.0) # 0.0 - 100.0
    
    # Checkpointed partial & total results
    raw_results = Column(JSONB, default=dict) # { [model_id]: [ { sample_index, row_context, ... } ] }
    summaries = Column(JSONB, default=dict) # { [model_id]: ModelBenchmarkSummary }
    pairwise_matrix = Column(JSONB, default=list)
    best_performers = Column(JSONB, default=dict)
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    paused_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="experiments")
