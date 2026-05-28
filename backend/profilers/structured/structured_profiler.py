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
import unicodedata
from collections import Counter
from datetime import datetime
from pathlib import Path

import warnings
import numpy as np
import pandas as pd
import re
import json as _json
from groq import Groq
from dotenv import load_dotenv
load_dotenv()

# ── Visions type inference (module-level singleton) ────────
try:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        from visions import StandardSet
        from visions.functional import infer_type as _visions_infer_type
        _VISIONS_TYPESET: StandardSet | None = StandardSet()
except Exception:
    _VISIONS_TYPESET = None  # type: ignore[assignment]
    _visions_infer_type = None  # type: ignore[assignment]

_VISIONS_NUMERIC  = {"Integer", "Float", "Complex"}
_VISIONS_DATETIME = {"DateTime", "Date", "Time", "TimeDelta"}
_VISIONS_CAT      = {"Boolean", "Categorical"}
_VISIONS_DIRTY    = {"Object", "Generic"}

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
    Dataset quality score (0–100), rounded to 2 decimal places.

    Completeness = (total cells − missing cells) / total cells × 100
    Uniqueness   = (total rows  − duplicate rows) / total rows  × 100
    Health Score = (Completeness + Uniqueness) / 2
    """
    total_rows  = len(df)
    total_cols  = len(columns)
    total_cells = total_rows * total_cols

    missing_cells = sum(c.missing_count for c in columns)
    dup_rows      = int(df.duplicated().sum())

    completeness = ((total_cells - missing_cells) / total_cells * 100) if total_cells > 0 else 100.0
    uniqueness   = ((total_rows  - dup_rows)      / total_rows  * 100) if total_rows  > 0 else 100.0

    health = (completeness + uniqueness) / 2

    breakdown = {
        "completeness": round(completeness, 2),
        "uniqueness":   round(uniqueness,   2),
    }

    return round(health, 2), breakdown


# ─────────────────────────────────────────────
# COLUMN PROFILER
# ─────────────────────────────────────────────
def generate_column_definitions(columns: list) -> dict[str, dict]:
    """
    One LLM call generates business definitions + CDE/classification flags
    for all columns. Returns dict of column_name -> {definition, is_cde,
    info_classification, pii_classification}.
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

        prompt = f"""You are a senior data steward at a financial institution writing a business data dictionary.

For each column below, provide:
- definition: one sentence plain-English business meaning (do NOT repeat the column name)
- is_cde: true if this field is material to regulatory reporting, risk management, or key business decisions; false otherwise
- info_classification: one of Public / Internal / Confidential / Restricted
- pii_classification: one of PII / Sensitive / Non-PII
  (PII = directly identifies a person; Sensitive = indirectly sensitive e.g. account balances; Non-PII = not personal)

Columns:
{_json.dumps(col_context, indent=2)}

Respond ONLY with a JSON object mapping each column name to its attributes. No markdown, no backticks:
{{
  "loan_id": {{
    "definition": "A unique identifier assigned to each loan record.",
    "is_cde": true,
    "info_classification": "Internal",
    "pii_classification": "Non-PII"
  }},
  "borrower_ssn": {{
    "definition": "The Social Security Number of the primary borrower.",
    "is_cde": true,
    "info_classification": "Restricted",
    "pii_classification": "PII"
  }}
}}"""

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4096,
        )

        text = response.choices[0].message.content.strip()
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"^```\s*",      "", text)
        text = re.sub(r"\s*```$",      "", text)

        return _json.loads(text.strip())

    except Exception as e:
        print(f"  [Lens] Column definitions failed: {e}")
        return {}
    
