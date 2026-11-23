import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class SaveBenchmarkRequest(BaseModel):
    benchmark_id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    dataset_id: str
    dataset_name: Optional[str] = ""
    task_type: str = "aaker_dimensions"
    template: str
    system_prompt: Optional[str] = ""
    model_ids: List[str]
    sample_size: int
    model_summaries: Dict[str, Any]
    pairwise_matrix: List[Any] = Field(default_factory=list)
    best_performers: Dict[str, str] = Field(default_factory=dict)

class SavedBenchmarkSummary(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    dataset_id: str
    dataset_name: str
    task_type: str
    model_ids: List[str]
    sample_size: int
    created_at: datetime.datetime
    model_count: int

class SavedBenchmarkDetail(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""
    dataset_id: str
    dataset_name: str
    task_type: str
    template: str
    system_prompt: Optional[str] = ""
    model_ids: List[str]
    sample_size: int
    model_summaries: Dict[str, Any]
    pairwise_matrix: List[Any]
    best_performers: Dict[str, str]
    created_at: datetime.datetime
