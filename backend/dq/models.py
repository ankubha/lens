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
    # ── Completeness ──────────────────────────────────────────
    not_null               = "not_null"
    any_not_null           = "any_not_null"
    required_values        = "required_values"
    # ── Validity ──────────────────────────────────────────────
    is_type                = "is_type"
    matches_pattern        = "matches_pattern"
    expected_values        = "expected_values"
    expected_schema        = "expected_schema"
    field_count            = "field_count"
    # ── Numeric ───────────────────────────────────────────────
    between                = "between"
    min_value              = "min_value"
    max_value              = "max_value"
    not_negative           = "not_negative"
    positive               = "positive"
    greater_than           = "greater_than"
    less_than              = "less_than"
    distinct_count         = "distinct_count"
    # ── String ────────────────────────────────────────────────
    min_length             = "min_length"
    max_length             = "max_length"
    # ── DateTime ──────────────────────────────────────────────
    not_future             = "not_future"
    after_date_time        = "after_date_time"
    before_date_time       = "before_date_time"
    between_times          = "between_times"
    # ── Cross-field ───────────────────────────────────────────
    greater_than_field     = "greater_than_field"
    less_than_field        = "less_than_field"
    equal_to_field         = "equal_to_field"
    # ── Aggregate ─────────────────────────────────────────────
    sum                    = "sum"
    # ── Dataset-level ─────────────────────────────────────────
    unique                 = "unique"
    # ── Custom (user-only) ────────────────────────────────────
    satisfies_expression   = "satisfies_expression"
    # ── Legacy (backward compat with old check files) ─────────
    min_max_range          = "min_max_range"
    iqr_outlier            = "iqr_outlier"
    z_score_outlier        = "z_score_outlier"
    non_negative           = "non_negative"
    categorical_set        = "categorical_set"
    string_length          = "string_length"
    pattern_match          = "pattern_match"
    uniqueness             = "uniqueness"
    no_future_date         = "no_future_date"
    date_range             = "date_range"
    distribution_fit       = "distribution_fit"


class DQCheckStatus(str, Enum):
    pending    = "pending"
    authorized = "authorized"
    rejected   = "rejected"


class DQDimension(str, Enum):
    completeness  = "completeness"
    validity      = "validity"
    numeric       = "numeric"
    string        = "string"
    date_time     = "date_time"
    cross_field   = "cross_field"
    aggregate     = "aggregate"
    dataset_level = "dataset_level"


class DQCheck(BaseModel):
    check_id:    str           = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id:  str
    column_name: str
    check_type:  DQCheckType
    status:      DQCheckStatus = DQCheckStatus.pending
    parameters:  dict          = Field(default_factory=dict)
    description: str           = ""
    dimension:   DQDimension
    severity:    str           = "MEDIUM"   # HIGH | MEDIUM | LOW
    rationale:   str           = ""         # LLM reasoning or user note
    source:      str           = Field(default="inferred")  # inferred | user_defined
    created_at:  datetime      = Field(default_factory=datetime.utcnow)
    # Scan results (populated after scan)
    pass_count:  Optional[int]   = None
    fail_count:  Optional[int]   = None
    fail_pct:    Optional[float] = None
    # Legacy stats kept optional so old check files still deserialise
    confidence:      Optional[float] = None
    train_pass_rate: Optional[float] = None
    test_pass_rate:  Optional[float] = None
    sample_size:     Optional[int]   = None


class DQAnomaly(BaseModel):
    anomaly_id:      str           = Field(default_factory=lambda: str(uuid.uuid4()))
    check_id:        str
    column_name:     str
    check_type:      DQCheckType
    anomaly_type:    str            # "record" | "shape"
    row_index:       Optional[int]  = None
    row_data:        Optional[dict] = None
    offending_value: Any            = None
    description:     str
    severity:        str            # "low" | "medium" | "high"


class ScanResult(BaseModel):
    scan_id:          str      = Field(default_factory=lambda: str(uuid.uuid4()))
    profile_id:       str
    scanned_at:       datetime = Field(default_factory=datetime.utcnow)
    total_rows:       int
    total_checks:     int
    checks_passed:    int
    checks_failed:    int
    total_anomalies:  int
    record_anomalies: int
    shape_anomalies:  int
    dq_score:         float
    anomalies:        list[DQAnomaly] = []
    check_results:    list[DQCheck]   = []