def _detect_var_type(series: pd.Series, unique: int, total: int, semantic: str | None) -> str:
    """
    Determine the user-facing variable type using visions semantic inference
    with heuristic fallbacks for dirty-data detection.
    """
    # ── 1. Unambiguous pandas native dtypes ───────────────
    if pd.api.types.is_bool_dtype(series):
        return "Categorical"
    if pd.api.types.is_numeric_dtype(series):
        return "Numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "DateTime"
    if not (pd.api.types.is_object_dtype(series) or
            pd.api.types.is_categorical_dtype(series)):
        return "Unsupported"

    clean = series.dropna()
    n_clean = len(clean)
    if n_clean == 0:
        return "Categorical"

    # ── 2. Visions semantic inference ─────────────────────
    visions_type: str | None = None
    if _VISIONS_TYPESET is not None:
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                visions_type = str(_visions_infer_type(series, _VISIONS_TYPESET))
        except Exception:
            pass

    if visions_type in _VISIONS_NUMERIC:
        return "Numeric"
    if visions_type in _VISIONS_DATETIME:
        return "DateTime"
    if visions_type in _VISIONS_CAT:
        return "Categorical"
    if visions_type in _VISIONS_DIRTY:
        return "Unsupported"
    # visions_type == "String" or None → apply dirty-data checks

    # ── 3. Dirty-data checks ───────────────────────────────
    sample_n = min(500, n_clean)
    sample   = clean.head(sample_n)

    # 3a. True mixed Python types (Excel: int cells + str cells in same column)
    if visions_type is None:
        py_types     = {type(v).__name__ for v in sample}
        numeric_like = {"int", "float", "int64", "float64", "int32", "float32", "Decimal"}
        if "str" in py_types and bool(py_types & numeric_like):
            return "Unsupported"

    # 3b. Mostly-dates-but-some-garbage (e.g. 95 % ISO dates + 5 % "N/A" strings)
    try:
        parsed_dates = pd.to_datetime(
            sample.astype(str), errors="coerce", infer_datetime_format=True
        )
        date_ratio = float(parsed_dates.notna().sum()) / sample_n
        if 0.4 < date_ratio < 1.0:
            return "Unsupported"
    except Exception:
        pass

    # 3c. Mostly-numerics-but-some-text (e.g. "1.5", "2.3", "ERROR", "3.1")
    try:
        numeric_ratio = float(pd.to_numeric(clean, errors="coerce").notna().sum()) / n_clean
        if 0.05 < numeric_ratio < 0.95:
            return "Unsupported"
    except Exception:
        pass

    # ── 4. Semantic overrides for clean string columns ─────
    if semantic in ("categorical_flag", "iso_currency", "country_code"):
        return "Categorical"
    if semantic in ("person_name", "address_component"):
        return "Text"

    # ── 5. Cardinality heuristic ───────────────────────────
    ratio = unique / total if total > 0 else 0
    if unique <= 50 or ratio < 0.15:
        return "Categorical"
    return "Text"


def _unicode_scripts(chars: set[str]) -> int:
    scripts: set[str] = set()
    for c in chars:
        cp = ord(c)
        if 0x0041 <= cp <= 0x007A or 0x00C0 <= cp <= 0x024F:
            scripts.add("Latin")
        elif 0x0400 <= cp <= 0x04FF:
            scripts.add("Cyrillic")
        elif 0x0600 <= cp <= 0x06FF:
            scripts.add("Arabic")
        elif 0x4E00 <= cp <= 0x9FFF:
            scripts.add("CJK")
        elif 0x3040 <= cp <= 0x30FF:
            scripts.add("Japanese")
        elif 0x0900 <= cp <= 0x097F:
            scripts.add("Devanagari")
        elif 0x0020 <= cp <= 0x0040 or 0x005B <= cp <= 0x0060:
            scripts.add("Common")
        elif cp < 0x0020:
            scripts.add("Control")
        else:
            scripts.add("Other")
    return max(len(scripts), 1)


def _unicode_blocks(chars: set[str]) -> int:
    block_ranges = [
        (0x0000, 0x007F), (0x0080, 0x00FF), (0x0100, 0x017F),
        (0x0180, 0x024F), (0x0370, 0x03FF), (0x0400, 0x04FF),
        (0x0600, 0x06FF), (0x0900, 0x097F), (0x3040, 0x309F),
        (0x30A0, 0x30FF), (0x4E00, 0x9FFF), (0xAC00, 0xD7AF),
    ]
    found: set[int] = set()
    for c in chars:
        cp = ord(c)
        for i, (lo, hi) in enumerate(block_ranges):
            if lo <= cp <= hi:
                found.add(i)
                break
    return max(len(found), 1)


