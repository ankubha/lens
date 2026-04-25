"""
Lens — Profile Contract
=======================
The single Pydantic schema emitted by every profiler.
Structured, semi-structured, and unstructured all produce this shape.
This is what makes Lens a platform, not three separate tools.
"""

from __future__ import annotations
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field
from datetime import datetime


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class DataModality(str, Enum):
    STRUCTURED = "structured"
    SEMI_STRUCTURED = "semi_structured"
    UNSTRUCTURED = "unstructured"


class DocumentType(str, Enum):
    # Structured
    CSV = "csv"
    XLSX = "xlsx"
    # Semi-structured
    JSON = "json"
    XML = "xml"
    # Unstructured
    COMMERCIAL_LOAN = "commercial_loan"
    TERM_SHEET = "term_sheet"
    CREDIT_MEMO = "credit_memo"
    FINANCIAL_STATEMENT = "financial_statement"
    MSA = "master_service_agreement"
    GENERIC_PDF = "generic_pdf"
    UNKNOWN = "unknown"


class SensitivityTier(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class ConfidenceLevel(str, Enum):
    HIGH = "high"       # > 0.85
    MEDIUM = "medium"   # 0.60 - 0.85
    LOW = "low"         # < 0.60


# ─────────────────────────────────────────────
# BUILDING BLOCKS
# ─────────────────────────────────────────────

class ProvenanceSpan(BaseModel):
    """Every extracted fact carries this. No exceptions. SR 11-7."""
    page: int | None = None
    section: str | None = None
    char_start: int | None = None
    char_end: int | None = None
    confidence_score: float | None = Field(None, ge=0.0, le=1.0)
    confidence_level: ConfidenceLevel | None = None

    def __str__(self):
        if self.page:
            return f"p.{self.page} — {self.section or 'unknown section'}"
        return "provenance unknown"


class ExtractedFact(BaseModel):
    """
    A single extracted value with full provenance.
    Used for every Critical Business Element in unstructured docs.
    The system never invents data — value is None if not found.
    """
    field_name: str
    business_definition: str | None = None   # What this field means in plain English
    value: Any | None = None                  # None = not found, never hallucinated
    raw_text: str | None = None               # The exact text it was pulled from
    not_found_reason: str | None = None       # "section not present" / "value not stated"
    provenance: ProvenanceSpan | None = None
    sensitivity: SensitivityTier = SensitivityTier.INTERNAL


class ColumnProfile(BaseModel):
    """One column's full statistical profile. Used by structured profiler."""
    column_name: str
    data_type: str                            # pandas dtype string
    semantic_type: str | None = None         # "account_number", "iso_currency", "zip", etc.
    missing_count: int = 0
    missing_pct: float = 0.0
    unique_count: int = 0
    unique_pct: float = 0.0
    is_pii: bool = False
    sensitivity: SensitivityTier = SensitivityTier.INTERNAL

    # Numeric stats (None for non-numeric columns)
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    median: float | None = None
    std_dev: float | None = None
    variance: float | None = None
    skewness: float | None = None
    kurtosis: float | None = None
    percentile_25: float | None = None
    percentile_75: float | None = None
    zeros_count: int | None = None
    negative_count: int | None = None

    # Categorical stats (None for non-categorical columns)
    top_values: list[dict[str, Any]] | None = None   # [{"value": x, "count": n}]
    mode: Any | None = None
    entropy: float | None = None

    # Time-series stats (None for non-datetime columns)
    min_date: datetime | None = None
    max_date: datetime | None = None
    freshness_days: int | None = None        # How stale is the latest record
    has_gaps: bool | None = None


class DocumentSummary(BaseModel):
    """
    Tiered summary for unstructured documents.
    All tiers are generated; frontend picks which to show.
    """
    executive: str | None = None             # Tier 1: 200-400 words, 90-second read
    detailed: str | None = None              # Tier 2: 800-1500 words, deal-memo depth
    page_summaries: list[dict] | None = None # Tier 3: [{page: 1, summary: "..."}]
    section_summaries: list[dict] | None = None  # Tier 4: [{section: "Art. I", summary: "..."}]


class RiskObligation(BaseModel):
    """A single dated or monetary obligation extracted from a document."""
    obligation_type: str                     # "payment", "covenant", "reporting", "condition"
    description: str
    amount: float | None = None
    amount_currency: str | None = None
    due_date: str | None = None
    party_responsible: str | None = None
    trigger_language: str | None = None      # "material adverse change", "event of default"
    provenance: ProvenanceSpan | None = None


class DriftAlert(BaseModel):
    """Flags a meaningful change between this profile and a prior version."""
    column_name: str
    metric: str                              # "missing_pct", "mean", "unique_count"
    prior_value: float
    current_value: float
    delta: float
    is_significant: bool                     # True if delta > threshold


# ─────────────────────────────────────────────
# THE CONTRACT
# ─────────────────────────────────────────────

class ProfileContract(BaseModel):
    """
    The single schema every Lens profiler emits.
    Structured, semi-structured, and unstructured all produce this.
    This is what makes Lens a platform.
    """

    # ── Identity ──────────────────────────────
    profile_id: str                          # UUID, generated at run time
    created_at: datetime = Field(default_factory=datetime.utcnow)
    profiler_version: str = "1.0.0"

    # ── Source ────────────────────────────────
    filename: str
    file_size_bytes: int
    modality: DataModality
    document_type: DocumentType
    document_type_confidence: float | None = Field(None, ge=0.0, le=1.0)
    sensitivity_classification: SensitivityTier = SensitivityTier.INTERNAL

    # ── Dataset-level (structured / semi-structured) ──
    row_count: int | None = None
    column_count: int | None = None
    duplicate_row_count: int | None = None
    columns: list[ColumnProfile] = []

    # ── Document-level (unstructured) ─────────
    page_count: int | None = None
    detected_language: str | None = None
    is_scanned: bool | None = None
    has_tables: bool | None = None
    has_signatures: bool | None = None
    sections_detected: list[str] = []

    # ── Health score (all modalities) ─────────
    health_score: float | None = Field(None, ge=0.0, le=100.0)
    health_breakdown: dict[str, float] = {}  # {"completeness": 92.0, "uniqueness": 88.0}

    # ── Completeness (unstructured) ───────────
    completeness_score: float | None = Field(None, ge=0.0, le=100.0)
    expected_fields_count: int | None = None
    found_fields_count: int | None = None

    # ── Critical Business Elements ────────────
    critical_business_elements: list[ExtractedFact] = []

    # ── Summary (unstructured) ────────────────
    summary: DocumentSummary | None = None

    # ── Risk and obligations ──────────────────
    obligations: list[RiskObligation] = []
    parties: list[ExtractedFact] = []
    monetary_amounts: list[ExtractedFact] = []
    key_dates: list[ExtractedFact] = []

    # ── Drift (structured, when prior profile exists) ──
    drift_alerts: list[DriftAlert] = []
    prior_profile_id: str | None = None

    # ── Catch-all (unstructured) ──────────────
    additional_findings: list[ExtractedFact] = []
    # ^ Anything important the LLM found that doesn't fit a named field above.
    # This ensures zero information loss regardless of document type.

    raw_llm_narrative: str | None = None
    # ^ Completely free LLM output — no schema, no constraints.
    # "Here is everything I noticed about this document."
    # This is the Claude-like free response you wanted.

    unknown_fields_flagged: list[str] = []
    # ^ Field names the LLM suggested but we had no schema slot for.
    # Useful for improving the schema over time as new doc types appear.

    # ── Audit (SR 11-7) ───────────────────────
    audit_log: list[dict] = []               # [{timestamp, event, detail}]
    llm_used: str | None = None              # "qwen2.5-7b" / "tachyon-gpt4" / None
    deterministic_only: bool = True          # False only when LLM was on the hot path

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}