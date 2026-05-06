"""
Lens DQ Engine — Scanner
=========================
Executes authorized DQ checks against the full dataset using
chunked, vectorized Pandas operations. No row-by-row loops.
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import numpy as np

from backend.dq.models import (
    DQCheck, DQCheckType, DQCheckStatus,
    DQAnomaly, ScanResult,
)

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 100_000
_MAX_RECORD_ANOMALIES = 50


def _severity(fail_pct: float) -> str:
    if fail_pct >= 0.20:
        return "high"
    if fail_pct >= 0.05:
        return "medium"
    return "low"


def _coerce_numeric(series: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(series):
        return series
    return pd.to_numeric(series, errors="coerce")


def _coerce_datetime(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    return pd.to_datetime(series, errors="coerce", utc=False)


def _build_fail_mask(series: pd.Series, check: DQCheck, now: pd.Timestamp) -> pd.Series:
    p = check.parameters
    ct = check.check_type

    if ct == DQCheckType.not_null:
        return series.isna() | (series.astype(str).str.strip() == "")

    if ct == DQCheckType.min_max_range:
        num = _coerce_numeric(series)
        return num.notna() & ((num < p["min"]) | (num > p["max"]))

    if ct == DQCheckType.iqr_outlier:
        num = _coerce_numeric(series)
        return num.notna() & ((num < p["lower_bound"]) | (num > p["upper_bound"]))

    if ct == DQCheckType.z_score_outlier:
        num = _coerce_numeric(series)
        return num.notna() & ((num < p["lower_bound"]) | (num > p["upper_bound"]))

    if ct == DQCheckType.distribution_fit:
        num = _coerce_numeric(series)
        return num.notna() & ((num < p["lower_bound"]) | (num > p["upper_bound"]))

    if ct == DQCheckType.non_negative:
        num = _coerce_numeric(series)
        return num.notna() & (num < 0)

    if ct == DQCheckType.categorical_set:
        allowed = set(str(v) for v in p.get("allowed_values", []))
        non_null = series.notna()
        return non_null & ~series.astype(str).isin(allowed)

    if ct == DQCheckType.string_length:
        non_null = series.notna()
        lengths = series.astype(str).str.len()
        return non_null & ((lengths < p["min_length"]) | (lengths > p["max_length"]))

    if ct == DQCheckType.pattern_match:
        pattern = p.get("pattern", "")
        non_null = series.notna()
        return non_null & ~series.astype(str).str.match(pattern, na=False)

    if ct == DQCheckType.uniqueness:
        return series.duplicated(keep=False)

    if ct == DQCheckType.no_future_date:
        dt = _coerce_datetime(series)
        if dt.dt.tz is not None:
            dt = dt.dt.tz_localize(None)
        return dt.notna() & (dt > now)

    if ct == DQCheckType.date_range:
        dt = _coerce_datetime(series)
        if dt.dt.tz is not None:
            dt = dt.dt.tz_localize(None)
        min_dt = pd.Timestamp(p["min_date"])
        max_dt = pd.Timestamp(p["max_date"])
        return dt.notna() & ((dt < min_dt) | (dt > max_dt))

    return pd.Series(False, index=series.index)


def run_scan(file_path: str | Path, checks: list[DQCheck], profile_id: str) -> ScanResult:
    path = Path(file_path)
    authorized = [c for c in checks if c.status == DQCheckStatus.authorized]

    now = pd.Timestamp.utcnow().tz_localize(None)

    # Per-check accumulators: {check_id: {"fails": [...(row_idx, offending_val, row_dict)], "total": int, "fail_count": int}}
    acc: dict[str, dict[str, Any]] = {
        c.check_id: {"fail_rows": [], "total": 0, "fail_count": 0}
        for c in authorized
    }

    chunk_offset = 0
    total_rows = 0

    suffix = path.suffix.lower()
    if suffix == ".csv":
        reader = pd.read_csv(path, chunksize=_CHUNK_SIZE)
    elif suffix in (".xlsx", ".xls"):
        # Excel doesn't support chunking; load fully and fake chunks
        full_df = pd.read_excel(path)
        reader = (full_df.iloc[i:i + _CHUNK_SIZE] for i in range(0, len(full_df), _CHUNK_SIZE))
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    for chunk in reader:
        chunk_len = len(chunk)
        total_rows += chunk_len

        for check in authorized:
            col = check.column_name
            if col not in chunk.columns:
                acc[check.check_id]["total"] += chunk_len
                continue

            series = chunk[col]
            try:
                fail_mask = _build_fail_mask(series, check, now)
            except Exception as e:
                logger.warning(f"[DQ] mask error on {col}/{check.check_type}: {e}")
                acc[check.check_id]["total"] += chunk_len
                continue

            fail_indices = fail_mask[fail_mask].index.tolist()
            acc[check.check_id]["total"] += chunk_len
            acc[check.check_id]["fail_count"] += len(fail_indices)

            # Collect raw row data for potential record anomalies (up to limit)
            current_collected = len(acc[check.check_id]["fail_rows"])
            if current_collected < _MAX_RECORD_ANOMALIES and len(fail_indices) > 0:
                remaining = _MAX_RECORD_ANOMALIES - current_collected
                for local_idx in fail_indices[:remaining]:
                    global_idx = chunk_offset + chunk.index.get_loc(local_idx)
                    row = chunk.loc[local_idx].to_dict()
                    row_serialisable = {
                        k: (None if (isinstance(v, float) and np.isnan(v)) else
                            v.isoformat() if hasattr(v, "isoformat") else
                            str(v) if not isinstance(v, (int, float, bool, type(None))) else v)
                        for k, v in row.items()
                    }
                    offending = row_serialisable.get(col)
                    acc[check.check_id]["fail_rows"].append((global_idx, offending, row_serialisable))

        chunk_offset += chunk_len

    # ── Build anomalies and updated check results ──────────
    anomalies: list[DQAnomaly] = []
    updated_checks: list[DQCheck] = []

    for check in authorized:
        data = acc[check.check_id]
        total = data["total"]
        fail_count = data["fail_count"]
        pass_count = total - fail_count
        fail_pct = fail_count / total if total > 0 else 0.0
        sev = _severity(fail_pct)

        check.pass_count = pass_count
        check.fail_count = fail_count
        check.fail_pct = round(fail_pct * 100, 4)
        updated_checks.append(check)

        if fail_count == 0:
            continue

        if fail_pct >= 0.05:
            # Shape anomaly
            anomalies.append(DQAnomaly(
                check_id=check.check_id,
                column_name=check.column_name,
                check_type=check.check_type,
                anomaly_type="shape",
                offending_value=None,
                description=(
                    f"{fail_count:,} of {total:,} rows ({fail_pct*100:.1f}%) "
                    f"fail the {check.check_type.value} check on '{check.column_name}'."
                ),
                severity=sev,
            ))
        else:
            # Record anomalies
            for global_idx, offending_val, row_data in data["fail_rows"]:
                anomalies.append(DQAnomaly(
                    check_id=check.check_id,
                    column_name=check.column_name,
                    check_type=check.check_type,
                    anomaly_type="record",
                    row_index=global_idx,
                    row_data=row_data,
                    offending_value=offending_val,
                    description=(
                        f"Row {global_idx}: '{check.column_name}' value "
                        f"{repr(offending_val)} fails {check.check_type.value} check."
                    ),
                    severity=sev,
                ))

    checks_passed = sum(1 for c in updated_checks if (c.fail_count or 0) == 0)
    checks_failed = len(updated_checks) - checks_passed
    shape_count   = sum(1 for a in anomalies if a.anomaly_type == "shape")
    record_count  = sum(1 for a in anomalies if a.anomaly_type == "record")
    dq_score = (checks_passed / len(updated_checks) * 100) if updated_checks else 100.0

    return ScanResult(
        profile_id=profile_id,
        total_rows=total_rows,
        total_checks=len(authorized),
        checks_passed=checks_passed,
        checks_failed=checks_failed,
        total_anomalies=len(anomalies),
        record_anomalies=record_count,
        shape_anomalies=shape_count,
        dq_score=round(dq_score, 2),
        anomalies=anomalies,
        check_results=updated_checks,
    )
