from typing import Any, List, Optional
from pydantic import BaseModel, Field

class ColumnInfo(BaseModel):
    name: str
    data_type: str
    sample_values: List[Any] = Field(default_factory=list)
    null_count: int = 0
    unique_count: Optional[int] = None
    is_unique: bool = False
    is_id_candidate: bool = False

class DatasetSummary(BaseModel):
    id: str
    name: str
    filename: str
    format: str
    total_rows: int
    size_bytes: int
    columns: List[ColumnInfo]
    is_sample: bool = False
    detected_id_column: Optional[str] = None
    is_ground_truth: bool = False
    benchmark_id: Optional[str] = None
    is_shared: bool = False
    share_status: Optional[str] = None
    shared_by: Optional[str] = None
    share_id: Optional[int] = None


class ShareUserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None


class DatasetShareRequest(BaseModel):
    target_user_id: int


class DatasetShareRespondRequest(BaseModel):
    accept: bool

class PaginatedRowsResponse(BaseModel):
    dataset_id: str
    total_rows: int
    offset: int
    limit: int
    columns: List[str]
    rows: List[dict[str, Any]]

class ColumnSelection(BaseModel):
    dataset_id: str
    input_text_columns: List[str]
    id_column: Optional[str] = None
    context_columns: List[str] = Field(default_factory=list)
    ground_truth_column: Optional[str] = None
    task_type: str = "aaker_dimensions"  # aaker_dimensions, custom_aspects, binary_sentiment, etc.
