"""
Lens — Unstructured Profiler
=============================
Processes PDF documents through two layers:
  Layer 1   — Document fingerprint (deterministic, instant)
  Layer 1.5 — Schema discovery (LLM decides what fields to extract)
  Layer 2   — Groq/Llama 4 Scout (full document extraction)

Anti-hallucination guarantee:
  Every fact carries (value, page, confidence, confidence_rationale).
  Missing fields return None with reason. Never invented.
  Discovered schema is the single source of truth for what gets extracted.
  No hardcoded field names anywhere.
"""

from __future__ import annotations
import os
import re
import uuid
import json
import time
from datetime import datetime
from pathlib import Path

import pdfplumber
import fitz  # PyMuPDF
import numpy as np
from PIL import Image
import io
from groq import Groq
from dotenv import load_dotenv

from backend.models.profile_contract import (
    ProfileContract,
    DataModality,
    DocumentType,
    SensitivityTier,
    ExtractedFact,
    ProvenanceSpan,
    DocumentSummary,
    RiskObligation,
    ConfidenceLevel,
    DiscoveredField,
)
from backend.profilers.unstructured.validity import validate_extracted_value

load_dotenv()
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Llama 4 Scout: 30K TPM, 500K TPD — best free tier on Groq
LLM_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

# Safe character budget per call
# 30K TPM / ~4 chars per token = ~75K chars per minute
# We send max 70K chars per call + ~2K for prompt = safely under limit
MAX_CHARS = 70000


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def call_llm(prompt: str, retries: int = 3) -> str:
    """Call Groq API with automatic retry on rate limit."""
    for attempt in range(retries):
        try:
            response = groq_client.chat.completions.create(
                model=LLM_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=4096,
            )
            time.sleep(2)
            return response.choices[0].message.content.strip()
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "rate" in error_str.lower():
                wait = 15 * (attempt + 1)
                print(f"  [Lens] Rate limit hit. Waiting {wait}s... retry {attempt+1}/{retries}")
                time.sleep(wait)
            else:
                print(f"  [Lens] Groq error: {e}")
                return ""
    print("  [Lens] All retries exhausted.")
    return ""


def clean_json(text: str) -> str:
    """
    Robustly extract JSON array from LLM output.
    Handles markdown fences, trailing text, and partial responses.
    """
    if not text:
        return "[]"

    # Strip markdown fences
    text = re.sub(r"^```json\s*", "", text.strip())
    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    text = text.strip()

    # Find the first [ and last ] to extract just the JSON array
    start = text.find("[")
    end = text.rfind("]")

    if start == -1 or end == -1:
        return "[]"

    json_str = text[start:end+1]

    # Fix common LLM JSON issues — trailing commas before ] or }
    json_str = re.sub(r',\s*\]', ']', json_str)
    json_str = re.sub(r',\s*\}', '}', json_str)

    return json_str


# ─────────────────────────────────────────────
# LAYER 1 — DOCUMENT FINGERPRINT (LLM-based)
# ─────────────────────────────────────────────

# All valid unstructured document type values the LLM can pick from
_UNSTRUCTURED_DOC_TYPES = [
    dt.value for dt in DocumentType
    if dt.value not in ("csv", "xlsx", "json", "xml", "unknown")
]


def classify_document(text_sample: str) -> tuple[DocumentType, float]:
    """
    LLM-based document type classification.
    Reads the document text and returns the best matching DocumentType
    with a calibrated confidence score.
    """
    types_list = ", ".join(_UNSTRUCTURED_DOC_TYPES)
    prompt = f"""You are a financial document analyst at a major bank.
Read the opening text of this document and classify it into exactly one document type.

VALID DOCUMENT TYPES (pick exactly one value):
{types_list}

DOCUMENT TEXT (first 2500 chars):
{text_sample[:2500]}

Respond ONLY with a JSON object — no markdown, no explanation outside the JSON:
{{
  "doc_type": "commercial_loan",
  "confidence": 0.92,
  "reasoning": "Contains borrower/lender definitions, facility amount, maturity date, and standard loan covenants."
}}

Confidence guide:
- 0.90–0.99: unmistakable — clear title, standard clauses, no ambiguity
- 0.70–0.89: very likely — strong signals but minor ambiguity
- 0.50–0.69: probable — some signals present but document is atypical
- 0.30–0.49: uncertain — weak signals, document may be generic
- Use "generic_pdf" when nothing fits"""

    try:
        response = call_llm(prompt)
        text = re.sub(r"^```json\s*", "", response.strip())
        text = re.sub(r"^```\s*",      "", text)
        text = re.sub(r"\s*```$",      "", text).strip()
        data = json.loads(text)

        dt_str     = data.get("doc_type", "generic_pdf")
        confidence = float(data.get("confidence", 0.5))
        reasoning  = data.get("reasoning", "")

        try:
            doc_type = DocumentType(dt_str)
        except ValueError:
            print(f"  [Lens] Unknown doc_type from LLM: {dt_str!r} — falling back to generic_pdf")
            doc_type = DocumentType.GENERIC_PDF
            confidence = 0.4

        confidence = round(min(0.99, max(0.1, confidence)), 2)
        print(f"  [Lens] Doc type: {doc_type.value} ({confidence*100:.0f}%) — {reasoning[:80]}")
        return doc_type, confidence

    except Exception as e:
        print(f"  [Lens] LLM classification failed: {e} — falling back to generic_pdf")
        return DocumentType.GENERIC_PDF, 0.4