def profile_column(series: pd.Series) -> ColumnProfile:
    col_name = series.name
    is_pii = detect_pii(col_name)
    semantic = detect_semantic_type(col_name)
    sensitivity = detect_sensitivity(col_name, is_pii)

    total = len(series)
    missing = int(series.isnull().sum())
    unique = int(series.nunique())
    var_type = _detect_var_type(series, unique, total, semantic)

    mem_size = int(series.memory_usage(deep=True))

    base = ColumnProfile(
        column_name=col_name,
        data_type=str(series.dtype),
        var_type=var_type,
        semantic_type=semantic,
        missing_count=missing,
        missing_pct=round((missing / total) * 100, 2) if total > 0 else 0.0,
        unique_count=unique,
        unique_pct=round((unique / total) * 100, 2) if total > 0 else 0.0,
        is_pii=is_pii,
        sensitivity=sensitivity,
        memory_size=mem_size,
        infinite_count=0,
        infinite_pct=0.0,
    )

    # ── Numeric columns ──────────────────────────────────────
    if pd.api.types.is_numeric_dtype(series):
        # Infinite values
        inf_count = int(np.isinf(series.replace({None: np.nan}).fillna(0)).sum())
        base.infinite_count = inf_count
        base.infinite_pct = round((inf_count / total) * 100, 2) if total > 0 else 0.0

        clean = series.replace([np.inf, -np.inf], np.nan).dropna()
        n = len(clean)
        if n > 0:
            mean_val = float(clean.mean())
            std_val  = float(clean.std())
            median_val = float(clean.median())
            zeros = int((clean == 0).sum())
            negs  = int((clean < 0).sum())

            base.min      = round(float(clean.min()), 4)
            base.max      = round(float(clean.max()), 4)
            base.mean     = round(mean_val, 4)
            base.median   = round(median_val, 4)
            base.std_dev  = round(std_val, 4)
            base.variance = round(float(clean.var()), 4)
            base.skewness = round(float(clean.skew()), 4)
            base.kurtosis = round(float(clean.kurt()), 4)
            base.percentile_5  = round(float(clean.quantile(0.05)), 4)
            base.percentile_25 = round(float(clean.quantile(0.25)), 4)
            base.percentile_75 = round(float(clean.quantile(0.75)), 4)
            base.percentile_95 = round(float(clean.quantile(0.95)), 4)
            base.zeros_count    = zeros
            base.zeros_pct      = round((zeros / total) * 100, 2) if total > 0 else 0.0
            base.negative_count = negs
            base.negative_pct   = round((negs / total) * 100, 2) if total > 0 else 0.0
            base.mad     = round(float((clean - median_val).abs().median()), 4)
            base.cv      = round(std_val / mean_val, 4) if mean_val != 0 else None
            base.sum_val = round(float(clean.sum()), 4)

            # Monotonicity
            diffs = clean.diff().dropna()
            if len(diffs) == 0:
                base.monotonicity = "Non-monotonic"
            elif (diffs >= 0).all():
                base.monotonicity = "Increasing"
            elif (diffs <= 0).all():
                base.monotonicity = "Decreasing"
            else:
                base.monotonicity = "Non-monotonic"

            # Histogram (50 bins)
            n_bins = min(50, len(clean.unique()))
            counts, bin_edges = np.histogram(clean, bins=n_bins)
            base.histogram = [
                {
                    "bin_start": round(float(bin_edges[i]), 4),
                    "bin_end":   round(float(bin_edges[i + 1]), 4),
                    "count":     int(counts[i]),
                }
                for i in range(len(counts))
            ]

            # Top values for Common Values tab
            vc = clean.value_counts()
            base.top_values = [
                {"value": str(round(float(k), 4)), "count": int(v)}
                for k, v in vc.head(20).items()
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

    # ── Datetime columns ─────────────────────────────────────
    elif pd.api.types.is_datetime64_any_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            min_dt = clean.min().to_pydatetime()
            max_dt = clean.max().to_pydatetime()
            base.min_date       = min_dt
            base.max_date       = max_dt
            base.freshness_days = (datetime.utcnow() - max_dt).days
            date_range = pd.date_range(clean.min(), clean.max(), freq="D")
            base.has_gaps = len(date_range) > unique

            # Time span as human-readable string
            try:
                from dateutil.relativedelta import relativedelta as _rd
                delta = _rd(max_dt, min_dt)
                parts: list[str] = []
                if delta.years:  parts.append(f"{delta.years} Year{'s' if delta.years != 1 else ''}")
                if delta.months: parts.append(f"{delta.months} Month{'s' if delta.months != 1 else ''}")
                if delta.days:   parts.append(f"{delta.days} Day{'s' if delta.days != 1 else ''}")
                base.time_span_str = ", ".join(parts) if parts else "< 1 Day"
            except Exception:
                base.time_span_str = None

            # Has time component?
            base.has_time_component = bool(
                (clean.dt.hour != 0).any() or
                (clean.dt.minute != 0).any() or
                (clean.dt.second != 0).any()
            )

            # Weekday / weekend split
            is_weekday = clean.dt.dayofweek < 5
            base.weekday_count = int(is_weekday.sum())
            base.weekend_count = int((~is_weekday).sum())
            n_clean = len(clean)
            base.weekday_pct = round((base.weekday_count / n_clean) * 100, 2)
            base.weekend_pct = round((base.weekend_count / n_clean) * 100, 2)

            # Yearly distribution (sorted by year)
            year_vc = clean.dt.year.value_counts().sort_index()
            base.yearly_distribution = [
                {"year": int(yr), "count": int(cnt)}
                for yr, cnt in year_vc.items()
            ]

            # Monthly distribution (Jan=1 … Dec=12, always sorted)
            MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
                           "Jul","Aug","Sep","Oct","Nov","Dec"]
            month_vc = clean.dt.month.value_counts().reindex(range(1, 13), fill_value=0).sort_index()
            base.monthly_distribution = [
                {"month_num": int(m), "month_name": MONTH_NAMES[m - 1], "count": int(cnt)}
                for m, cnt in month_vc.items()
            ]

            # Day-of-week distribution (Mon=0 … Sun=6)
            DOW_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
            dow_vc = clean.dt.dayofweek.value_counts().reindex(range(7), fill_value=0).sort_index()
            base.dow_distribution = [
                {"dow": int(d), "day_name": DOW_NAMES[d], "count": int(cnt)}
                for d, cnt in dow_vc.items()
            ]

            # Hour distribution (0-23, only populated when time component present)
            if base.has_time_component:
                hour_vc = clean.dt.hour.value_counts().reindex(range(24), fill_value=0).sort_index()
                base.hour_distribution = [
                    {"hour": int(h), "count": int(cnt)}
                    for h, cnt in hour_vc.items()
                ]

    # ── Text / Categorical columns ────────────────────────────
    if var_type in ("Text", "Categorical"):
        clean = series.dropna()
        n = len(clean)
        if n > 0:
            str_series = clean.astype(str)
            vc = str_series.value_counts()

            # top values
            base.top_values = [
                {"value": str(k), "count": int(v)}
                for k, v in vc.head(20).items()
            ]
            base.mode = str(vc.index[0]) if len(vc) > 0 else None
            probs = vc / vc.sum()
            base.entropy = round(float(-sum(p * math.log2(p) for p in probs if p > 0)), 4)

            # Length stats
            lengths = str_series.str.len()
            base.max_length    = int(lengths.max())
            base.median_length = round(float(lengths.median()), 2)
            base.mean_length   = round(float(lengths.mean()), 2)
            base.min_length    = int(lengths.min())

            # Unique exact (appears exactly once)
            exact = int((vc == 1).sum())
            base.unique_exact_count = exact
            base.unique_exact_pct   = round((exact / total) * 100, 2) if total > 0 else 0.0

            # Sample values
            base.sample_values = [str(v) for v in clean.head(5).tolist()]

            # Unicode analysis on a sample (up to 50 k chars for performance)
            sample_text = " ".join(str_series.tolist())[:50_000]
            all_chars = list(sample_text)
            char_set  = set(sample_text)

            base.total_chars      = len(sample_text)
            base.distinct_chars   = len(char_set)
            base.distinct_categories = len({unicodedata.category(c) for c in char_set})
            base.distinct_scripts = _unicode_scripts(char_set)
            base.distinct_blocks  = _unicode_blocks(char_set)

            # Char frequencies
            char_counter = Counter(sample_text)
            base.char_frequencies = [
                {"char": c, "count": cnt}
                for c, cnt in char_counter.most_common(30)
                if c.strip()
            ]

            # Word frequencies
            all_words: list[str] = []
            for text in str_series.tolist():
                all_words.extend(re.findall(r"\b\w+\b", text.lower()))
            word_counter = Counter(all_words)
            base.word_frequencies = [
                {"word": w, "count": cnt}
                for w, cnt in word_counter.most_common(50)
            ]

            # Histogram for display (categorical bar chart — top 20 by value count)
            base.histogram = [
                {
                    "bin_start": 0,
                    "bin_end":   0,
                    "count":     int(v),
                    "label":     str(k)[:25],
                }
                for k, v in vc.head(20).items()
            ]

            # Length histogram for categorical Categories tab
            lvc = lengths.value_counts().sort_index()
            base.length_histogram = [
                {"length": int(length), "count": int(cnt)}
                for length, cnt in lvc.items()
            ]

            base.extreme_min = [
                {"value": str(k), "count": int(v)}
                for k, v in vc.tail(10).items()
            ]
            base.extreme_max = [
                {"value": str(k), "count": int(v)}
                for k, v in vc.head(10).items()
            ]

    # ── Numeric coercion fallback for mixed-type (Unsupported) columns ──────────
    # When pandas can't determine a clean dtype, try forcing numeric. If ≥50% of
    # non-null values parse successfully, backfill the key stats so that the DQ
    # engine can compute IQR bounds and detect non-numeric contamination.
    if base.min is None and var_type in ("Unsupported",):
        try:
            coerced = pd.to_numeric(series, errors="coerce")
            clean_c = coerced.dropna()
            n_c = len(clean_c)
            if n_c > 0 and n_c / max(total - missing, 1) >= 0.5:
                base.min            = round(float(clean_c.min()), 4)
                base.max            = round(float(clean_c.max()), 4)
                base.mean           = round(float(clean_c.mean()), 4)
                base.median         = round(float(clean_c.median()), 4)
                base.std_dev        = round(float(clean_c.std()), 4)
                base.percentile_25  = round(float(clean_c.quantile(0.25)), 4)
                base.percentile_75  = round(float(clean_c.quantile(0.75)), 4)
                base.negative_count = int((clean_c < 0).sum())
                base.zeros_count    = int((clean_c == 0).sum())
        except Exception:
            pass

    # ── Per-column quality scores (0-100) ────────────────────
    n_non_null = total - missing

    # 1. Completeness
    base.completeness_score = round((n_non_null / total) * 100, 2) if total > 0 else 0.0

    # 2. Uniqueness: distinct / non-null
    base.uniqueness_score = round(min((unique / n_non_null) * 100, 100.0), 2) if n_non_null > 0 else 0.0

    # 3. Validity: type purity — "Unsupported" means mixed types
    base.validity_score = 70.0 if var_type == "Unsupported" else 100.0

    # 4. Consistency
    if var_type == "Numeric" and base.mean is not None and base.std_dev is not None:
        clean_num = series.replace([np.inf, -np.inf], np.nan).dropna()
        if len(clean_num) > 0:
            if base.std_dev > 0:
                within_3std = int(((clean_num - base.mean).abs() <= 3 * base.std_dev).sum())
                base.consistency_score = round((within_3std / len(clean_num)) * 100, 2)
            else:
                base.consistency_score = 100.0
        else:
            base.consistency_score = 100.0
    elif var_type in ("Categorical", "Text"):
        clean_str = series.dropna().astype(str)
        if len(clean_str) > 0 and total > 0:
            vc = clean_str.value_counts()
            # Ultra-rare: categories with < 1 % of total rows
            ultra_rare_total = int(vc[vc / total < 0.01].sum())
            base.consistency_score = round(max(0.0, 100.0 - (ultra_rare_total / total) * 100.0), 2)
        else:
            base.consistency_score = 100.0
    else:
        base.consistency_score = 100.0

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

