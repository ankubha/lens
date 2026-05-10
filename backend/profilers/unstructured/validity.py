"""
Lens — Value Validity Checker
==============================
Type-based validation for extracted field values.
No field-name-specific logic. All validation routes through this module.
"""

from __future__ import annotations
import re

VAGUE_RESPONSES = {
    "not explicitly stated", "not mentioned", "not specified",
    "see section", "refer to", "n/a", "none", "not applicable",
    "not found", "unknown", "not provided", "not available",
}


def validate_extracted_value(value: str | None, semantic_type: str) -> bool:
    if value is None:
        return False

    s = str(value).strip()
    if not s:
        return False

    if semantic_type == "date":
        try:
            from dateutil import parser as dateutil_parser
            dateutil_parser.parse(s)
            return True
        except Exception:
            return False

    elif semantic_type in ("currency", "percentage"):
        cleaned = re.sub(r"[$,%\s]", "", s).replace(",", "")
        try:
            float(cleaned)
            return True
        except Exception:
            return False

    elif semantic_type in ("entity_name", "string"):
        s_lower = s.lower()
        return not any(vague in s_lower for vague in VAGUE_RESPONSES)

    elif semantic_type == "boolean":
        return s.lower() in ("yes", "no", "true", "false", "y", "n")

    return False