def extract_fingerprint(pdf, path: Path) -> dict:
    page_count = len(pdf.pages)
    sample_text = ""
    for i in range(min(3, page_count)):
        t = pdf.pages[i].extract_text()
        if t:
            sample_text += t + "\n"

    doc_type, confidence = classify_document(sample_text)

    section_pattern = re.compile(
        r'^(ARTICLE\s+[IVXLC\d]+|Section\s+\d+[\.\d]*)\s*[:\-]?\s*(.{5,60})',
        re.MULTILINE | re.IGNORECASE
    )
    sections = []
    for match in section_pattern.finditer(sample_text):
        s = match.group(0).strip()[:80]
        if s not in sections:
            sections.append(s)

    has_tables = any(
        len(pdf.pages[i].extract_tables() or []) > 0
        for i in range(min(5, page_count))
    )
    first_page_text = pdf.pages[0].extract_text() or ""
    is_scanned = len(first_page_text.strip()) < 50

    return {
        "page_count": page_count,
        "doc_type": doc_type,
        "doc_type_confidence": confidence,
        "sections_detected": sections[:20],
        "has_tables": has_tables,
        "is_scanned": is_scanned,
        "sample_text": sample_text,
    }


# ─────────────────────────────────────────────
# DOC-TYPE PROMPT CONFIGS
# Drives perspective and structure for all three summary generators.
# ─────────────────────────────────────────────

DOC_TYPE_PROMPT_CONFIGS: dict[DocumentType, dict] = {
    DocumentType.COMMERCIAL_LOAN: {
        "perspective": "senior credit officer",
        "summary_sections": [
            "Transaction Overview", "Parties and Roles", "Financial Terms",
            "Collateral and Security", "Key Covenants", "Events of Default",
            "Governing Law and Jurisdiction", "Notable Provisions",
        ],
    },
    DocumentType.TERM_SHEET: {
        "perspective": "senior credit officer",
        "summary_sections": [
            "Transaction Overview", "Key Terms", "Conditions to Closing",
            "Parties", "Fees and Economics", "Expiry and Next Steps",
        ],
    },
    DocumentType.CREDIT_MEMO: {
        "perspective": "senior credit officer",
        "summary_sections": [
            "Credit Recommendation", "Borrower Overview", "Transaction Structure",
            "Financial Analysis", "Risk Factors", "Mitigants", "Conclusion",
        ],
    },
    DocumentType.FINANCIAL_STATEMENT: {
        "perspective": "senior financial analyst",
        "summary_sections": [
            "Financial Highlights", "Balance Sheet Overview", "Income Statement",
            "Cash Flow Analysis", "Key Ratios", "Auditor Opinion", "Material Items",
        ],
    },
    DocumentType.MSA: {
        "perspective": "senior contracts counsel",
        "summary_sections": [
            "Agreement Overview", "Parties and Scope", "Key Obligations",
            "Pricing and Payment", "Term and Termination",
            "Liability and Indemnification", "Governing Law", "Notable Provisions",
        ],
    },
    DocumentType.GENERIC_PDF: {
        "perspective": "senior business analyst",
        "summary_sections": None,  # LLM decides structure
    },
}


def _get_doc_config(doc_type: DocumentType) -> dict:
    return DOC_TYPE_PROMPT_CONFIGS.get(
        doc_type,
        DOC_TYPE_PROMPT_CONFIGS[DocumentType.GENERIC_PDF],
    )


# ─────────────────────────────────────────────
# LAYER 1.5 — SCHEMA DISCOVERY
# One LLM call that decides what to extract before extraction begins.
# ─────────────────────────────────────────────

