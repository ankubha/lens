"""
Lens DQ Engine — LLM Inference Engine
=======================================
Hybrid approach:
  1. LLM call — context-aware checks (cross-field rules, business logic, pattern detection)
  2. Rule-based guarantees — baseline checks that must never be missed regardless of LLM output

This mirrors how enterprise tools (Qualytics, Great Expectations) work.
"""
from __future__ import annotations
import os
import re
import json
import logging
from pathlib import Path

import pandas as pd

from backend.models.profile_contract import ProfileContract
from backend.dq.models import DQCheck, DQCheckType, DQCheckStatus, DQDimension

logger = logging.getLogger(__name__)

_CHECK_DIMENSION: dict[str, DQDimension] = {
    "not_null":           DQDimension.completeness,
    "any_not_null":       DQDimension.completeness,
    "required_values":    DQDimension.completeness,
    "is_type":            DQDimension.validity,
    "matches_pattern":    DQDimension.validity,
    "expected_values":    DQDimension.validity,
    "expected_schema":    DQDimension.validity,
    "field_count":        DQDimension.dataset_level,
    "between":            DQDimension.numeric,
    "min_value":          DQDimension.numeric,
    "max_value":          DQDimension.numeric,
    "not_negative":       DQDimension.numeric,
    "positive":           DQDimension.numeric,
    "greater_than":       DQDimension.numeric,
    "less_than":          DQDimension.numeric,
    "distinct_count":     DQDimension.numeric,
    "min_length":         DQDimension.string,
    "max_length":         DQDimension.string,
    "not_future":         DQDimension.date_time,
    "after_date_time":    DQDimension.date_time,
    "before_date_time":   DQDimension.date_time,
    "between_times":      DQDimension.date_time,
    "greater_than_field": DQDimension.cross_field,
    "less_than_field":    DQDimension.cross_field,
    "equal_to_field":     DQDimension.cross_field,
    "sum":                DQDimension.aggregate,
    "unique":             DQDimension.dataset_level,
}

_PROPOSABLE_CHECK_TYPES = set(_CHECK_DIMENSION.keys())

_FINANCIAL_KEYWORDS   = {"balance", "amount", "limit", "loan", "fee", "revenue", "price", "cost", "outstanding", "credit", "payment", "salary", "income"}
_FUTURE_DATE_KEYWORDS = {"transaction", "event", "last", "updated", "modified", "recorded", "processed", "completed", "paid"}
_OPEN_DATE_KEYWORDS   = {"open", "start", "created", "inception", "issued", "originated"}
_ID_KEYWORDS          = {"id", "key", "code", "number", "no", "num", "ref", "identifier"}

# Columns that can legitimately hold negative values — never add not_negative for these
_CAN_BE_NEGATIVE = {"balance", "amount", "return", "pnl", "profit", "loss", "delta", "change", "diff", "net"}

# Columns whose IQR lower bound should be clamped to 0
_STRICTLY_NON_NEG = {"limit", "loan", "outstanding", "price", "quantity", "age", "fee", "revenue", "cost"}

# Column name keywords that are always numeric even if profiler mis-classifies them
# Includes financial terms so that balance/amount always trigger rule-based numeric checks
_NUMERIC_NAME_KEYWORDS = (
    {"rate", "percent", "ratio", "score", "interest", "yield"} | _FINANCIAL_KEYWORDS
)

# Check types that must always be computed by rule-based — never accepted from LLM
# (between bounds must be derived from IQR data, not guessed by the model)
_RULE_BASED_ONLY: set[str] = {"between"}


def _sanitize_llm_check(item: dict, col_profile=None) -> dict | None:
    """
    Fix or reject LLM-proposed checks with obviously wrong parameters.
    Returns None to drop the check entirely.
    col_profile: optional column profile object for data-driven bound overrides.
    """
    from datetime import date as _date
    ct_str = str(item.get("check_type", "")).strip()
    col    = str(item.get("column_name", "")).strip().lower()
    params = dict(item.get("parameters") or {})

    # Drop not_negative for columns that can legitimately be negative
    if ct_str == "not_negative" and any(kw in col for kw in _CAN_BE_NEGATIVE):
        return None

    # `between` checks are always handled by rule-based (IQR-computed) — never from LLM
    # This guard is a safety net; Phase 1 already skips them via _RULE_BASED_ONLY
    if ct_str == "between":
        return None

    # Elevate not_negative severity for inherently non-negative financial columns
    if ct_str == "not_negative":
        strict_financial = {"limit", "loan", "outstanding", "price", "quantity", "fee", "rate", "percent"}
        if any(kw in col for kw in strict_financial):
            item = {**item, "severity": "HIGH"}

    # matches_pattern and expected_values are always HIGH — format/domain violations
    # break joins, reporting, and downstream pipeline assumptions
    if ct_str in ("matches_pattern", "expected_values"):
        item = {**item, "severity": "HIGH"}

    # Clamp between_times "before" to today if it's a future date
    if ct_str == "between_times":
        today  = _date.today().isoformat()
        before = str(params.get("before", ""))
        if before and before > today:
            params = {**params, "before": today}
            item   = {**item, "parameters": params}

    return item


