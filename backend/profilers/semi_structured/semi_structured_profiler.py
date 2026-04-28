"""
Lens — Semi-Structured Profiler
================================
Handles JSON and XML files.
Flattens nested structure → profiles like structured data.
Works for single documents and batches.
"""

from __future__ import annotations
import os
import re
import uuid
import json as _json
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from collections import defaultdict

import pandas as pd
from groq import Groq
from dotenv import load_dotenv

from backend.models.profile_contract import (
    ProfileContract,
    DataModality,
    DocumentType,
    SensitivityTier,
    ExtractedFact,
    ProvenanceSpan,
    ConfidenceLevel,
)
from backend.profilers.structured.structured_profiler import (
    profile_column,
    compute_health_score,
    generate_column_definitions,
)

load_dotenv()


# ─────────────────────────────────────────────
# FLATTENING
# ─────────────────────────────────────────────

def flatten_json(obj: any, prefix: str = '', sep: str = '.') -> dict:
    """Recursively flatten a nested JSON object into dot-notation keys."""
    items = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_key = f"{prefix}{sep}{k}" if prefix else k
            items.update(flatten_json(v, new_key, sep))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            new_key = f"{prefix}{sep}{i}" if prefix else str(i)
            items.update(flatten_json(v, new_key, sep))
    else:
        items[prefix] = obj
    return items


def flatten_xml(element: ET.Element, prefix: str = '') -> dict:
    """Recursively flatten an XML element into dot-notation keys."""
    items = {}
    tag = element.tag.split('}')[-1] if '}' in element.tag else element.tag
    current_key = f"{prefix}.{tag}" if prefix else tag

    if element.text and element.text.strip():
        items[current_key] = element.text.strip()

    for attr_name, attr_val in element.attrib.items():
        items[f"{current_key}.@{attr_name}"] = attr_val

    child_counts = defaultdict(int)
    for child in element:
        child_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        child_counts[child_tag] += 1

    child_indices = defaultdict(int)
    for child in element:
        child_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if child_counts[child_tag] > 1:
            indexed_key = f"{current_key}.{child_tag}[{child_indices[child_tag]}]"
            child_indices[child_tag] += 1
        else:
            indexed_key = current_key
        items.update(flatten_xml(child, indexed_key if child_counts[child_tag] > 1 else current_key))

    return items


def load_as_dataframe(path: Path) -> tuple[pd.DataFrame, DocumentType]:
    """Load JSON or XML file into a flat DataFrame."""
    suffix = path.suffix.lower()

    if suffix == '.json':
        with open(path, 'r', encoding='utf-8') as f:
            raw = _json.load(f)

        if isinstance(raw, list):
            # Array of objects — each object becomes a row
            rows = [flatten_json(item) for item in raw]
        elif isinstance(raw, dict):
            # Single object — flatten and make one row
            rows = [flatten_json(raw)]
        else:
            rows = [{"value": raw}]

        df = pd.DataFrame(rows)
        return df, DocumentType.JSON

    elif suffix == '.xml':
        tree = ET.parse(path)
        root = tree.getroot()

        # Try to detect if root contains repeated child elements (batch)
        child_tags = [c.tag.split('}')[-1] if '}' in c.tag else c.tag for c in root]
        if len(child_tags) > 1 and len(set(child_tags)) == 1:
            # Repeated children — each is a row
            rows = [flatten_xml(child) for child in root]
        else:
            rows = [flatten_xml(root)]

        df = pd.DataFrame(rows)
        return df, DocumentType.JSON  # Use JSON type for now, XML handled same way

    else:
        raise ValueError(f"Unsupported semi-structured type: {suffix}")


# ─────────────────────────────────────────────
# SCHEMA ANALYSIS
# ─────────────────────────────────────────────

def analyse_schema(df: pd.DataFrame) -> dict:
    """Analyse the inferred schema of the flattened document."""
    total_records = len(df)
    schema = {}

    for col in df.columns:
        present = df[col].notna().sum()
        schema[col] = {
            "path":       col,
            "present":    int(present),
            "missing":    int(total_records - present),
            "coverage":   round((present / total_records) * 100, 1) if total_records > 0 else 0,
            "is_required": present == total_records,
            "inferred_type": str(df[col].dtype),
            "sample_values": [str(v) for v in df[col].dropna().head(3).tolist()],
        }

    return schema