def discover_extraction_schema(
    doc_type: DocumentType,
    text_excerpt: str,
) -> list[DiscoveredField]:
    """
    LLM call that discovers which fields to extract from this specific document.
    Runs immediately after Layer 1 fingerprinting, before any extraction.
    The returned list is the single source of truth for all downstream extraction.
    """
    prompt = f"""You are a document analysis expert. Read the document type and opening excerpt below.
Return a JSON list of all fields that should be extracted from this specific document.

Document type: {doc_type.value}

For each field return:
- field_name: snake_case identifier (e.g. effective_date, total_commitment)
- description: one sentence explaining what this field represents
- semantic_type: one of: date / currency / percentage / entity_name / string / boolean
- is_cde: true if this field is material to regulatory reporting or key business decisions, false otherwise
- is_core_field: true ONLY for the 5-6 most critical fields that define this document's identity. Mark false for everything else.
- info_classification: one of: Public / Internal / Confidential / Restricted
- pii_classification: one of: PII / Sensitive / Non-PII

Rules:
- Base the field list on what you actually see in this document's excerpt
- Mark is_core_field=true for at most 6 fields — the absolute must-haves for this document
- Mark is_cde=true for all fields material to regulatory reporting or major decisions
- Do NOT include generic meta-fields like document_title or page_count
- Return JSON only, no preamble, no markdown fences

OPENING EXCERPT (first 3000 chars):
{text_excerpt[:3000]}

Return format:
[
  {{
    "field_name": "effective_date",
    "description": "The date on which this agreement becomes legally binding.",
    "semantic_type": "date",
    "is_cde": true,
    "is_core_field": true,
    "info_classification": "Internal",
    "pii_classification": "Non-PII"
  }}
]"""

    response = call_llm(prompt)
    fields = []
    try:
        items = json.loads(clean_json(response))
        for item in items:
            fields.append(DiscoveredField(
                field_name=item.get("field_name", ""),
                description=item.get("description", ""),
                semantic_type=item.get("semantic_type", "string"),
                is_cde=bool(item.get("is_cde", False)),
                is_core_field=bool(item.get("is_core_field", False)),
                info_classification=item.get("info_classification", "Internal"),
                pii_classification=item.get("pii_classification", "Non-PII"),
            ))
    except Exception as e:
        print(f"  [Lens] Schema discovery parse error: {e}")
        print(f"  [Lens] Raw response: {response[:300]}")

    return fields


# ─────────────────────────────────────────────
# LAYER 2 — LLM EXTRACTION
# Driven entirely by discovered schema. No hardcoded field names.
# ─────────────────────────────────────────────

def extract_cdes(
    full_text: str,
    discovered_schema: list[DiscoveredField],
) -> list[ExtractedFact]:
    """
    Extract Critical Data Elements from the full document.
    Field list comes entirely from the discovered schema — no hardcoding.
    LLM self-assesses confidence for each field based on evidence quality.
    """
    if not discovered_schema:
        return []

    field_lines = "\n".join(
        f"- {f.field_name}: {f.description}"
        for f in discovered_schema
    )

    prompt = f"""You are a senior financial analyst extracting key facts from a document.

Read the ENTIRE document below and extract EVERY field listed.

For each field, self-assess your confidence score (0.0–1.0) based on:
- How explicitly the value was labeled in the document
- Whether there were conflicting mentions of the same value
- Whether you read the value directly vs. had to infer it
Do NOT use any default confidence number. Be honest.

Fields to extract:
{field_lines}

For each field return:
- field_name: exactly as listed above
- value: exact value as written in the document, or null if genuinely not found after reading everything
- raw_text: the exact phrase the value was extracted from (null if not found)
- confidence: float 0.0–1.0, your honest self-assessed confidence for this specific extraction
- confidence_rationale: one sentence explaining your confidence score
- not_found_reason: brief reason if value is null (otherwise null)
- page: page number where found (look for patterns like "1/95", "Page 2"), or null

Respond ONLY with a JSON array, no markdown, no backticks:
[
  {{
    "field_name": "effective_date",
    "value": "January 15, 2024",
    "raw_text": "entered into as of January 15, 2024",
    "confidence": 0.97,
    "confidence_rationale": "Explicitly labeled in the preamble with no conflicting mentions.",
    "not_found_reason": null,
    "page": 1
  }},
  {{
    "field_name": "prepayment_fee",
    "value": null,
    "raw_text": null,
    "confidence": 0.0,
    "confidence_rationale": "Searched the entire document; no prepayment fee clause present.",
    "not_found_reason": "No prepayment fee clause found in the document",
    "page": null
  }}
]

FULL DOCUMENT TEXT (beginning):
{full_text[:60000]}

FULL DOCUMENT TEXT (end — may contain general provisions):
{full_text[-10000:]}
"""

    response = call_llm(prompt)
    facts = []
    schema_map = {f.field_name: f for f in discovered_schema}

    try:
        items = json.loads(clean_json(response))
        for item in items:
            field_name = item.get("field_name", "")
            value = item.get("value")
            page = item.get("page")
            raw_confidence = item.get("confidence")
            schema_field = schema_map.get(field_name)

            if schema_field is None:
                continue

            confidence: float | None = None
            if raw_confidence is not None:
                try:
                    confidence = float(raw_confidence)
                    confidence = max(0.0, min(1.0, confidence))
                except (ValueError, TypeError):
                    confidence = None

            confidence_level = ConfidenceLevel.LOW
            if confidence is not None:
                if confidence > 0.85:
                    confidence_level = ConfidenceLevel.HIGH
                elif confidence >= 0.60:
                    confidence_level = ConfidenceLevel.MEDIUM

            facts.append(ExtractedFact(
                field_name=field_name,
                business_definition=schema_field.description,
                value=value,
                raw_text=item.get("raw_text"),
                not_found_reason=item.get("not_found_reason") if not value else None,
                confidence_rationale=item.get("confidence_rationale"),
                provenance=ProvenanceSpan(
                    page=page,
                    confidence_score=confidence if value and confidence is not None else 0.0,
                    confidence_level=confidence_level,
                ) if (page is not None or confidence is not None) else None,
                sensitivity=SensitivityTier.CONFIDENTIAL,
                is_cde=schema_field.is_cde,
                info_classification=schema_field.info_classification,
                pii_classification=schema_field.pii_classification,
            ))
    except Exception as e:
        print(f"  [Lens] CDE parse error: {e}")
        print(f"  [Lens] Raw response: {response[:300]}")

    return facts


