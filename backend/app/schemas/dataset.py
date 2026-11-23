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
