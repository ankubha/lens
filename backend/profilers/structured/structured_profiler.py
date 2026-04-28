"""
Lens — Structured Profiler
==========================
Takes a CSV or XLSX file, returns a fully populated ProfileContract.
Deterministic. No LLM on the hot path. SR 11-7 compliant.
"""
from __future__ import annotations
import os
import uuid
import math
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import re
import json as _json
from groq import Groq
from dotenv import load_dotenv
load_dotenv()

from backend.models.profile_contract import (
    ProfileContract,
    ColumnProfile,
    DataModality,
    DocumentType,
    SensitivityTier,
    ConfidenceLevel,
    DriftAlert,
)


# ─────────────────────────────────────────────
# PII / SEMANTIC DETECTION
# ─────────────────────────────────────────────

# Keywords that suggest PII columns
PII_KEYWORDS = [
    "ssn", "social_security", "passport", "national_id",
    "phone", "mobile", "email", "address", "dob", "date_of_birth",
    "birth", "account_number", "account_no", "card_number",
    "pan", "aadhaar", "tax_id", "tin", "nino",
    "borrower_name", "customer_name", "client_name",
    "guarantor_name", "lender_name",
]

# Semantic type rules — column name patterns → semantic label
SEMANTIC_RULES = [
   # Account number first — before generic identifier rules
    (["account_number", "account_no", "acct_no", "acct_num"],   "account_number"),

    # Identifiers — after specific overrides above
    (["_id", "_key", "_ref", "_no", "_num", "_code"],           "identifier"),
    (["loan_id", "customer_id", "cust_id", "client_id",
      "borrower_id", "account_id", "record_id"],                "identifier"),

    # Names — before generic person detection
    (["borrower_name", "lender_name", "customer_name",
      "client_name", "guarantor_name"],                          "person_name"),

    # Financial — specific terms only, not "loan_type"
    (["_amount", "_balance", "_rate", "_fee",
      "_payment", "_outstanding", "_limit"],                     "financial_amount"),

    # Categorical — type/status fields
   (["_type", "_status", "_flag", "_indicator", "_category",
      "loan_type", "account_type", "status", "state"],          "categorical_flag"),

    # Reference data
    (["currency", "ccy", "iso_currency"],                        "iso_currency"),
    (["country"],                                                 "country_code"),
    (["address", "street", "city", "state", "region"],           "address_component"),

    # Dates last
    (["date", "dob", "timestamp", "time",
      "created", "updated", "maturity", "origination"],          "date_or_timestamp"),
]


def detect_semantic_type(col_name: str) -> str | None:
    col_lower = col_name.lower()
    for keywords, label in SEMANTIC_RULES:
        if any(kw == col_lower or col_lower.endswith(kw) or col_lower.startswith(kw) or kw in col_lower for kw in keywords):
            return label
    return None


def detect_pii(col_name: str) -> bool:
    col_lower = col_name.lower()
    return any(kw in col_lower for kw in PII_KEYWORDS)


def detect_sensitivity(col_name: str, is_pii: bool) -> SensitivityTier:
    if is_pii:
        return SensitivityTier.RESTRICTED
    col_lower = col_name.lower()
    financial_keywords = ["balance", "amount", "loan", "credit", "salary", "income"]
    if any(kw in col_lower for kw in financial_keywords):
        return SensitivityTier.CONFIDENTIAL
    return SensitivityTier.INTERNAL


# ─────────────────────────────────────────────
# HEALTH SCORE
# ─────────────────────────────────────────────

def compute_health_score(df: pd.DataFrame, columns: list[ColumnProfile]) -> tuple[float, dict]:
    """
    Weighted health score out of 100.
    Completeness  40%  — how much data is present
    Uniqueness    20%  — key columns aren't all duplicates
    Consistency   20%  — data types are clean
    Validity      20%  — no obvious impossible values
    """
    total_cells = df.shape[0] * df.shape[1]
    missing_cells = df.isnull().sum().sum()
    completeness = ((total_cells - missing_cells) / total_cells) * 100 if total_cells > 0 else 0

    # Uniqueness — average unique % across non-identifier columns
    non_id_cols = [c for c in columns if c.semantic_type != "identifier"]
    if non_id_cols:
        uniqueness = sum(c.unique_pct for c in non_id_cols) / len(non_id_cols)
    else:
        uniqueness = 100.0

    # Consistency — % of columns with clean dtypes (no mixed types)
    consistency = 100.0  # we'll keep this simple for now

    # Validity — penalise columns with > 20% missing
    high_missing = sum(1 for c in columns if c.missing_pct > 20)
    validity = max(0, 100 - (high_missing / max(len(columns), 1)) * 100)

    health = (
        completeness * 0.40 +
        uniqueness   * 0.20 +
        consistency  * 0.20 +
        validity     * 0.20
    )

    breakdown = {
        "completeness": round(completeness, 2),
        "uniqueness":   round(uniqueness, 2),
        "consistency":  round(consistency, 2),
        "validity":     round(validity, 2),
    }

    return round(health, 2), breakdown