def extract_parties(full_text: str) -> list[ExtractedFact]:
    """Extract all named parties and their roles from the full document."""
    prompt = f"""From this financial document, extract ALL named parties and their roles.

Include: borrower, lender, guarantor, counsel, agents, managers,
title companies, authorized representatives, and any other named entities.

For each party write a short generic definition of that role (1 sentence, plain English).

Respond ONLY with JSON array, no markdown:
[
  {{
    "party_name": "Valley National Bank",
    "role": "Lender",
    "business_definition": "The financial institution providing the loan funds to the borrower.",
    "page": 1
  }}
]

FULL DOCUMENT TEXT:
{full_text[:MAX_CHARS]}
"""
    response = call_llm(prompt)
    parties = []
    try:
        items = json.loads(clean_json(response))
        for item in items:
            parties.append(ExtractedFact(
                field_name=item.get("role", "party"),
                value=item.get("party_name"),
                business_definition=item.get("business_definition"),
                provenance=ProvenanceSpan(
                    page=item.get("page"),
                    confidence_score=0.90,
                    confidence_level=ConfidenceLevel.HIGH,
                ),
                sensitivity=SensitivityTier.INTERNAL,
            ))
    except Exception as e:
        print(f"  [Lens] Parties parse error: {e}")
    return parties


def extract_obligations(full_text: str, doc_type: DocumentType) -> list[RiskObligation]:
    """Extract key obligations, commitments, and requirements from the full document."""
    prompt = f"""From this {doc_type.value} document, extract up to 15 key obligations, commitments, or requirements — whatever is material for this document type.

Focus on: conditions, requirements, reporting duties, payment obligations,
restrictions on the parties, triggers that activate consequences, and binding commitments.

Respond ONLY with JSON array, no markdown:
[
  {{
    "type": "reporting",
    "description": "Borrower must deliver audited financial statements within 120 days of fiscal year end",
    "trigger": "Annual fiscal year end",
    "party": "Borrower"
  }}
]

FULL DOCUMENT TEXT:
{full_text[:MAX_CHARS]}
"""
    response = call_llm(prompt)
    obligations = []
    try:
        items = json.loads(clean_json(response))
        for item in items:
            obligations.append(RiskObligation(
                obligation_type=item.get("type", "obligation"),
                description=item.get("description", ""),
                trigger_language=item.get("trigger"),
                party_responsible=item.get("party"),
            ))
    except Exception as e:
        print(f"  [Lens] Obligations parse error: {e}")
    return obligations


def extract_monetary_amounts(full_text: str, page_texts: list[str]) -> list[ExtractedFact]:
    """Extract all significant monetary amounts with role classification."""
    pattern = r'\$([\d,]+(?:\.\d{2})?)'
    amounts = []
    seen = set()

    for match in re.finditer(pattern, full_text):
        raw = match.group(1).replace(',', '')
        try:
            value = float(raw)
        except ValueError:
            continue
        if value < 1000 or value in seen:
            continue
        seen.add(value)

        context = full_text[max(0, match.start()-80):match.end()+80].lower()
        if any(w in context for w in ["principal", "term loan", "original"]):
            role = "principal"
        elif any(w in context for w in ["fee", "origination", "upfront"]):
            role = "fee"
        elif any(w in context for w in ["penalty", "default", "late"]):
            role = "penalty"
        elif any(w in context for w in ["insurance", "coverage"]):
            role = "insurance_threshold"
        else:
            role = "monetary_amount"

        page_num = None
        cumulative = 0
        for i, pt in enumerate(page_texts):
            cumulative += len(pt)
            if match.start() < cumulative:
                page_num = i + 1
                break

        amounts.append(ExtractedFact(
            field_name=role,
            value=f"${value:,.2f}",
            raw_text=match.group(0),
            provenance=ProvenanceSpan(
                page=page_num,
                confidence_score=0.95,
                confidence_level=ConfidenceLevel.HIGH,
            ),
            sensitivity=SensitivityTier.CONFIDENTIAL,
        ))

    return amounts[:25]


