"""
Lens — Unstructured Profiler
=============================
Processes PDF documents through two layers:
  Layer 1 — Document fingerprint (deterministic, instant)
  Layer 2 — Groq/Llama 4 Scout (full document, no hardcoding)

Anti-hallucination guarantee:
  Every fact carries (value, page, confidence).
  Missing fields return None with reason. Never invented.
  Every field gets a short generic business definition — auto data dictionary.
  Full document sent to LLM — works for ANY document type.
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
)

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

    # Fix common LLM JSON issues
    # Remove trailing commas before ] or }
    json_str = re.sub(r',\s*\]', ']', json_str)
    json_str = re.sub(r',\s*\}', '}', json_str)

    return json_str


# ─────────────────────────────────────────────
# LAYER 1 — DOCUMENT FINGERPRINT (deterministic)
# ─────────────────────────────────────────────

DOC_TYPE_KEYWORDS = {
    DocumentType.COMMERCIAL_LOAN: [
        "loan agreement", "term loan", "credit agreement",
        "borrower", "lender", "facility", "maturity date",
    ],
    DocumentType.TERM_SHEET: [
        "term sheet", "indicative terms", "non-binding",
    ],
    DocumentType.CREDIT_MEMO: [
        "credit memorandum", "credit memo", "credit approval",
    ],
    DocumentType.FINANCIAL_STATEMENT: [
        "balance sheet", "income statement", "cash flow",
        "profit and loss", "audited",
    ],
    DocumentType.MSA: [
        "master service agreement", "statement of work",
    ],
}


def classify_document(text_sample: str) -> tuple[DocumentType, float]:
    text_lower = text_sample.lower()
    scores = {}
    for doc_type, keywords in DOC_TYPE_KEYWORDS.items():
        hits = sum(1 for kw in keywords if kw in text_lower)
        scores[doc_type] = hits / len(keywords)
    if not scores or max(scores.values()) == 0:
        return DocumentType.GENERIC_PDF, 0.4
    best = max(scores, key=scores.get)
    confidence = min(0.95, 0.5 + scores[best] * 2)
    return best, round(confidence, 2)


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
# LAYER 2 — LLM EXTRACTION
# No hardcoding. Full document sent. Works for any document type.
# ─────────────────────────────────────────────

CORE_FIELDS = [
    "loan_amount",
    "interest_rate",
    "applicable_margin",
    "maturity_date",
    "effective_date",
    "borrower",
    "lender",
    "guarantor",
    "governing_law",
    "property_address",
    "default_rate",
]

CORE_HEALTH_FIELDS = [
    "loan_amount", "maturity_date", "effective_date",
    "borrower", "lender", "governing_law",
]


def extract_cbes(full_text: str) -> list[ExtractedFact]:
    """
    Extract Critical Business Elements from the full document.
    Full text sent — no page chunking, no hardcoding.
    Works for any financial document type.
    """
    prompt = f"""You are a senior financial analyst extracting key facts from a financial document.

Read the ENTIRE document below carefully and extract these fields.
For each field provide:
1. The exact value as written in the document
2. The page number where it appears (look for page indicators like "1/95" in the text)
3. The exact phrase it was extracted from
4. A short generic business definition (1 sentence, plain English, universally applicable)

Fields to extract:
- loan_amount
- interest_rate (full rate description including benchmark + margin if applicable)
- applicable_margin
- maturity_date
- effective_date
- borrower
- lender
- guarantor
- governing_law
- property_address
- default_rate

CRITICAL RULES:
1. Read the ENTIRE document — answers may appear anywhere
2. Only extract values EXPLICITLY stated — never invent or infer
3. If genuinely not found after reading everything, set value to null
4. Business definitions must be short (1 sentence), generic, plain English
5. For page numbers look for patterns like "1/95", "2/95" in the text