def _build_profile_context(profile: ProfileContract) -> str:
    lines = [
        f"File: {profile.filename}",
        f"Rows: {profile.row_count:,}  |  Columns: {profile.column_count}  |  Duplicates: {profile.duplicate_row_count or 0}",
        "",
        "COLUMN PROFILES:",
    ]
    for col in profile.columns:
        parts: list[str] = [f"  [{col.var_type or col.data_type}] {col.column_name}"]
        if col.missing_pct > 0:
            parts.append(f"null={col.missing_pct:.1f}%")
        if col.unique_count is not None:
            parts.append(f"unique={col.unique_count}")
        if col.min is not None and col.max is not None:
            parts.append(f"range=[{col.min}, {col.max}]")
        if col.mean is not None:
            parts.append(f"mean={col.mean:.3g}")
        if col.percentile_25 is not None and col.percentile_75 is not None:
            iqr = col.percentile_75 - col.percentile_25
            iqr_lo = round(col.percentile_25 - 1.5 * iqr, 4)
            iqr_hi = round(col.percentile_75 + 1.5 * iqr, 4)
            parts.append(f"IQR_bounds=[{iqr_lo}, {iqr_hi}]")
        if col.negative_count and col.negative_count > 0:
            parts.append(f"negatives={col.negative_count}")
        if col.min_date is not None:
            parts.append(f"dates=[{col.min_date}, {col.max_date}]")
        if col.top_values:
            vals = [str(v["value"]) for v in col.top_values[:8]]
            parts.append(f"top=[{', '.join(vals)}]")
        if col.distinct_categories is not None:
            parts.append(f"categories={col.distinct_categories}")
        if col.sample_values:
            parts.append(f"samples=[{', '.join(str(s) for s in col.sample_values[:5])}]")
        if col.is_pii or col.pii_classification == "PII":
            parts.append("PII=true")
        lines.append(", ".join(parts))
    return "\n".join(lines)


def _safe_serialize(val):
    if val is None:
        return None
    if isinstance(val, float) and pd.isna(val):
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    if not isinstance(val, (int, float, bool, str, type(None))):
        return str(val)
    return val


def _make_check(profile_id: str, col: str, ct_str: str, params: dict,
                desc: str, severity: str, rationale: str) -> DQCheck | None:
    try:
        ct  = DQCheckType(ct_str)
        dim = _CHECK_DIMENSION.get(ct_str, DQDimension.validity)
        return DQCheck(
            profile_id  = profile_id,
            column_name = col,
            check_type  = ct,
            dimension   = dim,
            parameters  = params,
            description = desc,
            severity    = severity,
            rationale   = rationale,
            source      = "inferred",
        )
    except Exception:
        return None