def generate_schema_summary(schema: dict, path: Path) -> str:
    """LLM-generated summary of the schema structure."""
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        fields = [
            f"{k} (coverage: {v['coverage']}%, type: {v['inferred_type']}, sample: {v['sample_values'][:2]})"
            for k, v in list(schema.items())[:30]
        ]

        prompt = f"""You are a data architect analysing a semi-structured data file.

File: {path.name}
Fields detected ({len(schema)} total):
{chr(10).join(fields)}

Write a professional 3-4 sentence summary of:
1. What this file appears to represent
2. Its structure and key fields
3. Any notable patterns, missing data, or data quality observations
4. Recommended use cases for this data

Be concise and technical."""

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=512,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f"  [Lens] Schema summary failed: {e}")
        return ""


# ─────────────────────────────────────────────
# MAIN PROFILER
# ─────────────────────────────────────────────

def profile_semi_structured(file_path: str | Path) -> ProfileContract:
    """
    Main entry point. Takes a JSON or XML file.
    Returns a fully populated ProfileContract.
    """
    path = Path(file_path)
    print(f"  [Lens] Loading {path.suffix.upper()} file...")

    df, doc_type = load_as_dataframe(path)

    # Clean column names
    df.columns = [re.sub(r'[^\w\.]', '_', str(c)) for c in df.columns]

    # Try to infer types
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col])
        except Exception:
            try:
                df[col] = pd.to_datetime(df[col])
            except Exception:
                pass

    print(f"  [Lens] Flattened to {len(df)} rows × {len(df.columns)} columns")

    # ── Profile columns ──────────────────────
    print("  [Lens] Profiling columns...")
    columns = [profile_column(df[col]) for col in df.columns]

    # ── Generate definitions ─────────────────
    print("  [Lens] Generating field definitions...")
    definitions = generate_column_definitions(columns)
    for col in columns:
        col.business_definition = definitions.get(col.column_name)

    # ── Health score ─────────────────────────
    health, breakdown = compute_health_score(df, columns)

    # ── Schema analysis ───────────────────────
    print("  [Lens] Analysing schema...")
    schema = analyse_schema(df)

    # ── Schema summary via LLM ────────────────
    print("  [Lens] Generating schema summary...")
    schema_summary = generate_schema_summary(schema, path)

    # ── Sample rows ──────────────────────────
    def rows_to_dict(df_slice: pd.DataFrame) -> list[dict]:
        return [
            {k: (str(v) if not isinstance(v, (int, float, bool, type(None))) else v)
             for k, v in row.items()}
            for row in df_slice.to_dict('records')
        ]

    sample_head = rows_to_dict(df.head(10))
    sample_tail = rows_to_dict(df.tail(10))
    dup_mask = df.duplicated(keep=False)
    duplicate_rows = rows_to_dict(df[dup_mask].head(20)) if dup_mask.any() else []

    # ── Schema fields as ExtractedFacts ──────
    schema_facts = []
    for field_path, info in list(schema.items())[:40]:
        schema_facts.append(ExtractedFact(
            field_name=field_path,
            business_definition=definitions.get(field_path.replace('.', '_').replace('[', '_').replace(']', '')),
            value=f"{info['coverage']}% present ({info['present']}/{len(df)} records)",
            provenance=ProvenanceSpan(
                confidence_score=info['coverage'] / 100,
                confidence_level=ConfidenceLevel.HIGH if info['coverage'] > 80 else ConfidenceLevel.MEDIUM,
            ),
            sensitivity=SensitivityTier.INTERNAL,
        ))

    # ── Audit log ────────────────────────────
    audit_log = [{
        "timestamp": datetime.utcnow().isoformat(),
        "event": "profile_created",
        "detail": (
            f"Profiled {path.name} — "
            f"{len(df)} records × {len(df.columns)} fields — "
            f"semi-structured {path.suffix.upper()}"
        ),
    }]

    return ProfileContract(
        profile_id=str(uuid.uuid4()),
        filename=path.name,
        file_size_bytes=path.stat().st_size,
        modality=DataModality.SEMI_STRUCTURED,
        document_type=doc_type,
        document_type_confidence=0.95,
        row_count=len(df),
        column_count=len(df.columns),
        duplicate_row_count=int(df.duplicated().sum()),
        duplicate_rows=duplicate_rows,
        sample_head=sample_head,
        sample_tail=sample_tail,
        columns=columns,
        health_score=health,
        health_breakdown=breakdown,
        critical_business_elements=schema_facts,
        additional_findings=[],
        raw_llm_narrative=schema_summary,
        audit_log=audit_log,
        llm_used="llama-4-scout-17b",
        deterministic_only=False,
    )