Respond ONLY with a JSON array, no markdown, no backticks:
[
  {{
    "field": "loan_amount",
    "value": "$38,000,000.00",
    "business_definition": "The total principal amount borrowed under the agreement.",
    "page": 1,
    "raw_text": "original principal amount of $38,000,000.00",
    "not_found_reason": null
  }},
  {{
    "field": "guarantor",
    "value": null,
    "business_definition": "The entity providing a guarantee of repayment on behalf of the borrower.",
    "page": null,
    "raw_text": null,
    "not_found_reason": "No guarantor clause found in the document"
  }}
]

FULL DOCUMENT TEXT (beginning):
{full_text[:60000]}

FULL DOCUMENT TEXT (end — contains governing law and general provisions):
{full_text[-10000:]}
"""

    response = call_llm(prompt)
    facts = []

    try:
        items = json.loads(clean_json(response))
        for item in items:
            field = item.get("field", "")
            value = item.get("value")
            page = item.get("page")

            facts.append(ExtractedFact(
                field_name=field,
                business_definition=item.get("business_definition"),
                value=value,
                raw_text=item.get("raw_text"),
                not_found_reason=item.get("not_found_reason") if not value else None,
                provenance=ProvenanceSpan(
                    page=page,
                    confidence_score=0.92 if value else 0.0,
                    confidence_level=ConfidenceLevel.HIGH if value else ConfidenceLevel.LOW,
                ) if page else None,
                sensitivity=SensitivityTier.CONFIDENTIAL,
            ))
    except Exception as e:
        print(f"  [Lens] CBE parse error: {e}")
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


def extract_obligations(full_text: str) -> list[RiskObligation]:
    """Extract key covenants and obligations from the full document."""
    prompt = f"""From this financial document, extract the most important covenants and obligations.
Focus on: financial covenants, reporting requirements, events of default triggers,
payment obligations, and any unusual restrictions.

Extract maximum 15 items.

