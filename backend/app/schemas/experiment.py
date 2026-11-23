from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import datetime

class ExperimentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    dataset_id: str
    dataset_name: Optional[str] = ""
    input_columns: List[str] = Field(default_factory=list)
    context_columns: List[str] = Field(default_factory=list)
    spec_columns: List[str] = Field(default_factory=list)
    id_column: Optional[str] = None
    model_ids: List[str] = Field(default_factory=list)
    ground_truth_dataset_id: Optional[str] = None
    ground_truth_dataset_ids: List[str] = Field(default_factory=list)
    ground_truth_name: Optional[str] = "Experto Humano"
    template: str
    system_prompt: Optional[str] = ""
    task_type: Optional[str] = "generic"
    eval_spec: Optional[Dict[str, Any]] = Field(default_factory=dict)
    sample_size: int = Field(default=25, ge=1)
    execution_mode: str = Field(default="sequential") # "sequential" or "parallel"
    model_temperatures: Dict[str, float] = Field(default_factory=dict)

class ExperimentSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    dataset_id: str
    dataset_name: Optional[str] = ""
    model_ids: List[str] = Field(default_factory=list)
    ground_truth_dataset_id: Optional[str] = None
    ground_truth_dataset_ids: List[str] = Field(default_factory=list)
    ground_truth_name: Optional[str] = "Experto Humano"
    task_type: str = "generic"
    sample_size: int = 25
    execution_mode: str = "sequential"
    status: str = "draft"
    current_model_index: int = 0
    current_sample_index: int = 0
    total_samples: int = 0
    progress_pct: float = 0.0
    eval_spec: Optional[Dict[str, Any]] = Field(default_factory=dict)
    summaries: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime.datetime] = None
    started_at: Optional[datetime.datetime] = None
    paused_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None
    error_message: Optional[str] = None
    is_shared: bool = False
    is_shared_by_owner: bool = False
    share_mode: Optional[str] = None
    share_status: Optional[str] = None
    shared_by: Optional[str] = None
    share_id: Optional[int] = None

class ExperimentResponse(BaseModel):
    id: str
    user_id: int
    name: str
    description: Optional[str] = ""
    dataset_id: str
    dataset_name: Optional[str] = ""
    input_columns: List[str] = Field(default_factory=list)
    context_columns: List[str] = Field(default_factory=list)
    spec_columns: List[str] = Field(default_factory=list)
    id_column: Optional[str] = None
    model_ids: List[str] = Field(default_factory=list)
    ground_truth_dataset_id: Optional[str] = None
    ground_truth_dataset_ids: List[str] = Field(default_factory=list)
    ground_truth_name: Optional[str] = "Experto Humano"
    template: str
    system_prompt: Optional[str] = ""
    task_type: str = "generic"
    eval_spec: Optional[Dict[str, Any]] = Field(default_factory=dict)
    sample_size: int = 25
    execution_mode: str = "sequential"
    model_temperatures: Dict[str, float] = Field(default_factory=dict)
    status: str = "draft"
    current_model_index: int = 0
    current_sample_index: int = 0
    total_samples: int = 0
    progress_pct: float = 0.0
    raw_results: Dict[str, Any] = Field(default_factory=dict)
    summaries: Dict[str, Any] = Field(default_factory=dict)
    pairwise_matrix: List[Any] = Field(default_factory=list)
    best_performers: Dict[str, Any] = Field(default_factory=dict)
    error_message: Optional[str] = None
    created_at: Optional[datetime.datetime] = None
    started_at: Optional[datetime.datetime] = None
    paused_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    is_shared: bool = False
    is_shared_by_owner: bool = False
    share_mode: Optional[str] = None
    share_status: Optional[str] = None
    shared_by: Optional[str] = None
    share_id: Optional[int] = None


class ExperimentShareRequest(BaseModel):
    target_user_id: int
    share_mode: str = "view"  # "view" | "edit" | "copy"


class ExperimentShareRespondRequest(BaseModel):
    accept: bool


class ExperimentShareEntryOut(BaseModel):
    id: int
    target_user_id: int
    target_username: str
    share_mode: str
    status: str