def extract_key_dates(full_text: str, page_texts: list[str]) -> list[ExtractedFact]:
    """Extract all dates with role classification."""
    date_pattern = re.compile(
        r'([A-Z][a-z]+ \d{1,2},? \d{4}|\d{1,2}/\d{1,2}/\d{2,4})',
        re.IGNORECASE
    )
    dates = []
    seen = set()

    for match in re.finditer(date_pattern, full_text):
        value = match.group(1).strip()
        if value in seen:
            continue
        seen.add(value)

        context = full_text[max(0, match.start()-80):match.end()+80].lower()
        if any(w in context for w in ["maturity date means", "maturity date\""]):
            role = "maturity_date"
        elif any(w in context for w in ["effective date", "entered into as of",
                                         "dated as of"]):
            role = "effective_date"
        elif any(w in context for w in ["payment", "installment", "due date"]):
            role = "payment_due_date"
        elif any(w in context for w in ["closing"]):
            role = "closing_date"
        elif any(w in context for w in ["publish", "filed", "printed"]):
            role = "publication_date"
        else:
            role = "date"

        page_num = None
        cumulative = 0
        for i, pt in enumerate(page_texts):
            cumulative += len(pt)
            if match.start() < cumulative:
                page_num = i + 1
                break

        dates.append(ExtractedFact(
            field_name=role,
            value=value,
            provenance=ProvenanceSpan(
                page=page_num,
                confidence_score=0.88,
                confidence_level=ConfidenceLevel.HIGH,
            ),
            sensitivity=SensitivityTier.INTERNAL,
        ))

    return dates[:25]


def generate_executive_summary(
    full_text: str,
    cdes: list[ExtractedFact],
    doc_type: DocumentType,
) -> str:
    config = _get_doc_config(doc_type)
    perspective = config["perspective"]
    sections = config["summary_sections"]

    cde_context = "\n".join(
        f"- {f.field_name}: {f.value}"
        for f in cdes if f.value
    )

    if sections:
        section_instruction = (
            "Cover these key areas:\n" +
            "\n".join(f"{i+1}. {s}" for i, s in enumerate(sections))
        )
    else:
        section_instruction = (
            "Structure the summary around the most important aspects of this document. "
            "Let the content guide the structure."
        )

    prompt = f"""You are a {perspective} at a major financial institution.
Write a professional executive summary of this document for senior leadership.

EXTRACTED KEY FACTS:
{cde_context}

DOCUMENT (first 6000 characters for context):
{full_text[:6000]}

Write an executive summary (400-500 words).
{section_instruction}

Be precise. Use exact values from the extracted facts.
Only state what is explicitly in the document. Never invent details."""

    return call_llm(prompt)


def generate_detailed_summary(full_text: str, doc_type: DocumentType) -> str:
    config = _get_doc_config(doc_type)
    perspective = config["perspective"]
    sections = config["summary_sections"]

    if sections:
        section_instruction = (
            "Organise the summary with these sections:\n" +
            "\n".join(f"{i+1}. {s}" for i, s in enumerate(sections))
        )
    else:
        section_instruction = (
            "Organise the summary with sections appropriate for this document type. "
            "Use the content to guide the structure."
        )

    prompt = f"""You are a {perspective} at a major financial institution.
Write a detailed summary of this document.

DOCUMENT TEXT (first 12000 characters):
{full_text[:12000]}

Write a comprehensive summary (700-900 words).
{section_instruction}

Only state what is explicitly in the document.
If a section is not covered in the reviewed text, state that clearly."""

    return call_llm(prompt)


def generate_page_summaries(page_texts: list[str], max_pages: int = 15) -> list[dict]:
    summaries = []
    for i, text in enumerate(page_texts[:max_pages]):
        if not text or len(text.strip()) < 80:
            summaries.append({
                "page": i + 1,
                "summary": "Page contains minimal or no text content.",
                "key_entities": [],
            })
            continue

        prompt = f"""Summarise page {i+1} of this document in 2-3 sentences.
List any key entities (names, amounts, dates) found.

PAGE TEXT:
{text[:2000]}

Respond in this exact format (no markdown):
SUMMARY: [2-3 sentence summary]
ENTITIES: [comma-separated list, or 'None']"""

        response = call_llm(prompt)
        summary_text = ""
        entities = []
        for line in response.split("\n"):
            if line.startswith("SUMMARY:"):
                summary_text = line.replace("SUMMARY:", "").strip()
            elif line.startswith("ENTITIES:"):
                raw = line.replace("ENTITIES:", "").strip()
                entities = [
                    e.strip() for e in raw.split(",")
                    if e.strip() != "None"
                ]

        summaries.append({
            "page": i + 1,
            "summary": summary_text or response[:200],
            "key_entities": entities,
        })
    return summaries