def _rule_based_checks(profile: ProfileContract, seen: set[tuple[str, str]]) -> list[DQCheck]:
    """
    Guarantee baseline checks that LLM might miss.
    Always runs after LLM inference — only adds checks not already proposed.
    """
    pid    = profile.profile_id
    checks: list[DQCheck] = []

    def add(col: str, ct_str: str, params: dict, desc: str, sev: str, rationale: str):
        key = (col, ct_str)
        if key in seen:
            return
        seen.add(key)
        c = _make_check(pid, col, ct_str, params, desc, sev, rationale)
        if c:
            checks.append(c)

    for col in profile.columns:
        cn  = col.column_name
        vt  = (col.var_type or "").lower()
        cln = cn.lower()

        # ── Completeness ─────────────────────────────────────────
        if col.missing_pct > 0:
            sev = "HIGH" if col.missing_pct > 5 else "MEDIUM"
            add(cn, "not_null", {}, f"{cn} must not contain null values", sev,
                f"{col.missing_pct:.1f}% nulls detected — completeness issue.")

        # ── Numeric ───────────────────────────────────────────────
        is_numeric_by_name = any(kw in cln for kw in _NUMERIC_NAME_KEYWORDS)
        if vt == "numeric" or col.min is not None or is_numeric_by_name:
            # Type check — catches "one hundred", "ten percent" etc.
            add(cn, "is_type", {"expected_type": "numeric"},
                f"{cn} must be a valid numeric value", "HIGH",
                "Non-numeric strings in a numeric column corrupt downstream calculations.")

            # IQR-based outlier range — clamp lower bound to 0 for inherently non-negative columns
            if col.percentile_25 is not None and col.percentile_75 is not None:
                iqr    = col.percentile_75 - col.percentile_25
                iqr_lo = round(col.percentile_25 - 1.5 * iqr, 4)
                iqr_hi = round(col.percentile_75 + 1.5 * iqr, 4)
                non_neg_keywords = {"limit", "loan", "outstanding", "price", "quantity", "age", "fee",
                                    "rate", "percent", "ratio", "score"}
                if any(kw in cln for kw in non_neg_keywords):
                    iqr_lo = max(iqr_lo, 0)
                add(cn, "between", {"min": iqr_lo, "max": iqr_hi},
                    f"{cn} must be within statistical bounds", "MEDIUM",
                    f"IQR outlier check: values outside [{iqr_lo}, {iqr_hi}] are statistical anomalies.")

            # Not-negative for strictly non-negative financial/measurement columns
            non_neg_financial = {"limit", "loan", "outstanding", "revenue", "price", "cost", "fee",
                                 "credit_limit", "rate", "percent", "ratio"}
            if any(kw in cln for kw in non_neg_financial):
                add(cn, "not_negative", {},
                    f"{cn} must not be negative", "HIGH",
                    "This financial value is strictly non-negative by definition.")

        # ── DateTime ──────────────────────────────────────────────
        has_date_name = "date" in cln or "time" in cln or cln.endswith("_at")
        if vt == "datetime" or col.min_date is not None or has_date_name:
            add(cn, "is_type", {"expected_type": "datetime"},
                f"{cn} must be a valid date/time value", "HIGH",
                "Non-parseable dates will silently break date arithmetic and reporting.")

            # Apply not_future to all date columns except forward-looking ones (expiry, due, scheduled)
            forward_keywords = {"expir", "due", "schedul", "forecast", "target", "expected", "maturity"}
            if not any(kw in cln for kw in forward_keywords):
                add(cn, "not_future", {},
                    f"{cn} must not be a future date", "HIGH",
                    "Historical dates cannot be in the future — indicates bad data entry or system error.")

            from datetime import date as _date
            before_dt = _date.today().isoformat()
            if col.min_date:
                after_dt = str(col.min_date)[:10]
            elif any(kw in cln for kw in _OPEN_DATE_KEYWORDS):
                after_dt = "1900-01-01"
            else:
                after_dt = "2000-01-01"
            add(cn, "between_times", {"after": after_dt, "before": before_dt},
                f"{cn} must fall within a valid date range", "MEDIUM",
                f"Dates outside [{after_dt}, {before_dt}] indicate bad data entry or system error.")

        # ── Categorical — expected values ─────────────────────────
        # Skip ID columns — they have many unique values and expected_values would flag everything
        is_id_col = any(kw in cln for kw in _ID_KEYWORDS) and (col.unique_count or 0) > 20
        if col.top_values and col.distinct_categories is not None and col.distinct_categories <= 15 and not is_id_col:
            canonical = [str(v["value"]) for v in col.top_values if v["value"] is not None]
            if canonical:
                add(cn, "expected_values", {"allowed_values": canonical},
                    f"{cn} must be one of the known categorical values", "MEDIUM",
                    f"Column has {col.distinct_categories} distinct values; anything outside this set is an anomaly.")

        # ── String / ID columns ───────────────────────────────────
        if vt in ("text", "categorical") or (col.sample_values and col.min is None):
            # Skip length checks when a pattern check fully constrains the format
            has_pattern = (cn, "matches_pattern") in seen
            if not has_pattern:
                if col.max_length is not None:
                    add(cn, "max_length", {"max_length": int(col.max_length)},
                        f"{cn} must not exceed {col.max_length} characters", "LOW",
                        "Unexpectedly long strings indicate truncation errors or data injection.")
                if col.min_length is not None and col.min_length > 0:
                    add(cn, "min_length", {"min_length": int(col.min_length)},
                        f"{cn} must be at least {col.min_length} characters", "MEDIUM",
                        "Unexpectedly short or empty strings indicate incomplete records.")

    # ── Cross-field: transaction_date > open_date ─────────────────
    open_cols = [c.column_name for c in profile.columns
                 if any(kw in c.column_name.lower() for kw in _OPEN_DATE_KEYWORDS)
                 and (c.var_type or "").lower() == "datetime" or c.min_date is not None]
    txn_cols  = [c.column_name for c in profile.columns
                 if any(kw in c.column_name.lower() for kw in _FUTURE_DATE_KEYWORDS)
                 and (c.var_type or "").lower() == "datetime" or c.min_date is not None]
    for txn_col in txn_cols:
        for open_col in open_cols:
            if txn_col != open_col:
                add(txn_col, "greater_than_field", {"field": open_col},
                    f"{txn_col} must be after {open_col}", "HIGH",
                    f"A transaction cannot predate the account opening — indicates corrupt or mismatched records.")
                break

    # ── Dataset-level ─────────────────────────────────────────────
    if profile.column_count:
        add("__dataset__", "field_count",
            {"min": profile.column_count, "max": profile.column_count},
            f"Dataset must have exactly {profile.column_count} columns", "HIGH",
            "Schema drift detection — unexpected column additions or drops break pipelines.")

    add("__dataset__", "unique", {},
        "No exact duplicate rows allowed", "HIGH",
        "Duplicate rows indicate data pipeline or ingestion errors.")

    return checks