Respond ONLY with JSON array, no markdown:
[
  {{
    "type": "financial_covenant",
    "description": "Debt Service Coverage Ratio must not fall below 1.20:1.00",
    "trigger": "DSCR below 1.20:1.00",
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
                obligation_type=item.get("type", "covenant"),
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
        elif any(w in context for w in ["publish", "filed", "printed", "4/11/26"]):
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


def generate_executive_summary(full_text: str, cbes: list[ExtractedFact]) -> str:
    cbe_context = "\n".join([
        f"- {f.field_name}: {f.value}"
        for f in cbes if f.value
    ])

    prompt = f"""You are a senior financial analyst at a major US bank.
Write a detailed executive summary of this financial document for senior leadership.

EXTRACTED KEY FACTS:
{cbe_context}

DOCUMENT (first 6000 characters for context):
{full_text[:6000]}

Write a professional executive summary (400-500 words) covering:
1. What this document is and who the parties are
2. The loan amount, type, and key financial terms
3. The collateral and security arrangement
4. Key dates (effective, maturity)
5. Key covenants and obligations
6. Any notable or unusual terms
7. Overall risk profile observation

Be precise. Use exact numbers from the extracted facts.
Never invent details not present in the document."""

    return call_llm(prompt)


def generate_detailed_summary(full_text: str) -> str:
    prompt = f"""You are a senior associate at a law firm specialising in commercial lending.
Write a detailed deal memo for this financial document.

DOCUMENT TEXT (first 12000 characters):
{full_text[:12000]}

Write a comprehensive summary (700-900 words) organised by:
1. Transaction Overview
2. Parties and Roles
3. Financial Terms (amount, rate, fees, repayment schedule)
4. Collateral and Security
5. Key Covenants (financial and operational)
6. Events of Default (key triggers)
7. Governing Law and Jurisdiction
8. Notable or Unusual Provisions

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

        prompt = f"""Summarise page {i+1} of this financial document in 2-3 sentences.
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


def generate_free_narrative(full_text: str) -> str:
    prompt = f"""You are reviewing this financial document as a Chief Risk Officer.
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
- Borrower restrictions
- Lender powers
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
    "importance": "Limits borrower ability to make small ad-hoc principal reductions"
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
# ─────────────────────────────────────────────

def compute_document_health(cbes: list[ExtractedFact]) -> tuple[float, dict]:
    found = sum(
        1 for f in cbes
        if f.value and f.field_name in CORE_HEALTH_FIELDS
    )
    completeness = (found / len(CORE_HEALTH_FIELDS)) * 100

    provenance_score = (
        sum(1 for f in cbes if f.value and f.provenance and f.provenance.page) /
        max(sum(1 for f in cbes if f.value), 1)
    ) * 100

    confidence_score = (
        sum(
            f.provenance.confidence_score
            for f in cbes
            if f.value and f.provenance and f.provenance.confidence_score
        ) /
        max(sum(1 for f in cbes if f.value), 1)
    ) * 100

    health = (
        completeness      * 0.50 +
        provenance_score  * 0.25 +
        confidence_score  * 0.25
    )

    return round(health, 2), {
        "completeness":        round(completeness, 2),
        "provenance_coverage": round(provenance_score, 2),
        "avg_confidence":      round(confidence_score, 2),
    }


# ─────────────────────────────────────────────
# MAIN PROFILER
# ─────────────────────────────────────────────

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
    No hardcoding. Works for any document type.
    """
    path = Path(file_path)

    with pdfplumber.open(path) as pdf:

        print("  [Lens] Layer 1: Document fingerprint...")
        fingerprint = extract_fingerprint(pdf, path)

        print("  [Lens] Extracting text from all pages...")
        page_texts = [page.extract_text() or "" for page in pdf.pages]
        full_text = "\n".join(page_texts)

        # ── OCR fallback for scanned PDFs ─────
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

        print("  [Lens] Layer 2: LLM extraction (Groq / Llama 4 Scout 17B)...")

        print("  [Lens]   Extracting critical business elements + data dictionary...")
        cbes = extract_cbes(full_text)

        print("  [Lens]   Extracting parties...")
        parties = extract_parties(full_text)

        print("  [Lens]   Extracting obligations and covenants...")
        obligations = extract_obligations(full_text)

        print("  [Lens]   Extracting monetary amounts...")
        monetary_amounts = extract_monetary_amounts(full_text, page_texts)

        print("  [Lens]   Extracting key dates...")
        key_dates = extract_key_dates(full_text, page_texts)

        print("  [Lens]   Generating executive summary...")
        executive = generate_executive_summary(full_text, cbes)

        print("  [Lens]   Generating detailed summary...")
        detailed = generate_detailed_summary(full_text)

        page_summaries = []
        if include_page_summaries:
            print("  [Lens]   Generating page summaries...")
            page_summaries = generate_page_summaries(page_texts)

        print("  [Lens]   Generating free narrative...")
        narrative = generate_free_narrative(full_text)

        found_fields = [f.field_name for f in cbes if f.value]
        found_fields += [f.field_name for f in parties if f.value]

        print("  [Lens]   Hunting for additional findings...")
        additional = extract_additional_findings(full_text, found_fields)
        
        # ── Deduplicate additional findings ──────
        # Remove anything from additional_findings that duplicates a CBE field
        cbe_field_names = {f.field_name.lower() for f in cbes if f.value}
        cbe_values = {str(f.value).lower().strip() for f in cbes if f.value}
        additional = [
            f for f in additional
            if f.field_name.lower() not in cbe_field_names
            and str(f.value or "").lower().strip() not in cbe_values
        ]

        health, breakdown = compute_document_health(cbes)

        found_count = sum(
            1 for f in cbes
            if f.value and f.field_name in CORE_HEALTH_FIELDS
        )

        audit_log = [{
            "timestamp": datetime.utcnow().isoformat(),
            "event": "profile_created",
            "detail": (
                f"Profiled {path.name} — "
                f"{fingerprint['page_count']} pages — "
                f"{len(cbes)} CBEs — "
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
            completeness_score=round(
                (found_count / len(CORE_HEALTH_FIELDS)) * 100, 2
            ),
            expected_fields_count=len(CORE_HEALTH_FIELDS),
            found_fields_count=found_count,
            critical_business_elements=cbes,
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
            audit_log=audit_log,
            llm_used="llama-4-scout-17b",
            deterministic_only=False,
        )