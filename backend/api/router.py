"""
Lens — API Router
=================
All profiling endpoints live here.
Upload any file → get a ProfileContract back.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
import uuid

from backend.models.profile_contract import ProfileContract, DataModality
from backend.profilers.structured.structured_profiler import profile_structured
from backend.profilers.unstructured.unstructured_profiler import profile_unstructured
from backend.profilers.semi_structured.semi_structured_profiler import profile_semi_structured
from backend.agent.lensbot import ask_lensbot
from pydantic import BaseModel as PydanticBase

router = APIRouter(prefix="/api", tags=["profiling"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# In-memory profile store (we'll move to Postgres later)
profile_store: dict[str, ProfileContract] = {}

# Supported file types
STRUCTURED_EXTENSIONS   = {".csv", ".xlsx", ".xls"}
UNSTRUCTURED_EXTENSIONS = {".pdf"}
SEMI_STRUCTURED_EXTENSIONS = {".json", ".xml"}

ALL_SUPPORTED = (
    STRUCTURED_EXTENSIONS |
    UNSTRUCTURED_EXTENSIONS |
    SEMI_STRUCTURED_EXTENSIONS
)


def detect_modality(suffix: str) -> str:
    if suffix in STRUCTURED_EXTENSIONS:
        return "structured"
    if suffix in UNSTRUCTURED_EXTENSIONS:
        return "unstructured"
    if suffix in SEMI_STRUCTURED_EXTENSIONS:
        return "semi_structured"
    return "unknown"


# ── Profile a file ────────────────────────────────────────

@router.post("/profile", response_model=ProfileContract)
async def profile_file(file: UploadFile = File(...)):
    """
    Upload any supported file.
    Lens auto-detects the type and returns a full ProfileContract.

    Supported:
    - Structured:     CSV, XLSX
    - Unstructured:   PDF
    - Semi-structured: coming soon
    """
    suffix = Path(file.filename).suffix.lower()

    if suffix not in ALL_SUPPORTED:
        raise HTTPException(
            status_code=400,
            detail={
                "error": f"Unsupported file type: '{suffix}'",
                "supported": sorted(ALL_SUPPORTED),
            }
        )

    # Save uploaded file temporarily
    temp_path = UPLOAD_DIR / f"{uuid.uuid4()}{suffix}"
    try:
        with temp_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        modality = detect_modality(suffix)

        if modality == "structured":
            contract = profile_structured(temp_path)
            contract.filename = file.filename

        elif modality == "unstructured":
            contract = profile_unstructured(temp_path)
            contract.filename = file.filename

        elif modality == "semi_structured":
            contract = profile_semi_structured(temp_path)
            contract.filename = file.filename

        else:
            raise HTTPException(status_code=400, detail="Unknown file type.")

        # Store in memory
        profile_store[contract.profile_id] = contract

        return contract

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Profiling failed: {str(e)}"
        )
    finally:
        temp_path.unlink(missing_ok=True)


# ── List all profiles ─────────────────────────────────────

@router.get("/profiles")
def list_profiles():
    """List all profiles generated in this session."""
    return {
        "total": len(profile_store),
        "profiles": [
            {
                "profile_id":    p.profile_id,
                "filename":      p.filename,
                "modality":      p.modality,
                "document_type": p.document_type,
                "health_score":  p.health_score,
                "created_at":    p.created_at,
            }
            for p in profile_store.values()
        ]
    }


# ── Get a specific profile ────────────────────────────────

@router.get("/profiles/{profile_id}", response_model=ProfileContract)
def get_profile(profile_id: str):
    """Retrieve a specific profile by ID."""
    if profile_id not in profile_store:
        raise HTTPException(
            status_code=404,
            detail=f"Profile '{profile_id}' not found."
        )
    return profile_store[profile_id]


# ── Page summaries (lazy loaded) ──────────────────────────

@router.get("/profiles/{profile_id}/page-summaries")
def get_page_summaries(profile_id: str):
    """
    Generate page-by-page summaries on demand.
    Lazy loaded — only called when user requests them.
    """
    if profile_id not in profile_store:
        raise HTTPException(status_code=404, detail=f"Profile '{profile_id}' not found.")

    contract = profile_store[profile_id]

    if contract.modality != DataModality.UNSTRUCTURED:
        raise HTTPException(status_code=400, detail="Page summaries only available for unstructured documents.")

    if contract.summary and contract.summary.page_summaries:
        return {"page_summaries": contract.summary.page_summaries}

    # Generate on demand using saved file path from audit log
    from backend.profilers.unstructured.unstructured_profiler import (
        generate_page_summaries
    )
    import pdfplumber
    from pathlib import Path

    # Find file in uploads folder
    uploads = Path("uploads")
    pdf_files = list(uploads.glob("*.pdf"))

    if not pdf_files:
        return {
            "page_summaries": [],
            "message": "Original file not available for page summary generation. Re-upload to enable.",
        }

    # Use most recent PDF
    latest_pdf = max(pdf_files, key=lambda p: p.stat().st_mtime)

    try:
        with pdfplumber.open(latest_pdf) as pdf:
            page_texts = [page.extract_text() or "" for page in pdf.pages]

        page_summaries = generate_page_summaries(page_texts, max_pages=min(15, len(page_texts)))

        # Cache in profile
        if contract.summary:
            contract.summary.page_summaries = page_summaries
        
        return {"page_summaries": page_summaries}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Page summary generation failed: {str(e)}")


# ── Health check ──────────────────────────────────────────

@router.get("/health")
def health():
    return {
        "status": "ok",
        "profiles_in_memory": len(profile_store),
    }

# ── LensBot chat ──────────────────────────────────────────

class ChatRequest(PydanticBase):
    question: str
    profile_id: str
    history: list[dict] = []


@router.post("/chat")
def chat(request: ChatRequest):
    """
    LensBot — LangGraph agent for answering questions about profiles.
    Anti-hallucination: only answers from profile data, never invents.
    """
    if request.profile_id not in profile_store:
        raise HTTPException(
            status_code=404,
            detail=f"Profile '{request.profile_id}' not found. Please re-upload the file."
        )

    profile = profile_store[request.profile_id]

    try:
        result = ask_lensbot(
            question=request.question,
            profile=profile,
            history=request.history,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))