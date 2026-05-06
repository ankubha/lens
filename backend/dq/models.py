"""
Lens DQ Engine — Pydantic Models
"""
from __future__ import annotations
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class DQCheckType(str, Enum):
    not_null = "not_null"
    min_max_range = "min_max_range"
    iqr_outlier = "iqr_outlier"
    z_score_outlier = "z_score_outlier"
    non_negative = "non_negative"
    categorical_set = "categorical_set"
    string_length = "string_length"
    pattern_match = "pattern_match"
    uniqueness = "uniqueness"
    no_future_date = "no_future_date"
    date_range = "date_range"
    distribution_fit = "distribution_fit"


class DQCheckStatus(str, Enum):
    pending = "pending"
    authorized = "authorized"
    rejected = "rejected"


class DQDimension(str, Enum):
    completeness = "completeness"
    validity = "validity"
    uniqueness = "uniqueness"
    conformity = "conformity"
    accuracy = "accuracy"
    consistency = "consistency"


class DQCheck(BaseModel):
    check_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    column_name: str
    check_type: DQCheckType
    status: DQCheckStatus = DQCheckStatus.pending
    parameters: dict = Field(default_factory=dict)
    description: str = ""
    dimension: DQDimension
    confidence: float = Field(..., ge=0.0, le=1.0)
    train_pass_rate: float = Field(..., ge=0.0, le=1.0)
    test_pass_rate: float = Field(..., ge=0.0, le=1.0)
    sample_size: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    pass_count: Optional[int] = None
    fail_count: Optional[int] = None
    fail_pct: Optional[float] = None


class DQAnomaly(BaseModel):
    anomaly_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    check_id: str
    column_name: str
    check_type: DQCheckType
    anomaly_type: str  # "record" | "shape"
    row_index: Optional[int] = None
    row_data: Optional[dict] = None
    offending_value: Any = None
    description: str
    severity: str  # "low" | "medium" | "high"


class ScanResult(BaseModel):
    scan_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id: str
    scanned_at: datetime = Field(default_factory=datetime.utcnow)
    total_rows: int
    total_checks: int
    checks_passed: int
    checks_failed: int
    total_anomalies: int
    record_anomalies: int
    shape_anomalies: int
    dq_score: float
    anomalies: list[DQAnomaly] = []
    check_results: list[DQCheck] = []
