"""
Lens DQ Engine — Inference Engine
==================================
Statistically infers data quality rules via train/test splits.
LLM is used ONLY to rewrite descriptions at the very end.
"""
from __future__ import annotations
import os
import re
import json
import logging
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path
from statistics import mode as stats_mode

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

from backend.models.profile_contract import ProfileContract
from backend.dq.models import DQCheck, DQCheckType, DQCheckStatus, DQDimension

logger = logging.getLogger(__name__)

# ── Known semantic patterns ────────────────────────────────
_SEMANTIC_PATTERNS: dict[str, str] = {
    "email":        r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$",
    "iso_currency": r"^[A-Z]{3}$",
    "country_code": r"^[A-Z]{2,3}$",
}

_CHECK_THRESHOLD      = 0.90
_NON_NEG_THRESHOLD    = 0.95
_UNIQUENESS_THRESHOLD = 0.95
_CAT_MAX_DISTINCT     = 50
_DIST_SAMPLE_MAX      = 10_000
_PATTERN_SAMPLE_MAX   = 200
_PATTERN_COVERAGE_MIN = 0.80


# ── Character-class generaliser ────────────────────────────

def _generalise_char(c: str) -> str:
    if c.isdigit():
        return r"\d"
    if c.isupper():
        return "[A-Z]"
    if c.islower():
        return "[a-z]"
    if c == "-":
        return r"\-"
    if c == ".":
        return r"\."
    if c == "@":
        return "@"
    if c == " ":
        return r"\s"
    return "."


def _generalise_value(val: str) -> str:
    return "".join(_generalise_char(c) for c in val)


# ── Train pass-rate helpers ────────────────────────────────

def _non_null_mask(series: pd.Series) -> pd.Series:
    return series.notna() & (series.astype(str).str.strip() != "")