def infer_checks(profile: ProfileContract, file_path: str | Path) -> list[DQCheck]:
    path = Path(file_path)
    try:
        if path.suffix.lower() == ".csv":
            df_sample = pd.read_csv(path, nrows=50)
        else:
            df_sample = pd.read_excel(path, nrows=50)
    except Exception as e:
        logger.error(f"[DQ] Could not load sample data: {e}")
        df_sample = pd.DataFrame()

    sample_rows: list[dict] = []
    for row in df_sample.head(30).to_dict(orient="records"):
        sample_rows.append({k: _safe_serialize(v) for k, v in row.items()})

    profile_ctx = _build_profile_context(profile)
    col_names   = [c.column_name for c in profile.columns]

    prompt = f"""You are a senior data quality engineer at a financial institution. \
Analyze the dataset profile and sample data below, then propose a comprehensive set of DQ checks.

═══ DATASET PROFILE ═══
{profile_ctx}

═══ SAMPLE DATA (up to 30 rows) ═══
{json.dumps(sample_rows, default=str, indent=2)}

═══ AVAILABLE CHECK TYPES ═══
[Completeness]  not_null, any_not_null, required_values
[Validity]      is_type, matches_pattern, expected_values, expected_schema, field_count
[Numeric]       between, min_value, max_value, not_negative, positive, greater_than, less_than, distinct_count
[String]        min_length, max_length
[DateTime]      not_future, after_date_time, before_date_time, between_times
[Cross-field]   greater_than_field, less_than_field, equal_to_field
[Aggregate]     sum
[Dataset-level] unique

═══ PARAMETER FORMATS ═══
not_null            → {{}}
any_not_null        → {{"columns": ["col_a", "col_b"]}}
required_values     → {{"required": ["val1", "val2"]}}
is_type             → {{"expected_type": "numeric|string|datetime|boolean"}}
matches_pattern     → {{"pattern": "regex_string"}}
expected_values     → {{"allowed_values": ["a", "b", "c"]}}
expected_schema     → {{}}
field_count         → {{"min": 5, "max": 20}}
between             → {{"min": 0, "max": 100}}
min_value           → {{"min": 0}}
max_value           → {{"max": 1000}}
not_negative        → {{}}
positive            → {{}}
greater_than        → {{"threshold": 0}}
less_than           → {{"threshold": 1000000}}
distinct_count      → {{"min": 2, "max": 50}}
min_length          → {{"min_length": 1}}
max_length          → {{"max_length": 255}}
not_future          → {{}}
after_date_time     → {{"after": "YYYY-MM-DD"}}
before_date_time    → {{"before": "YYYY-MM-DD"}}
between_times       → {{"after": "YYYY-MM-DD", "before": "YYYY-MM-DD"}}
greater_than_field  → {{"field": "other_col"}}
less_than_field     → {{"field": "other_col"}}
equal_to_field      → {{"field": "other_col"}}
sum                 → {{"min": 0, "max": 1e9}}
unique              → {{}}

═══ OUTPUT FORMAT ═══
Return ONLY a JSON array. Each element MUST have exactly these keys:
{{
  "check_type":   "<one of the check types above>",
  "column_name":  "<exact column name, or __dataset__ for dataset-level checks>",
  "parameters":   {{}},
  "description":  "<business-friendly, max 20 words>",
  "severity":     "HIGH|MEDIUM|LOW",
  "rationale":    "<one sentence: why this check matters for this data>",
  "dimension":    "completeness|validity|numeric|string|date_time|cross_field|aggregate|dataset_level"
}}

═══ INSTRUCTIONS ═══
Go column by column. For EVERY column propose all relevant checks. Be exhaustive.

NUMERIC COLUMNS:
- Use IQR_bounds (shown in profile) for `between` — NOT raw min/max
- Propose is_type(numeric) for any column with string contamination in top/sample values
- Propose not_negative for financial columns (balance, amount, limit, loan, fee, payment)
- Propose positive for strictly positive columns (price, quantity, age)

CATEGORICAL / STRING COLUMNS:
- If categories ≤ 15 or top values show a clear fixed set → propose expected_values with canonical values
- If sample/top values follow a prefix+digits pattern (CUST000001, TXN-0001) → propose matches_pattern
- Propose min_length and max_length based on observed lengths

DATETIME COLUMNS:
- Propose not_future for transaction/event/last-activity dates
- Propose between_times using the observed date range
- Detect open_date vs transaction_date pairs → propose greater_than_field (transaction > open)

DATASET-LEVEL:
- Propose unique for duplicate row detection
- Propose field_count with exact column count

HIGH severity = data cannot be trusted if this fails
MEDIUM = important quality issue
LOW = advisory

Valid column names: {col_names}
Use __dataset__ only for field_count and unique checks.
No duplicate (column_name, check_type) pairs.
Respond with ONLY the JSON array — no markdown, no explanation, no backticks."""

    proposed: list[dict] = []
    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        resp   = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a precise JSON-generating assistant. "
                        "Always respond with only a valid JSON array — "
                        "no markdown, no preamble, no explanation."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            max_tokens=8192,
        )
        raw = resp.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$",          "", raw).strip()
        m = re.search(r"\[[\s\S]*\]", raw)
        if m:
            raw = m.group()
        proposed = json.loads(raw)
        if not isinstance(proposed, list):
            proposed = []
    except Exception as e:
        logger.error(f"[DQ] LLM inference failed: {e}")
        proposed = []

    # ── Phase 1: accept LLM-proposed checks ──────────────────────
    checks: list[DQCheck] = []
    seen:   set[tuple[str, str]] = set()
    valid_cols = set(col_names)
    col_profile_map = {c.column_name: c for c in profile.columns}

    for item in proposed:
        try:
            col = str(item.get("column_name", "")).strip() or "__dataset__"
            if col != "__dataset__" and col not in valid_cols:
                logger.warning(f"[DQ] Skipping check on unknown column '{col}'")
                continue

            # Sanitize before accepting — pass column profile for data-driven bound overrides
            item = _sanitize_llm_check(item, col_profile=col_profile_map.get(col))
            if item is None:
                continue

            ct_str = str(item.get("check_type", "")).strip()
            if ct_str not in _PROPOSABLE_CHECK_TYPES:
                continue
            # Some check types are always computed by rule-based for accuracy — skip LLM proposals
            if ct_str in _RULE_BASED_ONLY:
                continue
            key = (col, ct_str)
            if key in seen:
                continue
            seen.add(key)

            # Always use canonical dimension — never trust LLM's grouping
            dim = _CHECK_DIMENSION.get(ct_str, DQDimension.validity)

            sev = str(item.get("severity", "MEDIUM")).upper().strip()
            if sev not in ("HIGH", "MEDIUM", "LOW"):
                sev = "MEDIUM"

            checks.append(DQCheck(
                profile_id  = profile.profile_id,
                column_name = col,
                check_type  = DQCheckType(ct_str),
                dimension   = dim,
                parameters  = item.get("parameters") or {},
                description = str(item.get("description", "")).strip(),
                severity    = sev,
                rationale   = str(item.get("rationale", "")).strip(),
                source      = "inferred",
            ))
        except Exception as e:
            logger.warning(f"[DQ] Skipping invalid proposed check {item}: {e}")

    # ── Post-Phase-1: drop redundant length checks when pattern check covers the column ──
    pattern_cols = {c.column_name for c in checks if c.check_type.value == "matches_pattern"}
    if pattern_cols:
        checks = [
            c for c in checks
            if not (c.check_type.value in ("min_length", "max_length") and c.column_name in pattern_cols)
        ]
        seen = {(c.column_name, c.check_type.value) for c in checks}

    # ── Phase 2: rule-based guarantees (fill gaps LLM missed) ────
    rule_checks = _rule_based_checks(profile, seen)
    checks.extend(rule_checks)

    logger.info(
        f"[DQ] LLM proposed {len(proposed)} checks; "
        f"{len(checks) - len(rule_checks)} accepted + {len(rule_checks)} rule-based "
        f"= {len(checks)} total for profile {profile.profile_id}"
    )
    return checks