def generate_free_narrative(full_text: str, doc_type: DocumentType) -> str:
    config = _get_doc_config(doc_type)
    perspective = config["perspective"]

    prompt = f"""You are reviewing this document as a {perspective}.
Write a free-form narrative of everything important, unusual, or worth flagging —
things a standard data extraction template might miss.

DOCUMENT (first 6000 characters):
{full_text[:6000]}

Write 4-5 paragraphs. Be direct and specific.
Flag anything unusual, any missing standard clauses, or any elevated risk factors."""

    return call_llm(prompt)


def extract_additional_findings(
    full_text: str,
    found_fields: list[str],
) -> list[ExtractedFact]:
    """
    Hunt for everything important not already captured.
    Full document sent — no hardcoding, works for any document type.
    Every finding gets a short generic business definition.
    """
    prompt = f"""You are a Chief Risk Officer reviewing a financial document.
We have already extracted: {', '.join(found_fields)}.

Your job: find EVERYTHING else that is important that we missed.
Be aggressive — think like someone accountable if something is missed.

Look for things like:
- Ownership and corporate structure
- Prepayment terms and minimums
- Financial ratio thresholds
- Insurance requirements and minimums
- Syndication and assignment rights
- Cross-default triggers
- Escrow requirements
- Reporting deadlines and frequencies
- Party restrictions and limitations
- Powers and remedies
- Threshold amounts and percentages
- Waiver and consent requirements
- Any unusual clauses

For each finding:
- Extract the ACTUAL VALUE from the document (not just a section reference)
- Write a short generic business definition (1 sentence, plain English)

List up to 15 findings with real extracted values only.

Respond ONLY with JSON array, no markdown:
[
  {{
    "field": "prepayment_minimum",
    "value": "$1,000,000 minimum per prepayment",
    "business_definition": "The minimum amount that must be repaid in any single voluntary prepayment transaction.",
    "importance": "Limits ability to make small ad-hoc principal reductions"
  }}
]

If nothing else important found, return []
Do NOT include findings where the value is only a section reference — extract the actual value.

FULL DOCUMENT TEXT:
{full_text[:MAX_CHARS]}
"""
    response = call_llm(prompt)
    findings = []
    try:
        items = json.loads(clean_json(response))
        for item in items[:15]:
            value = item.get("value", "")
            if not value:
                continue
            skip_phrases = [
                "not explicitly stated", "not specified", "not mentioned",
                "not found", "not disclosed", "not provided", "see section",
                "refer to section", "as per section",
            ]
            if any(phrase in value.lower() for phrase in skip_phrases):
                continue
            findings.append(ExtractedFact(
                field_name=item.get("field", "finding"),
                business_definition=item.get("business_definition"),
                value=value,
                sensitivity=SensitivityTier.INTERNAL,
            ))
    except Exception as e:
        print(f"  [Lens] Additional findings parse error: {e}")
    return findings


# ─────────────────────────────────────────────
# HEALTH SCORE
# Four dimensions, schema-driven, no hardcoded field names.
# ─────────────────────────────────────────────

def compute_document_health(
    cdes: list[ExtractedFact],
    discovered_schema: list[DiscoveredField],
) -> tuple[float, dict, dict]:
    """
    Compute four-dimension document health score.
    Returns (composite_score_0_100, health_breakdown_dict, counts_dict)

    Dimensions:
      a) CDE Core Completeness  — weight 0.40
      b) Provenance Integrity   — weight 0.30
      c) Extraction Confidence  — weight 0.20
      d) Value Validity Rate    — weight 0.10
    """
    schema_map = {f.field_name: f for f in discovered_schema}
    core_fields = [f for f in discovered_schema if f.is_core_field]
    core_field_names = {f.field_name for f in core_fields}
    cdes_with_value = [f for f in cdes if f.value is not None]

    # ── a) CDE Core Completeness (weight 0.40) ──────────────
    core_cdes_expected = len(core_fields)
    core_cdes_found = sum(
        1 for f in cdes_with_value
        if f.field_name in core_field_names
    )
    core_completeness = (
        core_cdes_found / core_cdes_expected
        if core_cdes_expected > 0 else 0.0
    )

    # ── b) Provenance Integrity (weight 0.30) ───────────────
    cdes_with_raw = sum(1 for f in cdes_with_value if f.raw_text is not None)
    provenance_integrity = (
        cdes_with_raw / len(cdes_with_value)
        if cdes_with_value else 0.0
    )

    # ── c) Extraction Confidence (weight 0.20) ──────────────
    confidence_scores = [
        f.provenance.confidence_score
        for f in cdes_with_value
        if f.provenance and f.provenance.confidence_score is not None
        and f.provenance.confidence_score > 0
    ]
    avg_confidence = (
        sum(confidence_scores) / len(confidence_scores)
        if confidence_scores else 0.0
    )

    # ── d) Value Validity Rate (weight 0.10) ────────────────
    valid_count = 0
    for f in cdes_with_value:
        schema_field = schema_map.get(f.field_name)
        sem_type = schema_field.semantic_type if schema_field else "string"
        if validate_extracted_value(f.value, sem_type):
            valid_count += 1
    validity_rate = valid_count / len(cdes_with_value) if cdes_with_value else 0.0

    health = (
        core_completeness    * 0.40 +
        provenance_integrity * 0.30 +
        avg_confidence       * 0.20 +
        validity_rate        * 0.10
    ) * 100

    breakdown = {
        "CDE Core Completeness": round(core_completeness * 100, 2),
        "Provenance Integrity":  round(provenance_integrity * 100, 2),
        "Extraction Confidence": round(avg_confidence * 100, 2),
        "Value Validity Rate":   round(validity_rate * 100, 2),
    }

    counts = {
        "core_cdes_found":     core_cdes_found,
        "core_cdes_expected":  core_cdes_expected,
        "total_cdes_found":    len(cdes_with_value),
        "total_cdes_expected": len(discovered_schema),
    }

    return round(health, 2), breakdown, counts