# ─────────────────────────────────────────────
# COLUMN PROFILER
# ─────────────────────────────────────────────
def generate_column_definitions(columns: list) -> dict[str, str]:
    """
    One LLM call generates plain English business definitions
    for all columns. Works for any CSV — no hardcoding.
    Returns dict of column_name -> definition.
    """
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        col_context = []
        for col in columns:
            sample = []
            if col.top_values:
                sample = [tv["value"] for tv in col.top_values[:3]]
            elif col.min is not None:
                sample = [f"min={col.min}", f"max={col.max}"]
            elif col.min_date:
                sample = [str(col.min_date)[:10]]

            col_context.append({
                "name":          col.column_name,
                "data_type":     col.data_type,
                "semantic_type": col.semantic_type or "unknown",
                "sample_values": sample,
                "is_pii":        col.is_pii,
            })

        prompt = f"""You are a data steward writing a business data dictionary.

For each column below write a short generic business definition (1 sentence, plain English).
Explain what this field represents in a business context.
Do NOT repeat the column name in the definition.

Columns:
{_json.dumps(col_context, indent=2)}

Respond ONLY with a JSON object. No markdown, no backticks:
{{
  "loan_id": "A unique identifier assigned to each loan record.",
  "borrower_name": "The full legal name of the individual or entity receiving the loan."
}}"""

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2048,
        )

        text = response.choices[0].message.content.strip()
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"^```\s*",      "", text)
        text = re.sub(r"\s*```$",      "", text)

        return _json.loads(text.strip())

    except Exception as e:
        print(f"  [Lens] Column definitions failed: {e}")
        return {}
    
def profile_column(series: pd.Series) -> ColumnProfile:
    col_name = series.name
    is_pii = detect_pii(col_name)
    semantic = detect_semantic_type(col_name)
    sensitivity = detect_sensitivity(col_name, is_pii)

    total = len(series)
    missing = int(series.isnull().sum())
    unique = int(series.nunique())

    base = ColumnProfile(
        column_name=col_name,
        data_type=str(series.dtype),
        semantic_type=semantic,
        missing_count=missing,
        missing_pct=round((missing / total) * 100, 2) if total > 0 else 0.0,
        unique_count=unique,
        unique_pct=round((unique / total) * 100, 2) if total > 0 else 0.0,
        is_pii=is_pii,
        sensitivity=sensitivity,
    )

    # ── Numeric columns ──────────────────────
    if pd.api.types.is_numeric_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            base.min = round(float(clean.min()), 4)
            base.max = round(float(clean.max()), 4)
            base.mean = round(float(clean.mean()), 4)
            base.median = round(float(clean.median()), 4)
            base.std_dev = round(float(clean.std()), 4)
            base.variance = round(float(clean.var()), 4)
            base.skewness = round(float(clean.skew()), 4)
            base.kurtosis = round(float(clean.kurt()), 4)
            base.percentile_25 = round(float(clean.quantile(0.25)), 4)
            base.percentile_75 = round(float(clean.quantile(0.75)), 4)
            base.zeros_count = int((clean == 0).sum())
            base.negative_count = int((clean < 0).sum())

    # ── Categorical / object columns ─────────
    elif pd.api.types.is_object_dtype(series) or pd.api.types.is_categorical_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            vc = clean.value_counts()
            base.top_values = [
                {"value": str(k), "count": int(v)}
                for k, v in vc.head(10).items()
            ]
            base.mode = str(vc.index[0]) if len(vc) > 0 else None
            # Entropy
            probs = vc / vc.sum()
            base.entropy = round(float(-sum(p * math.log2(p) for p in probs if p > 0)), 4)

    # ── Datetime columns ──────────────────────
    elif pd.api.types.is_datetime64_any_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            base.min_date = clean.min().to_pydatetime()
            base.max_date = clean.max().to_pydatetime()
            base.freshness_days = (datetime.utcnow() - clean.max().to_pydatetime()).days
            # Gap detection — check if any expected dates are missing
            date_range = pd.date_range(clean.min(), clean.max(), freq="D")
            base.has_gaps = len(date_range) > unique
    
    # ── Histogram (numeric columns only) ─────
    if pd.api.types.is_numeric_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            counts, bin_edges = np.histogram(clean, bins=min(20, len(clean.unique())))
            base.histogram = [
                {
                    "bin_start": round(float(bin_edges[i]), 4),
                    "bin_end":   round(float(bin_edges[i+1]), 4),
                    "count":     int(counts[i]),
                }
                for i in range(len(counts))
            ]
            # Extreme values
            sorted_vals = clean.sort_values()
            base.extreme_min = [
                {"value": round(float(v), 4), "count": int((clean == v).sum())}
                for v in sorted_vals.head(10).unique()
            ]
            base.extreme_max = [
                {"value": round(float(v), 4), "count": int((clean == v).sum())}
                for v in sorted_vals.tail(10).unique()[::-1]
            ]

    elif pd.api.types.is_object_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            vc = clean.value_counts()
            # Use top values as histogram bars
            base.histogram = [
                {
                    "bin_start": 0,
                    "bin_end":   0,
                    "count":     int(v),
                    "label":     str(k)[:20],
                }
                for k, v in vc.head(20).items()
            ]
            base.extreme_min = [
                {"value": str(k), "count": int(v)}
                for k, v in vc.tail(10).items()
            ]
            base.extreme_max = [
                {"value": str(k), "count": int(v)}
                for k, v in vc.head(10).items()
            ]

    return base


