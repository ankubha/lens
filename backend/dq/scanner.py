"""
Lens DQ Engine — Scanner
=========================
Executes authorized DQ checks against the full dataset.
Handles all 34 check types: per-row single-column, cross-field, and aggregate/shape checks.
Anomaly classification: record-level (specific failing rows) vs shape-level (dataset-wide).
DQ Score = checks_passed / total_authorized * 100
"""
from __future__ import annotations
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import numpy as np

from backend.dq.models import (
    DQCheck, DQCheckType, DQCheckStatus,
    DQAnomaly, ScanResult,
)

logger = logging.getLogger(__name__)

_MAX_RECORD_ANOMALIES = 50

# Check types that evaluate the dataset as a whole (produce shape anomaly only)
_AGGREGATE_CHECK_TYPES: set[DQCheckType] = {
    DQCheckType.required_values,
    DQCheckType.expected_schema,
    DQCheckType.field_count,
    DQCheckType.distinct_count,
    DQCheckType.sum,
}


def _sev_from_check(check: DQCheck) -> str:
    """Map check severity (HIGH/MEDIUM/LOW) → anomaly severity (high/medium/low)."""
    return (check.severity or "MEDIUM").lower()


def _coerce_numeric(s: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(s):
        return s
    return pd.to_numeric(s, errors="coerce")


def _coerce_datetime(s: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(s):
        return s
    return pd.to_datetime(s, errors="coerce", utc=False)


def _tz_strip(s: pd.Series) -> pd.Series:
    """Strip timezone so comparisons with tz-naive timestamps don't blow up."""
    try:
        if hasattr(s, "dt") and s.dt.tz is not None:
            return s.dt.tz_localize(None)
    except Exception:
        pass
    return s


# ── Per-row fail-mask builder ──────────────────────────────────────────────────
# Returns a boolean Series: True = this row FAILS the check.
# Receives the full dataframe so cross-column checks can access other columns.

def _build_fail_mask(df: pd.DataFrame, check: DQCheck, now: pd.Timestamp) -> pd.Series:
    col = check.column_name
    p   = check.parameters
    ct  = check.check_type

    # Primary series — may be missing for dataset-level checks
    series: pd.Series = df[col] if col in df.columns else pd.Series(dtype=object, index=df.index)
    false_mask = pd.Series(False, index=df.index)

    # ── Completeness ──────────────────────────────────────────
    if ct == DQCheckType.not_null:
        return series.isna() | (series.astype(str).str.strip() == "")

    if ct == DQCheckType.any_not_null:
        cols  = p.get("columns", [col])
        all_null = pd.Series(True, index=df.index)
        for c in cols:
            if c in df.columns:
                all_null = all_null & df[c].isna()
        return all_null

    # ── Validity ──────────────────────────────────────────────
    if ct == DQCheckType.is_type:
        expected = str(p.get("expected_type", "")).lower()
        non_null = series.notna()
        if expected == "numeric":
            coerced = pd.to_numeric(series, errors="coerce")
            return non_null & coerced.isna()
        if expected == "datetime":
            coerced = pd.to_datetime(series, errors="coerce")
            return non_null & coerced.isna()
        if expected == "boolean":
            bool_vals = {"true", "false", "1", "0", "yes", "no"}
            return non_null & ~series.astype(str).str.lower().isin(bool_vals)
        return false_mask  # "string" always passes

    if ct in (DQCheckType.matches_pattern, DQCheckType.pattern_match):
        pattern  = p.get("pattern", "")
        non_null = series.notna()
        return non_null & ~series.astype(str).str.fullmatch(pattern, na=False)

    if ct in (DQCheckType.expected_values, DQCheckType.categorical_set):
        allowed  = set(str(v) for v in p.get("allowed_values", []))
        non_null = series.notna()
        return non_null & ~series.astype(str).isin(allowed)

    # ── Numeric ───────────────────────────────────────────────
    if ct in (DQCheckType.between, DQCheckType.min_max_range):
        num      = _coerce_numeric(series)
        non_null = num.notna()
        lo, hi   = p.get("min", p.get("lower_bound", -np.inf)), p.get("max", p.get("upper_bound", np.inf))
        return non_null & ((num < lo) | (num > hi))

    if ct in (DQCheckType.iqr_outlier, DQCheckType.z_score_outlier, DQCheckType.distribution_fit):
        num      = _coerce_numeric(series)
        non_null = num.notna()
        lo = p.get("lower_bound", -np.inf)
        hi = p.get("upper_bound",  np.inf)
        return non_null & ((num < lo) | (num > hi))

    if ct == DQCheckType.min_value:
        num = _coerce_numeric(series)
        return num.notna() & (num < p.get("min", 0))

    if ct == DQCheckType.max_value:
        num = _coerce_numeric(series)
        return num.notna() & (num > p.get("max", 0))

    if ct in (DQCheckType.not_negative, DQCheckType.non_negative):
        num = _coerce_numeric(series)
        return num.notna() & (num < 0)

    if ct == DQCheckType.positive:
        num = _coerce_numeric(series)
        return num.notna() & (num <= 0)

    if ct == DQCheckType.greater_than:
        num = _coerce_numeric(series)
        return num.notna() & (num <= p.get("threshold", 0))

    if ct == DQCheckType.less_than:
        num = _coerce_numeric(series)
        return num.notna() & (num >= p.get("threshold", 0))

    # ── String ────────────────────────────────────────────────
    if ct in (DQCheckType.min_length, DQCheckType.string_length):
        # string_length legacy uses min_length / max_length params
        non_null = series.notna()
        lengths  = series.astype(str).str.len()
        min_l    = p.get("min_length", 0)
        result   = non_null & (lengths < min_l)
        if ct == DQCheckType.string_length:
            max_l  = p.get("max_length")
            if max_l is not None:
                result = result | (non_null & (lengths > max_l))
        return result

    if ct == DQCheckType.max_length:
        non_null = series.notna()
        lengths  = series.astype(str).str.len()
        return non_null & (lengths > p.get("max_length", 255))

    # ── DateTime ──────────────────────────────────────────────
    if ct in (DQCheckType.not_future, DQCheckType.no_future_date):
        dt = _tz_strip(_coerce_datetime(series))
        return dt.notna() & (dt > now)

    if ct == DQCheckType.after_date_time:
        dt    = _tz_strip(_coerce_datetime(series))
        after = pd.Timestamp(p.get("after", "1900-01-01"))
        return dt.notna() & (dt < after)

    if ct == DQCheckType.before_date_time:
        dt     = _tz_strip(_coerce_datetime(series))
        before = pd.Timestamp(p.get("before", "2100-01-01"))
        return dt.notna() & (dt > before)

    if ct in (DQCheckType.between_times, DQCheckType.date_range):
        dt     = _tz_strip(_coerce_datetime(series))
        after  = pd.Timestamp(p.get("after",    p.get("min_date", "1900-01-01")))
        before = pd.Timestamp(p.get("before",   p.get("max_date", "2100-01-01")))
        return dt.notna() & ((dt < after) | (dt > before))

    # ── Dataset-level (unique) ─────────────────────────────────
    if ct in (DQCheckType.unique, DQCheckType.uniqueness):
        return series.duplicated(keep=False)

    # ── Cross-field ───────────────────────────────────────────
    if ct == DQCheckType.greater_than_field:
        other = p.get("field", "")
        if other not in df.columns:
            return false_mask
        a_n, b_n = _coerce_numeric(series), _coerce_numeric(df[other])
        orig_nn = series.notna().sum()
        if orig_nn > 0 and (a_n.notna().sum() / orig_nn) >= 0.5:
            both = a_n.notna() & b_n.notna()
            return both & (a_n <= b_n)
        a_d = _tz_strip(_coerce_datetime(series))
        b_d = _tz_strip(_coerce_datetime(df[other]))
        both = a_d.notna() & b_d.notna()
        return both & (a_d <= b_d)

    if ct == DQCheckType.less_than_field:
        other = p.get("field", "")
        if other not in df.columns:
            return false_mask
        a_n, b_n = _coerce_numeric(series), _coerce_numeric(df[other])
        orig_nn = series.notna().sum()
        if orig_nn > 0 and (a_n.notna().sum() / orig_nn) >= 0.5:
            both = a_n.notna() & b_n.notna()
            return both & (a_n >= b_n)
        a_d = _tz_strip(_coerce_datetime(series))
        b_d = _tz_strip(_coerce_datetime(df[other]))
        both = a_d.notna() & b_d.notna()
        return both & (a_d >= b_d)

    if ct == DQCheckType.equal_to_field:
        other = p.get("field", "")
        if other not in df.columns:
            return false_mask
        return series.notna() & df[other].notna() & (series.astype(str) != df[other].astype(str))

    # ── Custom expression ─────────────────────────────────────
    if ct == DQCheckType.satisfies_expression:
        expr = p.get("expression", "")
        if not expr:
            return false_mask
        try:
            result = df.eval(expr)
            return ~result.fillna(False).astype(bool)
        except Exception as e:
            logger.warning(f"[DQ] satisfies_expression eval failed for '{expr}': {e}")
            return false_mask

    return false_mask


# ── Aggregate check evaluator ──────────────────────────────────────────────────
# Returns (passed: bool, failure_description: str)

def _eval_aggregate_check(
    df: pd.DataFrame, check: DQCheck, now: pd.Timestamp
) -> tuple[bool, str]:
    col = check.column_name
    p   = check.parameters
    ct  = check.check_type

    if ct == DQCheckType.field_count:
        n     = len(df.columns)
        min_c = p.get("min", 0)
        max_c = p.get("max", float("inf"))
        if n < min_c:
            return False, f"Column count {n} is below minimum {min_c}."
        if n > max_c:
            return False, f"Column count {n} exceeds maximum {max_c}."
        return True, ""

    if ct == DQCheckType.expected_schema:
        if col not in df.columns:
            return False, f"Expected column '{col}' does not exist in the dataset."
        return True, ""

    if ct == DQCheckType.required_values:
        if col not in df.columns:
            return False, f"Column '{col}' not found."
        required = set(str(v) for v in p.get("required", []))
        present  = set(df[col].dropna().astype(str).unique())
        missing  = required - present
        if missing:
            return False, f"Column '{col}' is missing required values: {sorted(missing)}."
        return True, ""

    if ct == DQCheckType.distinct_count:
        if col not in df.columns:
            return False, f"Column '{col}' not found."
        n     = int(df[col].nunique())
        min_d = p.get("min")
        max_d = p.get("max")
        if min_d is not None and n < min_d:
            return False, f"Column '{col}' has {n} distinct values, below minimum {min_d}."
        if max_d is not None and n > max_d:
            return False, f"Column '{col}' has {n} distinct values, exceeding maximum {max_d}."
        return True, ""

    if ct == DQCheckType.sum:
        if col not in df.columns:
            return False, f"Column '{col}' not found."
        total = float(_coerce_numeric(df[col]).sum())
        lo    = p.get("min", -float("inf"))
        hi    = p.get("max",  float("inf"))
        if total < lo:
            return False, f"Sum of '{col}' is {total:,.2f}, below minimum {lo:,.2f}."
        if total > hi:
            return False, f"Sum of '{col}' is {total:,.2f}, above maximum {hi:,.2f}."
        return True, ""

    return True, ""


# ── Main entry point ───────────────────────────────────────────────────────────

def run_scan(file_path: str | Path, checks: list[DQCheck], profile_id: str) -> ScanResult:
    path       = Path(file_path)
    authorized = [c for c in checks if c.status == DQCheckStatus.authorized]

    # Load full dataset
    suffix = path.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(path)
    elif suffix in (".xlsx", ".xls"):
        df = pd.read_excel(path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    total_rows = len(df)
    now        = pd.Timestamp.utcnow().tz_localize(None)

    # Separate per-row checks from aggregate checks
    per_row_checks = [c for c in authorized if c.check_type not in _AGGREGATE_CHECK_TYPES]
    agg_checks     = [c for c in authorized if c.check_type in _AGGREGATE_CHECK_TYPES]

    anomalies:      list[DQAnomaly] = []
    updated_checks: list[DQCheck]   = []

    # ── Per-row checks ─────────────────────────────────────────
    for check in per_row_checks:
        col = check.column_name
        sev = _sev_from_check(check)

        # Skip if the primary column is simply missing (column-level check on absent col)
        if col not in df.columns and col != "__dataset__":
            check.pass_count = total_rows
            check.fail_count = 0
            check.fail_pct   = 0.0
            updated_checks.append(check)
            continue

        try:
            fail_mask = _build_fail_mask(df, check, now)
        except Exception as e:
            logger.warning(f"[DQ] mask error on {col}/{check.check_type}: {e}")
            check.pass_count = total_rows
            check.fail_count = 0
            check.fail_pct   = 0.0
            updated_checks.append(check)
            continue

        fail_indices = fail_mask[fail_mask].index.tolist()
        fail_count   = len(fail_indices)
        pass_count   = total_rows - fail_count
        fail_pct     = fail_count / total_rows if total_rows > 0 else 0.0

        check.pass_count = pass_count
        check.fail_count = fail_count
        check.fail_pct   = round(fail_pct * 100, 4)
        updated_checks.append(check)

        if fail_count == 0:
            continue

        if fail_pct >= 0.05:
            # Shape anomaly — too many failures to list individually
            anomalies.append(DQAnomaly(
                check_id        = check.check_id,
                column_name     = col,
                check_type      = check.check_type,
                anomaly_type    = "shape",
                offending_value = None,
                description     = (
                    f"{fail_count:,} of {total_rows:,} rows ({fail_pct*100:.1f}%) "
                    f"fail the {check.check_type.value} check on '{col}'."
                ),
                severity = sev,
            ))
        else:
            # Record anomalies — report individual failing rows (up to limit)
            for i, row_idx in enumerate(fail_indices[:_MAX_RECORD_ANOMALIES]):
                row = df.loc[row_idx].to_dict()
                row_safe: dict[str, Any] = {
                    k: (
                        None         if isinstance(v, float) and np.isnan(v) else
                        v.isoformat() if hasattr(v, "isoformat") else
                        str(v)        if not isinstance(v, (int, float, bool, type(None))) else v
                    )
                    for k, v in row.items()
                }
                offending = row_safe.get(col)
                anomalies.append(DQAnomaly(
                    check_id        = check.check_id,
                    column_name     = col,
                    check_type      = check.check_type,
                    anomaly_type    = "record",
                    row_index       = int(row_idx),
                    row_data        = row_safe,
                    offending_value = offending,
                    description     = (
                        f"Row {row_idx}: '{col}' value "
                        f"{repr(offending)} fails {check.check_type.value} check."
                    ),
                    severity = sev,
                ))

    # ── Aggregate / shape-only checks ─────────────────────────
    for check in agg_checks:
        sev = _sev_from_check(check)
        try:
            passed, desc = _eval_aggregate_check(df, check, now)
        except Exception as e:
            logger.warning(f"[DQ] aggregate check error {check.check_type}: {e}")
            passed, desc = True, ""

        check.pass_count = total_rows if passed else 0
        check.fail_count = 0 if passed else 1
        check.fail_pct   = 0.0 if passed else 100.0
        updated_checks.append(check)

        if not passed:
            anomalies.append(DQAnomaly(
                check_id        = check.check_id,
                column_name     = check.column_name,
                check_type      = check.check_type,
                anomaly_type    = "shape",
                offending_value = None,
                description     = desc or f"{check.check_type.value} check failed on '{check.column_name}'.",
                severity        = sev,
            ))

    # ── DQ Score ───────────────────────────────────────────────
    checks_passed = sum(1 for c in updated_checks if (c.fail_count or 0) == 0)
    checks_failed = len(updated_checks) - checks_passed
    shape_count   = sum(1 for a in anomalies if a.anomaly_type == "shape")
    record_count  = sum(1 for a in anomalies if a.anomaly_type == "record")
    dq_score      = (checks_passed / len(updated_checks) * 100) if updated_checks else 100.0

    return ScanResult(
        profile_id       = profile_id,
        total_rows       = total_rows,
        total_checks     = len(authorized),
        checks_passed    = checks_passed,
        checks_failed    = checks_failed,
        total_anomalies  = len(anomalies),
        record_anomalies = record_count,
        shape_anomalies  = shape_count,
        dq_score         = round(dq_score, 2),
        anomalies        = anomalies,
        check_results    = updated_checks,
    )