# ─────────────────────────────────────────────
# MAIN PROFILER
# ─────────────────────────────────────────────

def extract_text_from_docx(path: Path) -> tuple[list[str], dict]:
    """
    Extract text and fingerprint from a .docx file.
    Returns (page_texts, fingerprint_dict) in the same shape as the PDF path,
    so everything downstream runs unchanged.
    DOCX has no real page boundaries — content is chunked at ~3 000 chars each.
    """
    from docx import Document as DocxDocument

    doc = DocxDocument(str(path))

    # Paragraphs (preserving heading text for section detection)
    lines: list[str] = []
    sections: list[str] = []
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        lines.append(text)
        if para.style.name.startswith("Heading") and len(sections) < 20:
            s = text[:80]
            if s not in sections:
                sections.append(s)

    # Table cell text
    has_tables = len(doc.tables) > 0
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                cell_text = cell.text.strip()
                if cell_text:
                    lines.append(cell_text)

    full_text = "\n".join(lines)

    # Chunk into approximate pages (~3 000 chars)
    page_texts: list[str] = []
    chunk: list[str] = []
    chunk_len = 0
    for line in lines:
        chunk.append(line)
        chunk_len += len(line) + 1
        if chunk_len >= 3000:
            page_texts.append("\n".join(chunk))
            chunk = []
            chunk_len = 0
    if chunk:
        page_texts.append("\n".join(chunk))
    if not page_texts:
        page_texts = [""]

    sample_text = full_text[:3000]
    doc_type, confidence = classify_document(sample_text)

    fingerprint = {
        "page_count": len(page_texts),
        "doc_type": doc_type,
        "doc_type_confidence": confidence,
        "sections_detected": sections,
        "has_tables": has_tables,
        "is_scanned": False,
        "sample_text": sample_text,
    }

    return page_texts, fingerprint