def generate_cross_column_intelligence(
    df: pd.DataFrame,
    columns: list,
) -> str:
    """
    One LLM call. Looks at the entire dataset profile and generates:
    - Suggested primary key
    - Functional dependencies
    - Data quality narrative
    - Join recommendations
    - Anomaly observations
    """
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        col_summary = []
        for col in columns:
            summary = {
                "name": col.column_name,
                "type": col.data_type,
                "semantic": col.semantic_type,
                "missing_pct": col.missing_pct,
                "unique_pct": col.unique_pct,
                "is_pii": col.is_pii,
            }
            if col.mean is not None:
                summary["mean"] = round(col.mean, 2)
                summary["min"] = col.min
                summary["max"] = col.max
                summary["skewness"] = col.skewness
            if col.top_values:
                summary["top_values"] = [tv["value"] for tv in col.top_values[:3]]
            col_summary.append(summary)

        prompt = f"""You are a senior data engineer reviewing a dataset for Wells Fargo CDO.

Dataset: {len(df)} rows × {len(df.columns)} columns

Column profiles:
{_json.dumps(col_summary, indent=2)}

Write a professional cross-column intelligence report covering:

1. **Suggested Primary Key** — which column(s) uniquely identify each row and why
2. **Functional Dependencies** — which columns appear to determine other columns (e.g. zip → state, customer_id → name)
3. **Data Quality Narrative** — a plain English summary of data quality observations, patterns, and concerns
4. **Join Recommendations** — which columns look like foreign keys suitable for joining with other tables
5. **Notable Patterns** — any unusual distributions, skewness, constant values, or anomalies worth flagging

Be specific and cite actual column names. Write for a CDO audience — technical but business-aware.
Keep each section concise (2-3 sentences max).
Format with the bold headers above."""

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1024,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"  [Lens] Cross-column intelligence failed: {e}")
        return ""

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

    # ── Generate business definitions + CDE/classification (one LLM call) ──
    print("  [Lens] Generating column definitions + CDE classifications via LLM...")
    definitions = generate_column_definitions(columns)
    for col in columns:
        entry = definitions.get(col.column_name)
        if isinstance(entry, dict):
            col.business_definition  = entry.get("definition")
            col.is_cde               = bool(entry.get("is_cde", False))
            col.info_classification  = entry.get("info_classification", "Internal")
            col.pii_classification   = entry.get("pii_classification", "Non-PII")
        elif isinstance(entry, str):
            # backward-compat: old plain-string response
            col.business_definition = entry

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

    # ── Duplicate groups with frequency counts ─
    duplicate_row_groups: list[dict] = []
    if dup_mask.any():
        try:
            str_df = df.astype(str)  # make all cols hashable
            grp = (
                str_df[dup_mask]
                .groupby(list(str_df.columns), as_index=False)
                .size()
                .rename(columns={"size": "__count__"})
                .sort_values("__count__", ascending=False)
                .head(50)
            )
            duplicate_row_groups = grp.to_dict(orient="records")
        except Exception:
            duplicate_row_groups = []

    # ── Pearson correlation matrix (numeric cols) ─
    correlation_matrix: dict | None = None
    numeric_col_names = [c.column_name for c in columns if c.var_type == "Numeric"]
    if len(numeric_col_names) >= 2:
        try:
            numeric_df = df[numeric_col_names].apply(pd.to_numeric, errors="coerce")
            corr = numeric_df.corr(method="pearson").round(4)
            correlation_matrix = {
                col: {other: (None if pd.isna(v) else float(v)) for other, v in row.items()}
                for col, row in corr.to_dict().items()
            }
        except Exception:
            pass

    # ── Numeric sample data (for hexbin endpoint) ─────────
    numeric_sample_data: dict | None = None
    if numeric_col_names:
        try:
            def _safe_float(v):
                return None if pd.isna(v) else float(v)
            numeric_sample_data = {
                col: [_safe_float(v) for v in df[col].head(5000)]
                for col in numeric_col_names
            }
        except Exception:
            pass

    # ── Missing-value correlation matrix ─────────────────
    missing_correlation_matrix: dict | None = None
    try:
        miss_ind = df.isna().astype(float)
        # Columns with zero variance in missingness would yield NaN corr — keep them
        miss_corr = miss_ind.corr(method="pearson").round(3)
        missing_correlation_matrix = {
            col: {other: (None if pd.isna(v) else float(v)) for other, v in row.items()}
            for col, row in miss_corr.to_dict().items()
        }
    except Exception:
        pass

    # ── Cross-column intelligence ─────────────
    print("  [Lens] Generating cross-column intelligence...")
    cross_column_intelligence = generate_cross_column_intelligence(df, columns)

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
        duplicate_row_groups=duplicate_row_groups,
        sample_head=sample_head,
        sample_tail=sample_tail,
        columns=columns,
        correlation_matrix=correlation_matrix,
        missing_correlation_matrix=missing_correlation_matrix,
        numeric_sample_data=numeric_sample_data,
        health_score=health,
        health_breakdown=breakdown,
        drift_alerts=drift_alerts,
        prior_profile_id=prior_id,
        audit_log=audit_log,
        deterministic_only=True,
        raw_llm_narrative=cross_column_intelligence,
    )

    return contract