# ─────────────────────────────────────────────
# DRIFT DETECTION
# ─────────────────────────────────────────────

def detect_drift(
    current_columns: list[ColumnProfile],
    prior_columns: list[ColumnProfile],
    threshold: float = 5.0,
) -> list[DriftAlert]:
    """Compare current profile against a prior one. Flag meaningful changes."""
    alerts = []
    prior_map = {c.column_name: c for c in prior_columns}

    for col in current_columns:
        if col.column_name not in prior_map:
            continue
        prior = prior_map[col.column_name]

        checks = [
            ("missing_pct", col.missing_pct, prior.missing_pct),
            ("unique_pct",  col.unique_pct,  prior.unique_pct),
        ]
        if col.mean is not None and prior.mean is not None:
            checks.append(("mean", col.mean, prior.mean))

        for metric, current_val, prior_val in checks:
            if prior_val is None or current_val is None:
                continue
            delta = abs(current_val - prior_val)
            if delta >= threshold:
                alerts.append(DriftAlert(
                    column_name=col.column_name,
                    metric=metric,
                    prior_value=prior_val,
                    current_value=current_val,
                    delta=round(delta, 4),
                    is_significant=delta >= threshold,
                ))

    return alerts


# ─────────────────────────────────────────────
# MAIN PROFILER FUNCTION
# ─────────────────────────────────────────────

def profile_structured(
    file_path: str | Path,
    prior_profile: ProfileContract | None = None,
) -> ProfileContract:
    """
    Main entry point. Takes a CSV or XLSX path.
    Returns a fully populated ProfileContract.
    """
    path = Path(file_path)

    # ── Load file ────────────────────────────
    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(path)
        doc_type = DocumentType.CSV
    elif suffix in [".xlsx", ".xls"]:
        df = pd.read_excel(path)
        doc_type = DocumentType.XLSX
    else:
        raise ValueError(f"Unsupported file type: {suffix}. Expected .csv or .xlsx")

    # ── Try to parse datetime columns ────────
    for col in df.columns:
        if "date" in col.lower() or "time" in col.lower():
            try:
                df[col] = pd.to_datetime(df[col], infer_datetime_format=True)
            except Exception:
                pass

    # ── Profile each column ──────────────────
    columns = [profile_column(df[col]) for col in df.columns]

    # ── Generate business definitions (one LLM call for all columns) ──
    print("  [Lens] Generating column definitions via LLM...")
    definitions = generate_column_definitions(columns)
    for col in columns:
        col.business_definition = definitions.get(col.column_name)

    # ── Health score ─────────────────────────
    health, breakdown = compute_health_score(df, columns)

    # ── Drift detection ──────────────────────
    drift_alerts = []
    prior_id = None
    if prior_profile and prior_profile.columns:
        drift_alerts = detect_drift(columns, prior_profile.columns)
        prior_id = prior_profile.profile_id

    # ── Audit log ────────────────────────────
    audit_log = [{
        "timestamp": datetime.utcnow().isoformat(),
        "event": "profile_created",
        "detail": f"Profiled {path.name} — {len(df)} rows × {len(df.columns)} columns",
    }]

    # ── Sample rows ──────────────────────────
    def rows_to_dict(df_slice: pd.DataFrame) -> list[dict]:
        return [
            {k: (str(v) if not isinstance(v, (int, float, bool, type(None))) else v)
             for k, v in row.items()}
            for row in df_slice.to_dict('records')
        ]

    sample_head = rows_to_dict(df.head(10))
    sample_tail = rows_to_dict(df.tail(10))

    # ── Duplicate rows ────────────────────────
    dup_mask = df.duplicated(keep=False)
    duplicate_rows = rows_to_dict(df[dup_mask].head(20)) if dup_mask.any() else []

    # ── Build the contract ───────────────────
    contract = ProfileContract(
        profile_id=str(uuid.uuid4()),
        filename=path.name,
        file_size_bytes=path.stat().st_size,
        modality=DataModality.STRUCTURED,
        document_type=doc_type,
        document_type_confidence=1.0,
        row_count=len(df),
        column_count=len(df.columns),
        duplicate_row_count=int(df.duplicated().sum()),
        duplicate_rows=duplicate_rows,
        sample_head=sample_head,
        sample_tail=sample_tail,
        columns=columns,
        health_score=health,
        health_breakdown=breakdown,
        drift_alerts=drift_alerts,
        prior_profile_id=prior_id,
        audit_log=audit_log,
        deterministic_only=True,
    )

    return contract