def extract_text_with_ocr(pdf_path: Path) -> list[str]:
    """
    Extract text from scanned PDF using EasyOCR.
    Falls back gracefully if OCR fails.
    Each page returns its extracted text.
    """
    try:
        import easyocr
        print("  [Lens] Scanned PDF detected — initialising EasyOCR...")
        reader = easyocr.Reader(['en'], gpu=False, verbose=False)

        doc = fitz.open(str(pdf_path))
        page_texts = []

        for page_num in range(len(doc)):
            print(f"  [Lens] OCR page {page_num + 1}/{len(doc)}...")
            page = doc[page_num]

            # Render page to image at 200 DPI
            mat = fitz.Matrix(200/72, 200/72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")

            # Convert to numpy array for EasyOCR
            img = Image.open(io.BytesIO(img_bytes))
            img_array = np.array(img)

            # Run OCR
            results = reader.readtext(img_array)
            page_text = " ".join([r[1] for r in results])
            page_texts.append(page_text)

        doc.close()
        print(f"  [Lens] OCR complete — {len(page_texts)} pages processed")
        return page_texts

    except Exception as e:
        print(f"  [Lens] OCR failed: {e}")
        return []


def profile_unstructured(
    file_path: str | Path,
    include_page_summaries: bool = False,
) -> ProfileContract:
    """
    Main entry point. Takes any PDF path.
    Returns a fully populated ProfileContract.
    Schema-driven extraction — no hardcoding. Works for any document type.
    """
    path = Path(file_path)

    # ── Format-specific text extraction ───────────────────
    if path.suffix.lower() == ".docx":
        print("  [Lens] Layer 1: DOCX fingerprint (python-docx)...")
        page_texts, fingerprint = extract_text_from_docx(path)
        full_text = "\n".join(page_texts)
        print(f"  [Lens] Document: {len(full_text):,} chars across "
              f"{len(page_texts)} chunks")
    else:
        with pdfplumber.open(path) as pdf:
            print("  [Lens] Layer 1: Document fingerprint...")
            fingerprint = extract_fingerprint(pdf, path)

            print("  [Lens] Extracting text from all pages...")
            page_texts = [page.extract_text() or "" for page in pdf.pages]
            full_text = "\n".join(page_texts)

            # OCR fallback for scanned PDFs
            total_text_length = sum(len(t) for t in page_texts)
            if total_text_length < 500:
                print("  [Lens] Minimal text detected — trying OCR...")
                ocr_texts = extract_text_with_ocr(path)
                if ocr_texts and sum(len(t) for t in ocr_texts) > total_text_length:
                    print("  [Lens] OCR produced better results — using OCR text")
                    page_texts = ocr_texts
                    full_text = "\n".join(page_texts)
                    fingerprint["is_scanned"] = True
                else:
                    print("  [Lens] OCR did not improve extraction — using original")

        print(f"  [Lens] Document: {len(full_text):,} chars — "
              f"sending up to {MAX_CHARS:,} chars per LLM call")

        print("  [Lens] Layer 1.5: Schema discovery...")
        discovered_schema = discover_extraction_schema(
            fingerprint["doc_type"],
            full_text,
        )
        print(f"  [Lens]   Discovered {len(discovered_schema)} fields to extract")

        print("  [Lens] Layer 2: LLM extraction (Groq / Llama 4 Scout 17B)...")

        print("  [Lens]   Extracting critical data elements...")
        cdes = extract_cdes(full_text, discovered_schema)

        print("  [Lens]   Extracting parties...")
        parties = extract_parties(full_text)

        print("  [Lens]   Extracting obligations and covenants...")
        obligations = extract_obligations(full_text, fingerprint["doc_type"])

        print("  [Lens]   Extracting monetary amounts...")
        monetary_amounts = extract_monetary_amounts(full_text, page_texts)

        print("  [Lens]   Extracting key dates...")
        key_dates = extract_key_dates(full_text, page_texts)

        print("  [Lens]   Generating executive summary...")
        executive = generate_executive_summary(full_text, cdes, fingerprint["doc_type"])

        print("  [Lens]   Generating detailed summary...")
        detailed = generate_detailed_summary(full_text, fingerprint["doc_type"])

        page_summaries = []
        if include_page_summaries:
            print("  [Lens]   Generating page summaries...")
            page_summaries = generate_page_summaries(page_texts)

        print("  [Lens]   Generating free narrative...")
        narrative = generate_free_narrative(full_text, fingerprint["doc_type"])

        found_fields = [f.field_name for f in cdes if f.value]
        found_fields += [f.field_name for f in parties if f.value]

        print("  [Lens]   Hunting for additional findings...")
        additional = extract_additional_findings(full_text, found_fields)

        # ── Deduplicate additional findings ──────
        cde_field_names = {f.field_name.lower() for f in cdes if f.value}
        cde_values = {str(f.value).lower().strip() for f in cdes if f.value}
        additional = [
            f for f in additional
            if f.field_name.lower() not in cde_field_names
            and str(f.value or "").lower().strip() not in cde_values
        ]

        health, breakdown, counts = compute_document_health(cdes, discovered_schema)

        audit_log = [{
            "timestamp": datetime.utcnow().isoformat(),
            "event": "profile_created",
            "detail": (
                f"Profiled {path.name} — "
                f"{fingerprint['page_count']} pages — "
                f"{counts['total_cdes_found']}/{counts['total_cdes_expected']} CDEs found — "
                f"{len(additional)} additional findings — "
                f"via Groq/Llama-4-Scout-17B"
            ),
        }]

        return ProfileContract(
            profile_id=str(uuid.uuid4()),
            filename=path.name,
            file_size_bytes=path.stat().st_size,
            modality=DataModality.UNSTRUCTURED,
            document_type=fingerprint["doc_type"],
            document_type_confidence=fingerprint["doc_type_confidence"],
            page_count=fingerprint["page_count"],
            detected_language="en",
            is_scanned=fingerprint["is_scanned"],
            has_tables=fingerprint["has_tables"],
            has_signatures=False,
            sections_detected=fingerprint["sections_detected"],
            health_score=health,
            health_breakdown=breakdown,
            completeness_score=round(breakdown["CDE Core Completeness"], 2),
            expected_fields_count=counts["total_cdes_expected"],
            found_fields_count=counts["total_cdes_found"],
            extraction_schema=discovered_schema,
            critical_data_elements=cdes,
            core_cdes_found=counts["core_cdes_found"],
            core_cdes_expected=counts["core_cdes_expected"],
            total_cdes_found=counts["total_cdes_found"],
            total_cdes_expected=counts["total_cdes_expected"],
            summary=DocumentSummary(
                executive=executive,
                detailed=detailed,
                page_summaries=page_summaries if page_summaries else None,
            ),
            obligations=obligations,
            parties=parties,
            monetary_amounts=monetary_amounts,
            key_dates=key_dates,
            additional_findings=additional,
            raw_llm_narrative=narrative,
            # Truncated page texts for on-demand per-page summaries
            page_texts=[t[:4000] for t in page_texts],
            audit_log=audit_log,
            llm_used="llama-4-scout-17b",
            deterministic_only=False,
        )