def _numeric_coerce(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _pass_rate(mask: pd.Series) -> float:
    """Fraction of True entries in boolean Series."""
    if len(mask) == 0:
        return 1.0
    return float(mask.sum()) / len(mask)


# ── Individual check inferrers ─────────────────────────────

def infer_not_null(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    null_pct_train = train.isna().mean() * 100
    if null_pct_train > 5.0:
        return None
    train_pass = _pass_rate(_non_null_mask(train))
    test_pass  = _pass_rate(_non_null_mask(test))
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.not_null,
        dimension=DQDimension.completeness,
        parameters={"null_threshold_pct": 5.0},
        description=f"{col.column_name} must not contain null or empty values.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_numeric_range(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_num = _numeric_coerce(train).dropna()
    if len(train_num) == 0:
        return None
    lo, hi = float(train_num.min()), float(train_num.max())
    test_num = _numeric_coerce(test)
    non_null = test_num.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & (test_num >= lo) & (test_num <= hi)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_num2 = _numeric_coerce(train)
    non_null_tr = train_num2.notna()
    train_pass = float((non_null_tr & (train_num2 >= lo) & (train_num2 <= hi)).sum()) / max(non_null_tr.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.min_max_range,
        dimension=DQDimension.validity,
        parameters={"min": lo, "max": hi},
        description=f"{col.column_name} values must be between {lo} and {hi}.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_iqr_outlier(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_num = _numeric_coerce(train).dropna()
    if len(train_num) < 10:
        return None
    q1, q3 = float(train_num.quantile(0.25)), float(train_num.quantile(0.75))
    iqr = q3 - q1
    if iqr == 0:
        return None
    obs_min, obs_max = float(train_num.min()), float(train_num.max())
    lo = max(q1 - 1.5 * iqr, obs_min)
    hi = min(q3 + 1.5 * iqr, obs_max)
    test_num = _numeric_coerce(test)
    non_null = test_num.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & (test_num >= lo) & (test_num <= hi)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_num2 = _numeric_coerce(train)
    non_null_tr = train_num2.notna()
    train_pass = float((non_null_tr & (train_num2 >= lo) & (train_num2 <= hi)).sum()) / max(non_null_tr.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.iqr_outlier,
        dimension=DQDimension.accuracy,
        parameters={"lower_bound": lo, "upper_bound": hi, "q1": q1, "q3": q3, "iqr": iqr},
        description=f"{col.column_name} values must be within IQR bounds [{lo:.4g}, {hi:.4g}].",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_z_score_outlier(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_num = _numeric_coerce(train).dropna()
    if len(train_num) < 10:
        return None
    mean, std = float(train_num.mean()), float(train_num.std())
    if std == 0:
        return None
    obs_min, obs_max = float(train_num.min()), float(train_num.max())
    lo = max(mean - 3 * std, obs_min)
    hi = min(mean + 3 * std, obs_max)
    test_num = _numeric_coerce(test)
    non_null = test_num.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & (test_num >= lo) & (test_num <= hi)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_num2 = _numeric_coerce(train)
    non_null_tr = train_num2.notna()
    train_pass = float((non_null_tr & (train_num2 >= lo) & (train_num2 <= hi)).sum()) / max(non_null_tr.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.z_score_outlier,
        dimension=DQDimension.accuracy,
        parameters={"lower_bound": lo, "upper_bound": hi, "mean": mean, "std": std},
        description=f"{col.column_name} values must be within 3 standard deviations of the mean.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_non_negative(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_num = _numeric_coerce(train).dropna()
    if len(train_num) == 0 or float(train_num.min()) < 0:
        return None
    test_num = _numeric_coerce(test)
    non_null = test_num.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & (test_num >= 0)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_num2 = _numeric_coerce(train)
    non_null_tr = train_num2.notna()
    train_pass = float((non_null_tr & (train_num2 >= 0)).sum()) / max(non_null_tr.sum(), 1)
    if test_pass < _NON_NEG_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.non_negative,
        dimension=DQDimension.validity,
        parameters={},
        description=f"{col.column_name} values must be non-negative.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_distribution_fit(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_num = _numeric_coerce(train).dropna()
    if len(train_num) < 30:
        return None
    sample = train_num.sample(min(_DIST_SAMPLE_MAX, len(train_num)), random_state=42).values
    best_dist, best_params, best_ks, best_p = None, None, float("inf"), 0.0
    for dist_name in ("norm", "lognorm", "expon"):
        dist = getattr(scipy_stats, dist_name)
        try:
            params = dist.fit(sample)
            ks_stat, p_val = scipy_stats.kstest(sample, dist_name, args=params)
            if p_val > 0.05 and ks_stat < best_ks:
                best_dist, best_params, best_ks, best_p = dist_name, params, ks_stat, p_val
        except Exception:
            continue
    if best_dist is None:
        return None
    dist_obj = getattr(scipy_stats, best_dist)
    lo = float(dist_obj.ppf(0.001, *best_params))
    hi = float(dist_obj.ppf(0.999, *best_params))
    # build params dict
    param_keys = ["loc", "scale"] if best_dist == "norm" else (["s", "loc", "scale"] if best_dist == "lognorm" else ["loc", "scale"])
    dist_params = dict(zip(param_keys, best_params))
    test_num = _numeric_coerce(test)
    non_null = test_num.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & (test_num >= lo) & (test_num <= hi)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_num2 = _numeric_coerce(train)
    non_null_tr = train_num2.notna()
    train_pass = float((non_null_tr & (train_num2 >= lo) & (train_num2 <= hi)).sum()) / max(non_null_tr.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.distribution_fit,
        dimension=DQDimension.accuracy,
        parameters={
            "distribution": best_dist,
            **dist_params,
            "lower_bound": lo,
            "upper_bound": hi,
            "ks_statistic": best_ks,
            "p_value": best_p,
        },
        description=f"{col.column_name} values follow a {best_dist} distribution within expected bounds.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_categorical_set(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_clean = train.dropna().astype(str)
    distinct = train_clean.nunique()
    if distinct == 0 or distinct > _CAT_MAX_DISTINCT:
        return None
    allowed = sorted(train_clean.unique().tolist())
    allowed_set = set(allowed)
    test_clean = test.astype(str)
    non_null = test.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & test_clean.isin(allowed_set)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_non_null = train.notna()
    train_pass = float((train_non_null & train.astype(str).isin(allowed_set)).sum()) / max(train_non_null.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.categorical_set,
        dimension=DQDimension.conformity,
        parameters={"allowed_values": allowed},
        description=f"{col.column_name} must be one of the {len(allowed)} known allowed values.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_string_length(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_clean = train.dropna().astype(str)
    if len(train_clean) == 0:
        return None
    lengths = train_clean.str.len()
    lo = int(lengths.quantile(0.01))
    hi = int(lengths.quantile(0.99))
    if lo == hi:
        return None
    test_clean = test.dropna().astype(str)
    non_null = test.notna()
    if non_null.sum() == 0:
        return None
    test_lengths = test.astype(str).str.len()
    pass_mask = non_null & (test_lengths >= lo) & (test_lengths <= hi)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_non_null = train.notna()
    train_lengths2 = train.astype(str).str.len()
    train_pass = float((train_non_null & (train_lengths2 >= lo) & (train_lengths2 <= hi)).sum()) / max(train_non_null.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.string_length,
        dimension=DQDimension.validity,
        parameters={"min_length": lo, "max_length": hi},
        description=f"{col.column_name} string length must be between {lo} and {hi} characters.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_uniqueness(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_clean = train.dropna()
    if len(train_clean) == 0:
        return None
    train_unique_pct = train_clean.nunique() / len(train_clean)
    if train_unique_pct < _UNIQUENESS_THRESHOLD:
        return None
    test_clean = test.dropna()
    if len(test_clean) == 0:
        return None
    test_pass = float(test_clean.nunique()) / len(test_clean)
    train_pass = train_unique_pct
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.uniqueness,
        dimension=DQDimension.uniqueness,
        parameters={"min_unique_pct": _UNIQUENESS_THRESHOLD},
        description=f"{col.column_name} values must be unique with no duplicates.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_pattern_match(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    pattern: str | None = None

    # Check known semantic types first
    if col.semantic_type in _SEMANTIC_PATTERNS:
        pattern = _SEMANTIC_PATTERNS[col.semantic_type]
    else:
        # Character-class generalisation
        samples = train.dropna().astype(str).head(_PATTERN_SAMPLE_MAX).tolist()
        if len(samples) < 10:
            return None
        generalised = [_generalise_value(v) for v in samples]
        counts = Counter(generalised)
        mode_pat, mode_count = counts.most_common(1)[0]
        coverage = mode_count / len(samples)
        if coverage < _PATTERN_COVERAGE_MIN:
            return None
        pattern = f"^{mode_pat}$"

    # Validate final pattern compiles
    try:
        re.compile(pattern)
    except re.error:
        return None

    if not (pattern.startswith("^") and pattern.endswith("$")):
        pattern = f"^{pattern.strip('^$')}$"

    test_clean = test.dropna().astype(str)
    non_null = test.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & test.astype(str).str.match(pattern, na=False)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_non_null = train.notna()
    train_pass = float((train_non_null & train.astype(str).str.match(pattern, na=False)).sum()) / max(train_non_null.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None

    train_strs = train.dropna().astype(str)
    matching = train_strs[train_strs.str.match(pattern, na=False)]
    pattern_example = matching.iloc[0] if len(matching) > 0 else None

    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.pattern_match,
        dimension=DQDimension.conformity,
        parameters={"pattern": pattern, **({"pattern_example": pattern_example} if pattern_example is not None else {})},
        description=f"{col.column_name} values must match the expected format pattern.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_date_range(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    train_dt = pd.to_datetime(train, errors="coerce").dropna()
    if len(train_dt) == 0:
        return None
    min_date = train_dt.min()
    max_date = train_dt.max() + timedelta(days=30)
    test_dt = pd.to_datetime(test, errors="coerce")
    non_null = test_dt.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & (test_dt >= min_date) & (test_dt <= max_date)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_dt2 = pd.to_datetime(train, errors="coerce")
    train_non_null = train_dt2.notna()
    train_pass = float((train_non_null & (train_dt2 >= min_date) & (train_dt2 <= max_date)).sum()) / max(train_non_null.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.date_range,
        dimension=DQDimension.validity,
        parameters={
            "min_date": min_date.isoformat(),
            "max_date": max_date.isoformat(),
        },
        description=f"{col.column_name} dates must be within the expected range.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


def infer_no_future_date(col: "ColumnProfile", train: pd.Series, test: pd.Series, profile_id: str) -> DQCheck | None:
    now = pd.Timestamp.utcnow().tz_localize(None)
    train_dt = pd.to_datetime(train, errors="coerce").dropna()
    if len(train_dt) == 0:
        return None
    if (train_dt > now).any():
        return None
    test_dt = pd.to_datetime(test, errors="coerce")
    non_null = test_dt.notna()
    if non_null.sum() == 0:
        return None
    pass_mask = non_null & (test_dt <= now)
    test_pass = float(pass_mask.sum()) / non_null.sum()
    train_dt2 = pd.to_datetime(train, errors="coerce")
    train_non_null = train_dt2.notna()
    train_pass = float((train_non_null & (train_dt2 <= now)).sum()) / max(train_non_null.sum(), 1)
    if test_pass < _CHECK_THRESHOLD:
        return None
    return DQCheck(
        profile_id=profile_id,
        column_name=col.column_name,
        check_type=DQCheckType.no_future_date,
        dimension=DQDimension.validity,
        parameters={},
        description=f"{col.column_name} dates must not be in the future.",
        confidence=test_pass,
        train_pass_rate=train_pass,
        test_pass_rate=test_pass,
        sample_size=len(test),
    )


# ── LLM description rewrite ────────────────────────────────

def _rewrite_descriptions_via_llm(checks: list[DQCheck]) -> list[DQCheck]:
    try:
        from groq import Groq
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        payload = {c.check_id: c.description for c in checks}
        prompt = (
            "You are a data steward. Rewrite the description for each check to be concise "
            "and business-friendly plain English (max 15 words). "
            "Return ONLY a JSON object mapping check_id to new description. "
            "No markdown, no backticks.\n\n"
            + json.dumps(payload)
        )
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=4096,
        )
        raw = response.choices[0].message.content.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw).strip()
        mapping: dict[str, str] = json.loads(raw)
        for check in checks:
            if check.check_id in mapping and isinstance(mapping[check.check_id], str):
                check.description = mapping[check.check_id]
    except Exception as e:
        logger.error(f"[DQ] LLM description rewrite failed: {e}")
    return checks


# ── Main entry point ───────────────────────────────────────

def infer_checks(profile: ProfileContract, file_path: str | Path) -> list[DQCheck]:
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(path)
    elif suffix in (".xlsx", ".xls"):
        df = pd.read_excel(path)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    # Parse datetime columns the same way the structured profiler does
    for col_name in df.columns:
        if "date" in col_name.lower() or "time" in col_name.lower():
            try:
                df[col_name] = pd.to_datetime(df[col_name], infer_datetime_format=True)
            except Exception:
                pass

    # Shuffle and split 80/20
    df_shuffled = df.sample(frac=1, random_state=42).reset_index(drop=True)
    split = int(len(df_shuffled) * 0.8)
    df_train = df_shuffled.iloc[:split]
    df_test  = df_shuffled.iloc[split:]

    col_map = {c.column_name: c for c in profile.columns}
    checks: list[DQCheck] = []

    for col_name in df.columns:
        col_profile = col_map.get(col_name)
        if col_profile is None:
            continue

        train_series = df_train[col_name]
        test_series  = df_test[col_name]

        # Skip columns with > 50% missing
        if train_series.isna().mean() > 0.50:
            continue

        pid = profile.profile_id
        is_numeric  = col_profile.min is not None
        is_datetime = col_profile.min_date is not None

        # ── Not-null check (all types) ─────────────
        chk = infer_not_null(col_profile, train_series, test_series, pid)
        if chk:
            checks.append(chk)

        if is_numeric:
            for fn in (infer_numeric_range, infer_iqr_outlier, infer_z_score_outlier,
                       infer_non_negative, infer_distribution_fit):
                chk = fn(col_profile, train_series, test_series, pid)
                if chk:
                    checks.append(chk)

        elif is_datetime:
            for fn in (infer_date_range, infer_no_future_date):
                chk = fn(col_profile, train_series, test_series, pid)
                if chk:
                    checks.append(chk)

        else:
            # String / Categorical
            distinct = train_series.dropna().nunique()
            if distinct <= _CAT_MAX_DISTINCT:
                chk = infer_categorical_set(col_profile, train_series, test_series, pid)
                if chk:
                    checks.append(chk)
            else:
                chk = infer_string_length(col_profile, train_series, test_series, pid)
                if chk:
                    checks.append(chk)
                chk = infer_pattern_match(col_profile, train_series, test_series, pid)
                if chk:
                    checks.append(chk)

            chk = infer_uniqueness(col_profile, train_series, test_series, pid)
            if chk:
                checks.append(chk)

    if checks:
        checks = _rewrite_descriptions_via_llm(checks)

    return checks
