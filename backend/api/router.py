"""
Lens — API Router
=================
All profiling endpoints live here.
Upload any file → get a ProfileContract back.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from pathlib import Path
import shutil
import uuid
import json

from backend.models.profile_contract import ProfileContract, DataModality
from backend.profilers.structured.structured_profiler import profile_structured
from backend.profilers.unstructured.unstructured_profiler import profile_unstructured
from backend.profilers.semi_structured.semi_structured_profiler import profile_semi_structured
from backend.core.fry14_validator import validate_against_schedule_h
from backend.agent.lensbot import ask_lensbot
from backend.dq.models import DQCheck, DQCheckStatus, DQCheckType, DQDimension, ScanResult
from backend.dq.inference_engine import infer_checks
from backend.dq.scanner import run_scan
from pydantic import BaseModel as PydanticBase

router = APIRouter(prefix="/api", tags=["profiling"])

UPLOAD_DIR   = Path("uploads")
PROFILES_DIR = Path("profiles")
UPLOAD_DIR.mkdir(exist_ok=True)
PROFILES_DIR.mkdir(exist_ok=True)

# In-memory stores — backed by PROFILES_DIR for persistence across restarts
profile_store:   dict[str, ProfileContract]   = {}
file_store:      dict[str, Path]              = {}
dq_check_store:  dict[str, list[DQCheck]]     = {}
dq_scan_store:   dict[str, ScanResult]        = {}


# ── Persistence helpers ───────────────────────────────────────

def _save_profile(pid: str) -> None:
    if pid in profile_store:
        (PROFILES_DIR / f"{pid}.json").write_text(
            profile_store[pid].model_dump_json(), encoding="utf-8"
        )

def _save_checks(pid: str) -> None:
    if pid in dq_check_store:
        (PROFILES_DIR / f"{pid}_checks.json").write_text(
            json.dumps([c.model_dump(mode="json") for c in dq_check_store[pid]]),
            encoding="utf-8",
        )

def _save_scan(pid: str) -> None:
    if pid in dq_scan_store:
        (PROFILES_DIR / f"{pid}_scan.json").write_text(
            dq_scan_store[pid].model_dump_json(), encoding="utf-8"
        )

def _load_all() -> None:
    """Reload persisted data from disk on server startup."""
    for f in PROFILES_DIR.glob("*.json"):
        stem = f.stem
        if stem.endswith("_checks") or stem.endswith("_scan"):
            continue
        pid = stem
        try:
            profile_store[pid] = ProfileContract.model_validate_json(f.read_text(encoding="utf-8"))
            for suffix in STRUCTURED_EXTENSIONS | SEMI_STRUCTURED_EXTENSIONS | UNSTRUCTURED_EXTENSIONS:
                candidate = UPLOAD_DIR / f"{pid}{suffix}"
                if candidate.exists():
                    file_store[pid] = candidate
                    break
        except Exception:
            pass

    for f in PROFILES_DIR.glob("*_checks.json"):
        pid = f.stem[:-7]
        try:
            raw = json.loads(f.read_text(encoding="utf-8"))
            dq_check_store[pid] = [DQCheck.model_validate(c) for c in raw]
        except Exception:
            pass

    for f in PROFILES_DIR.glob("*_scan.json"):
        pid = f.stem[:-5]
        try:
            dq_scan_store[pid] = ScanResult.model_validate_json(f.read_text(encoding="utf-8"))
        except Exception:
            pass

# Supported file types
STRUCTURED_EXTENSIONS   = {".csv", ".xlsx", ".xls"}
UNSTRUCTURED_EXTENSIONS = {".pdf", ".docx"}
SEMI_STRUCTURED_EXTENSIONS = {".json", ".xml"}

ALL_SUPPORTED = (
    STRUCTURED_EXTENSIONS |
    UNSTRUCTURED_EXTENSIONS |
    SEMI_STRUCTURED_EXTENSIONS
)

_load_all()


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
            # Persist file so DQ engine can read it later
            persistent_path = UPLOAD_DIR / f"{contract.profile_id}{suffix}"
            shutil.copy2(temp_path, persistent_path)
            file_store[contract.profile_id] = persistent_path

        elif modality == "unstructured":
            contract = profile_unstructured(temp_path)
            contract.filename = file.filename

        elif modality == "semi_structured":
            contract = profile_semi_structured(temp_path)
            contract.filename = file.filename

        else:
            raise HTTPException(status_code=400, detail="Unknown file type.")

        # Store in memory and persist to disk
        profile_store[contract.profile_id] = contract
        _save_profile(contract.profile_id)

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

# ── Per-page summary (on-demand, single page via LLM) ─────

class PageSummaryRequest(PydanticBase):
    page: int   # 1-indexed

@router.post("/profiles/{profile_id}/page-summary")
def get_single_page_summary(profile_id: str, req: PageSummaryRequest):
    """
    Generate an LLM summary for a single page on demand.
    Uses stored page_texts so the original PDF is not needed.
    """
    import os
    from groq import Groq

    if profile_id not in profile_store:
        raise HTTPException(404, f"Profile '{profile_id}' not found.")

    contract = profile_store[profile_id]

    if contract.modality != DataModality.UNSTRUCTURED:
        raise HTTPException(400, "Page summaries only available for unstructured documents.")

    page_idx = req.page - 1
    if not contract.page_texts or page_idx < 0 or page_idx >= len(contract.page_texts):
        raise HTTPException(404, f"Page {req.page} text not available — re-upload the file.")

    page_text = contract.page_texts[page_idx].strip()
    if not page_text:
        return {
            "page":     req.page,
            "summary":  "This page appears to contain no extractable text (possibly a scanned image or blank page).",
            "key_entities": [],
        }

    import re as _re, json as _json

    def _extract_json(text: str) -> dict:
        """
        Robustly extract a JSON object from LLM output.
        Handles markdown fences, surrounding prose, and partial wrapping.
        """
        text = text.strip()

        # 1. Strip any ``` fences
        text = _re.sub(r"^```(?:json)?\s*", "", text)
        text = _re.sub(r"\s*```$", "", text)
        text = text.strip()

        # 2. Try direct parse first
        try:
            return _json.loads(text)
        except _json.JSONDecodeError:
            pass

        # 3. Find the first { … } block in the response (handles prose around JSON)
        match = _re.search(r"\{[\s\S]*\}", text)
        if match:
            try:
                return _json.loads(match.group())
            except _json.JSONDecodeError:
                pass

        # 4. Complete fallback — return the raw text as a plain summary
        return {"summary": text if text else "No summary could be generated.", "key_entities": []}

    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))

        prompt = f"""You are a senior financial analyst reviewing a legal/financial document.

Summarise page {req.page} of the document using ONLY the text provided below.

Return ONLY a JSON object in this exact format with no other text before or after it:
{{"summary": "2-4 sentence summary of what this page covers.", "key_entities": ["entity1", "entity2"]}}

Rules:
- summary: 2-4 complete sentences describing the page content.
- key_entities: up to 6 items — names, amounts, dates, clauses, or key terms from this page.
- No markdown, no explanation, no code fences — just the raw JSON object.

Page {req.page} text:
\"\"\"
{page_text[:3500]}
\"\"\""""

        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "system",
                    "content": "You are a precise JSON-generating assistant. Always respond with only a valid JSON object — no markdown, no preamble, no explanation.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=600,
            response_format={"type": "json_object"},
        )

        raw    = response.choices[0].message.content or ""
        parsed = _extract_json(raw)

        return {
            "page":         req.page,
            "summary":      parsed.get("summary") or "Summary not available.",
            "key_entities": parsed.get("key_entities") or [],
        }

    except Exception as e:
        raise HTTPException(500, f"Page summary generation failed: {str(e)}")


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
    LensBot — vector RAG agent for answering questions about profiles.
    Anti-hallucination: only answers from profile data, never invents.
    """
    print(f"\n[CHAT] question={request.question[:60]!r} profile_id={request.profile_id[:8]}")
    if request.profile_id not in profile_store:
        print(f"[CHAT] ERROR: profile_id not found in store (store has {len(profile_store)} entries)")
        raise HTTPException(
            status_code=404,
            detail=f"Profile '{request.profile_id}' not found. Please re-upload the file."
        )

    profile = profile_store[request.profile_id]
    print(f"[CHAT] profile found: '{profile.filename}' modality={profile.modality}")

    try:
        result = ask_lensbot(
            question=request.question,
            profile=profile,
            history=request.history,
        )
        print(f"[CHAT] answer length={len(result.get('answer',''))}")
        return result
    except Exception as e:
        print(f"[CHAT] EXCEPTION: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ── FR Y-14Q Schedule H Validation ───────────────────────

@router.get("/profiles/{profile_id}/validate-fry14")
def validate_fry14(profile_id: str):
    """
    Validate extracted profile fields against FR Y-14Q Schedule H rules.
    Covers all 33 fields with fixed allowable values across H.1, H.2, H.3, H.4.
    """
    if profile_id not in profile_store:
        raise HTTPException(status_code=404, detail=f"Profile '{profile_id}' not found.")

    contract = profile_store[profile_id]

    if contract.modality != DataModality.UNSTRUCTURED:
        raise HTTPException(
            status_code=400,
            detail="FR Y-14Q validation only applies to unstructured documents."
        )

    profile_dict = contract.model_dump()
    try:
        results = validate_against_schedule_h(profile_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")

    summary = {
        "total_checked": len(results),
        "pass":          sum(1 for r in results if r.status == "pass"),
        "warn":          sum(1 for r in results if r.status == "warn"),
        "fail":          sum(1 for r in results if r.status == "fail"),
        "not_found":     sum(1 for r in results if r.status == "not_found"),
    }

    return {
        "profile_id": profile_id,
        "filename":   contract.filename,
        "summary":    summary,
        "results": [
            {
                "field_name":       r.field_name,
                "extracted_value":  r.extracted_value,
                "schedule_field":   r.schedule_field,
                "field_no":         r.field_no,
                "schedule":         r.schedule,
                "status":           r.status,
                "message":          r.message,
                "allowable_values": r.allowable_values,
                "required":         r.required,
                "confidence":       r.confidence,
            }
            for r in results
        ],
    }

# ── Word Cloud image ──────────────────────────────────────

@router.get("/profiles/{profile_id}/wordcloud/{column_name}")
def get_wordcloud(profile_id: str, column_name: str):
    """Generate a compact word cloud PNG for a text/categorical column."""
    import io, random

    if profile_id not in profile_store:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_store[profile_id]
    col = next((c for c in profile.columns if c.column_name == column_name), None)

    if not col or not col.word_frequencies:
        raise HTTPException(status_code=404, detail="No word frequency data for this column")

    try:
        import matplotlib
        matplotlib.use("Agg")
        from wordcloud import WordCloud

        word_freq = {w["word"]: w["count"] for w in col.word_frequencies}

        # Palette matching the reference image: greens, purples, blues, teals, indigo
        _palette = [
            "#1B5E20", "#2E7D32", "#388E3C", "#43A047", "#558B2F", "#689F38",
            "#4A148C", "#6A1B9A", "#7B1FA2", "#8E24AA", "#AB47BC",
            "#0D47A1", "#1565C0", "#1976D2", "#1E88E5",
            "#004D40", "#00695C", "#00796B", "#00897B", "#26A69A",
            "#1A237E", "#283593", "#303F9F", "#3949AB",
            "#33691E", "#558B2F",
        ]

        def _color_func(word, font_size, position, orientation, random_state=None, **kwargs):
            rng = random_state if random_state is not None else random.Random(hash(word))
            return rng.choice(_palette)

        wc = WordCloud(
            width=900,
            height=420,
            background_color="white",
            max_words=120,
            color_func=_color_func,
            prefer_horizontal=0.65,
            min_font_size=9,
            max_font_size=90,
            relative_scaling=0.55,
            collocations=False,
            margin=4,
        ).generate_from_frequencies(word_freq)

        buf = io.BytesIO()
        wc.to_image().save(buf, format="PNG", optimize=True)
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="wordcloud library not installed. Run: pip install wordcloud",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Word cloud generation failed: {str(e)}")


# ── DateTime distribution chart ───────────────────────────

@router.get("/profiles/{profile_id}/datetime_chart/{column_name}")
def get_datetime_chart(profile_id: str, column_name: str, bin: str = "timeline"):
    """
    Generate a DateTime analysis chart as PNG.
    bin = timeline | year | month | dow | hour
    Uses pre-aggregated distributions stored in the ColumnProfile.
    """
    import io

    if profile_id not in profile_store:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_store[profile_id]
    col = next((c for c in profile.columns if c.column_name == column_name), None)

    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    if col.var_type != "DateTime":
        raise HTTPException(status_code=400, detail="Column is not a DateTime type")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.ticker as mticker
        import numpy as np

        # ── Wells Fargo palette ─────────────────────────────
        WF_RED    = "#D71E2B"
        WF_GOLD   = "#FFCD41"
        BG        = "#FFFFFF"
        GRID_CLR  = "#E5E7EB"
        TEXT_CLR  = "#374151"
        TICK_CLR  = "#6B7280"

        fig, ax = plt.subplots(figsize=(10, 4.2), facecolor=BG)
        ax.set_facecolor(BG)
        ax.grid(axis="y", color=GRID_CLR, linewidth=0.7, zorder=0)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["left"].set_color(GRID_CLR)
        ax.spines["bottom"].set_color(GRID_CLR)
        ax.tick_params(colors=TICK_CLR, labelsize=9)

        def _bar(labels, counts, xlabel, title, color=WF_RED, rotate=0):
            x = np.arange(len(labels))
            bars = ax.bar(x, counts, color=color, width=0.65, zorder=3,
                          edgecolor="white", linewidth=0.5)
            ax.set_xticks(x)
            ax.set_xticklabels(labels, rotation=rotate, ha="right" if rotate else "center",
                               fontsize=9, color=TICK_CLR)
            ax.set_xlabel(xlabel, fontsize=10, color=TEXT_CLR, labelpad=8)
            ax.set_ylabel("Record Count", fontsize=10, color=TEXT_CLR, labelpad=8)
            ax.set_title(title, fontsize=12, fontweight="bold", color=TEXT_CLR, pad=12)
            # Value labels on bars
            for bar in bars:
                h = bar.get_height()
                if h > 0:
                    ax.text(bar.get_x() + bar.get_width() / 2, h + max(counts) * 0.01,
                            f"{int(h):,}", ha="center", va="bottom", fontsize=7.5,
                            color=TEXT_CLR, fontweight="500")
            ax.yaxis.set_major_formatter(mticker.FuncFormatter(
                lambda v, _: f"{int(v):,}" if v >= 1000 else str(int(v))))

        # ── Pick the right chart ────────────────────────────
        if bin == "year" and col.yearly_distribution:
            data  = col.yearly_distribution
            lbls  = [str(d["year"]) for d in data]
            cnts  = [d["count"]     for d in data]
            _bar(lbls, cnts, "Year", f"Record Count by Year — {column_name}",
                 rotate=45 if len(lbls) > 10 else 0)

        elif bin == "month" and col.monthly_distribution:
            data  = col.monthly_distribution
            lbls  = [d["month_name"] for d in data]
            cnts  = [d["count"]      for d in data]
            _bar(lbls, cnts, "Month", f"Record Count by Month — {column_name}", color=WF_GOLD)

        elif bin == "dow" and col.dow_distribution:
            data  = col.dow_distribution
            lbls  = [d["day_name"] for d in data]
            cnts  = [d["count"]    for d in data]
            # Weekend bars highlighted
            colors = [WF_GOLD if d["dow"] >= 5 else WF_RED for d in data]
            x = range(len(lbls))
            bars = ax.bar(x, cnts, color=colors, width=0.55, zorder=3,
                          edgecolor="white", linewidth=0.5)
            ax.set_xticks(list(x))
            ax.set_xticklabels(lbls, fontsize=10, color=TICK_CLR)
            ax.set_xlabel("Day of Week", fontsize=10, color=TEXT_CLR, labelpad=8)
            ax.set_ylabel("Record Count", fontsize=10, color=TEXT_CLR, labelpad=8)
            ax.set_title(f"Record Count by Day of Week — {column_name}",
                         fontsize=12, fontweight="bold", color=TEXT_CLR, pad=12)
            for bar in bars:
                h = bar.get_height()
                if h > 0:
                    ax.text(bar.get_x() + bar.get_width() / 2, h + max(cnts) * 0.01,
                            f"{int(h):,}", ha="center", va="bottom", fontsize=8,
                            color=TEXT_CLR, fontweight="500")
            ax.yaxis.set_major_formatter(mticker.FuncFormatter(
                lambda v, _: f"{int(v):,}" if v >= 1000 else str(int(v))))
            # Legend
            from matplotlib.patches import Patch
            ax.legend(handles=[Patch(color=WF_RED, label="Weekday"),
                                Patch(color=WF_GOLD, label="Weekend")],
                      fontsize=9, framealpha=0.8, loc="upper right")

        elif bin == "hour" and col.hour_distribution:
            data  = col.hour_distribution
            lbls  = [f"{d['hour']:02d}:00" for d in data]
            cnts  = [d["count"]            for d in data]
            _bar(lbls, cnts, "Hour of Day", f"Record Count by Hour — {column_name}",
                 color="#6366F1", rotate=45)

        else:
            # Default: timeline using yearly distribution (most universally useful)
            data = col.yearly_distribution or []
            if not data:
                data = col.monthly_distribution or []
                lbls = [d["month_name"] for d in data]
                title = f"Timeline by Month — {column_name}"
            else:
                lbls = [str(d["year"]) for d in data]
                title = f"Timeline by Year — {column_name}"
            cnts = [d["count"] for d in data]
            if lbls:
                x = range(len(lbls))
                ax.fill_between(x, cnts, alpha=0.18, color=WF_RED)
                ax.plot(x, cnts, color=WF_RED, linewidth=2.2, marker="o",
                        markersize=5, zorder=4)
                ax.set_xticks(list(x))
                ax.set_xticklabels(lbls, rotation=45 if len(lbls) > 10 else 0,
                                   ha="right" if len(lbls) > 10 else "center",
                                   fontsize=9, color=TICK_CLR)
                ax.set_xlabel("Period", fontsize=10, color=TEXT_CLR, labelpad=8)
                ax.set_ylabel("Record Count", fontsize=10, color=TEXT_CLR, labelpad=8)
                ax.set_title(title, fontsize=12, fontweight="bold",
                             color=TEXT_CLR, pad=12)
                ax.yaxis.set_major_formatter(mticker.FuncFormatter(
                    lambda v, _: f"{int(v):,}" if v >= 1000 else str(int(v))))

        plt.tight_layout(pad=1.2)
        buf = io.BytesIO()
        fig.savefig(buf, format="PNG", dpi=140, bbox_inches="tight",
                    facecolor=BG, edgecolor="none")
        plt.close(fig)
        buf.seek(0)

        return Response(
            content=buf.read(),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chart generation failed: {str(e)}")


# ── Hexbin interaction plot ───────────────────────────────

@router.get("/profiles/{profile_id}/hexbin/{col_x}/{col_y}")
def get_hexbin(profile_id: str, col_x: str, col_y: str, gridsize: int = 25):
    """Return a hexbin density PNG for two numeric columns."""
    import io
    import numpy as np

    if profile_id not in profile_store:
        raise HTTPException(404, "Profile not found")
    profile = profile_store[profile_id]

    data = profile.numeric_sample_data or {}
    if col_x not in data or col_y not in data:
        raise HTTPException(404, "Column sample data not available — re-upload the file")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        x_raw = np.array([v if v is not None else float("nan") for v in data[col_x]], dtype=float)
        y_raw = np.array([v if v is not None else float("nan") for v in data[col_y]], dtype=float)
        mask  = ~(np.isnan(x_raw) | np.isnan(y_raw))
        x, y  = x_raw[mask], y_raw[mask]

        if len(x) < 2:
            raise HTTPException(400, "Not enough data points for hexbin")

        fig, ax = plt.subplots(figsize=(9, 5.5), facecolor="#FFFFFF")
        ax.set_facecolor("#FAFAFA")
        ax.tick_params(colors="#6B7280", labelsize=9)
        for spine in ax.spines.values():
            spine.set_color("#E5E7EB")

        hb = ax.hexbin(x, y, gridsize=gridsize, cmap="Blues", mincnt=1,
                       linewidths=0.3, edgecolors="#CBD5E1")
        cb = plt.colorbar(hb, ax=ax, shrink=0.85, pad=0.02)
        cb.set_label("Count", fontsize=10, color="#374151")
        cb.ax.tick_params(labelsize=8, colors="#6B7280")

        ax.set_xlabel(col_x, fontsize=11, color="#374151", labelpad=8)
        ax.set_ylabel(col_y, fontsize=11, color="#374151", labelpad=8)
        ax.set_title(f"Density: {col_x}  ×  {col_y}", fontsize=13,
                     fontweight="bold", color="#111827", pad=12)
        ax.grid(True, linestyle="--", linewidth=0.5, alpha=0.5, color="#E5E7EB")

        plt.tight_layout(pad=1.5)
        buf = io.BytesIO()
        fig.savefig(buf, format="PNG", dpi=140, bbox_inches="tight",
                    facecolor="#FFFFFF", edgecolor="none")
        plt.close(fig)
        buf.seek(0)

        return Response(content=buf.read(), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Hexbin generation failed: {str(e)}")


# ── Pearson correlation heatmap ──────────────────────────

@router.get("/profiles/{profile_id}/correlation_heatmap")
def get_correlation_heatmap(profile_id: str):
    """Return a Pearson correlation heatmap PNG (seaborn-style)."""
    import io
    import numpy as np

    if profile_id not in profile_store:
        raise HTTPException(404, "Profile not found")
    profile = profile_store[profile_id]

    corr_dict = profile.correlation_matrix
    if not corr_dict:
        raise HTTPException(404, "Correlation matrix not available — re-upload the file")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        col_names = list(corr_dict.keys())
        n = len(col_names)

        # Build numpy matrix
        matrix = np.zeros((n, n))
        for i, ci in enumerate(col_names):
            for j, cj in enumerate(col_names):
                v = corr_dict[ci].get(cj)
                matrix[i, j] = v if v is not None else 0.0

        fig_size = max(4, min(n * 0.6, 8))
        fig, ax = plt.subplots(figsize=(fig_size, fig_size * 0.85), facecolor="#FFFFFF")

        cmap = plt.cm.RdBu_r
        im   = ax.imshow(matrix, cmap=cmap, vmin=-1, vmax=1, aspect="auto")

        # Colorbar −1.0 → 1.0
        cb = plt.colorbar(im, ax=ax, shrink=0.82, pad=0.03)
        cb.set_ticks([-1.00, -0.75, -0.50, -0.25, 0.00, 0.25, 0.50, 0.75, 1.00])
        cb.ax.tick_params(labelsize=9)

        # Annotate every cell
        for i in range(n):
            for j in range(n):
                v = matrix[i, j]
                txt_color = "white" if abs(v) > 0.55 else "black"
                ax.text(j, i, f"{v:.2f}", ha="center", va="center",
                        fontsize=9, color=txt_color, fontweight="500")

        # White grid lines between cells
        ax.set_xticks(np.arange(-0.5, n, 1), minor=True)
        ax.set_yticks(np.arange(-0.5, n, 1), minor=True)
        ax.grid(which="minor", color="white", linewidth=1.8)
        ax.tick_params(which="minor", length=0)

        ax.set_xticks(range(n))
        ax.set_yticks(range(n))
        ax.set_xticklabels(col_names, rotation=45, ha="right", fontsize=10)
        ax.set_yticklabels(col_names, fontsize=10)
        ax.set_title("Pearson Correlation Matrix", fontsize=13,
                     fontweight="bold", color="#111827", pad=14)

        plt.tight_layout(pad=1.5)
        buf = io.BytesIO()
        fig.savefig(buf, format="PNG", dpi=96, bbox_inches="tight",
                    facecolor="#FFFFFF", edgecolor="none")
        plt.close(fig)
        buf.seek(0)

        return Response(content=buf.read(), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})
    except Exception as e:
        raise HTTPException(500, f"Correlation heatmap generation failed: {str(e)}")


# ── Missing-value correlation heatmap ────────────────────

@router.get("/profiles/{profile_id}/missing_heatmap")
def get_missing_heatmap(profile_id: str):
    """Return a missing-value correlation heatmap PNG (seaborn style)."""
    import io
    import numpy as np

    if profile_id not in profile_store:
        raise HTTPException(404, "Profile not found")
    profile = profile_store[profile_id]

    miss_corr = profile.missing_correlation_matrix
    if not miss_corr:
        raise HTTPException(404, "Missing correlation matrix not available")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.colors as mcolors

        col_names = list(miss_corr.keys())
        n = len(col_names)

        matrix = np.zeros((n, n))
        for i, ci in enumerate(col_names):
            for j, cj in enumerate(col_names):
                v = miss_corr[ci].get(cj)
                matrix[i, j] = v if v is not None else 0.0

        fig_w = max(4, min(n * 0.6, 8))
        fig_h = max(3.5, min(n * 0.5, 7))
        fig, ax = plt.subplots(figsize=(fig_w, fig_h), facecolor="#FFFFFF")

        cmap = plt.cm.RdBu_r
        im   = ax.imshow(matrix, cmap=cmap, vmin=-1, vmax=1, aspect="auto")

        # Colorbar
        cb = plt.colorbar(im, ax=ax, shrink=0.85, pad=0.02)
        cb.set_ticks([-1.0, -0.75, -0.50, -0.25, 0.00, 0.25, 0.50, 0.75, 1.00])
        cb.ax.tick_params(labelsize=9)

        # Cell annotations
        for i in range(n):
            for j in range(n):
                v = matrix[i, j]
                txt_color = "white" if abs(v) > 0.55 else "black"
                ax.text(j, i, f"{v:.2f}", ha="center", va="center",
                        fontsize=9, color=txt_color, fontweight="500")

        # Grid lines between cells
        ax.set_xticks(np.arange(-0.5, n, 1), minor=True)
        ax.set_yticks(np.arange(-0.5, n, 1), minor=True)
        ax.grid(which="minor", color="white", linewidth=1.5)
        ax.tick_params(which="minor", length=0)

        ax.set_xticks(range(n))
        ax.set_yticks(range(n))
        ax.set_xticklabels(col_names, rotation=45, ha="right", fontsize=10)
        ax.set_yticklabels(col_names, fontsize=10)
        ax.set_title("Missing Value Correlation Heatmap", fontsize=13,
                     fontweight="bold", color="#111827", pad=14)

        plt.tight_layout(pad=1.5)
        buf = io.BytesIO()
        fig.savefig(buf, format="PNG", dpi=96, bbox_inches="tight",
                    facecolor="#FFFFFF", edgecolor="none")
        plt.close(fig)
        buf.seek(0)

        return Response(content=buf.read(), media_type="image/png",
                        headers={"Cache-Control": "public, max-age=3600"})
    except Exception as e:
        raise HTTPException(500, f"Missing heatmap generation failed: {str(e)}")


# ── DQ Engine ─────────────────────────────────────────────

@router.post("/profiles/{profile_id}/infer-checks")
def infer_dq_checks(profile_id: str):
    """Run the statistical inference engine to propose DQ checks."""
    if profile_id not in profile_store:
        raise HTTPException(404, f"Profile '{profile_id}' not found.")
    if profile_id not in file_store:
        raise HTTPException(404, "Source file not available. Re-upload to enable DQ checks.")
    profile = profile_store[profile_id]
    file_path = file_store[profile_id]
    try:
        checks = infer_checks(profile, file_path)
    except Exception as e:
        raise HTTPException(500, f"Inference failed: {str(e)}")
    dq_check_store[profile_id] = checks
    _save_checks(profile_id)
    return {
        "profile_id": profile_id,
        "total_checks": len(checks),
        "checks": [c.model_dump() for c in checks],
    }


@router.get("/profiles/{profile_id}/checks")
def get_dq_checks(profile_id: str):
    """Return all inferred checks for a profile."""
    if profile_id not in profile_store:
        raise HTTPException(404, f"Profile '{profile_id}' not found.")
    checks = dq_check_store.get(profile_id, [])
    return {
        "total":      len(checks),
        "pending":    sum(1 for c in checks if c.status == DQCheckStatus.pending),
        "authorized": sum(1 for c in checks if c.status == DQCheckStatus.authorized),
        "rejected":   sum(1 for c in checks if c.status == DQCheckStatus.rejected),
        "checks":     [c.model_dump() for c in checks],
    }


class CheckStatusUpdate(PydanticBase):
    status: DQCheckStatus


@router.patch("/profiles/{profile_id}/checks/{check_id}")
def update_check_status(profile_id: str, check_id: str, body: CheckStatusUpdate):
    """Update the status of a single check."""
    checks = dq_check_store.get(profile_id)
    if not checks:
        raise HTTPException(404, "No checks found for this profile.")
    for c in checks:
        if c.check_id == check_id:
            c.status = body.status
            _save_checks(profile_id)
            return c.model_dump()
    raise HTTPException(404, f"Check '{check_id}' not found.")


class BulkStatusUpdate(PydanticBase):
    status: DQCheckStatus
    check_ids: list[str] = []


@router.patch("/profiles/{profile_id}/checks")
def bulk_update_checks(profile_id: str, body: BulkStatusUpdate):
    """Bulk-update status. Empty check_ids applies to all."""
    checks = dq_check_store.get(profile_id)
    if not checks:
        raise HTTPException(404, "No checks found for this profile.")
    ids = set(body.check_ids)
    updated = 0
    for c in checks:
        if not ids or c.check_id in ids:
            c.status = body.status
            updated += 1
    _save_checks(profile_id)
    return {"updated": updated, "status": body.status}


@router.post("/profiles/{profile_id}/scan")
def scan_profile(profile_id: str):
    """Execute authorized DQ checks and detect anomalies."""
    if profile_id not in profile_store:
        raise HTTPException(404, f"Profile '{profile_id}' not found.")
    if profile_id not in file_store:
        raise HTTPException(404, "Source file not available.")
    checks = dq_check_store.get(profile_id, [])
    authorized = [c for c in checks if c.status == DQCheckStatus.authorized]
    if not authorized:
        raise HTTPException(400, "No authorized checks to scan. Authorize at least one check first.")
    try:
        result = run_scan(file_store[profile_id], checks, profile_id)
    except Exception as e:
        raise HTTPException(500, f"Scan failed: {str(e)}")
    # Write scan pass/fail counts back into the check store
    result_map = {c.check_id: c for c in result.check_results}
    for c in checks:
        if c.check_id in result_map:
            updated = result_map[c.check_id]
            c.pass_count = updated.pass_count
            c.fail_count = updated.fail_count
            c.fail_pct   = updated.fail_pct
    dq_scan_store[profile_id] = result
    _save_scan(profile_id)
    _save_checks(profile_id)   # scan merges pass/fail counts back into checks
    return result.model_dump()


@router.get("/profiles/{profile_id}/scan-result")
def get_scan_result(profile_id: str):
    """Return the latest scan result for a profile."""
    if profile_id not in dq_scan_store:
        raise HTTPException(404, "No scan result found. Run a scan first.")
    return dq_scan_store[profile_id].model_dump()


class ManualRuleRequest(PydanticBase):
    column_name: str
    check_type: DQCheckType
    dimension: DQDimension
    parameters: dict = {}
    description: str = ""


_PARAM_ALIASES: dict[str, str] = {
    "minimum": "min", "maximum": "max", "min_val": "min", "max_val": "max",
    "type": "expected_type", "dtype": "expected_type",
    "values": "allowed_values", "valid_values": "allowed_values", "choices": "allowed_values",
    "regex": "pattern", "regexp": "pattern",
    "expr": "expression", "formula": "expression", "rule": "expression", "condition": "expression",
    "column": "field", "compare_to": "field", "other_column": "field", "other": "field",
    "after_date": "after", "from": "after", "before_date": "before", "to": "before",
    "min_len": "min_length", "max_len": "max_length",
    "threshold": "threshold",
}

_PARAM_DEFAULTS: dict[str, dict] = {
    "is_type":          {"expected_type": "numeric"},
    "min_length":       {"min_length": 1},
    "max_length":       {"max_length": 255},
    "min_value":        {"min": 0},
    "max_value":        {"max": 1000},
    "greater_than":     {"threshold": 0},
    "less_than":        {"threshold": 1000000},
    "between":          {"min": 0, "max": 1000},
    "between_times":    {"after": "2000-01-01"},
    "distinct_count":   {"min": 1, "max": 100},
    "field_count":      {"min": 1, "max": 100},
    "sum":              {"min": 0, "max": 1e12},
}


def _normalize_params(ct: str, params: dict) -> dict:
    p = {_PARAM_ALIASES.get(k, k): v for k, v in params.items()}
    for k, v in _PARAM_DEFAULTS.get(ct, {}).items():
        if k not in p:
            p[k] = v
    # Clamp between_times "before" to today if future
    if ct == "between_times":
        from datetime import date as _date
        today = _date.today().isoformat()
        if "before" not in p:
            p["before"] = today
        elif str(p["before"]) > today:
            p["before"] = today
    return p


def _auto_description(ct: str, col: str, params: dict) -> str:
    label = col.replace("_", " ").title()
    descriptions = {
        "not_null":           f"{label} must not be null",
        "is_type":            f"{label} must be a valid {params.get('expected_type', 'value')}",
        "between":            f"{label} must be between {params.get('min')} and {params.get('max')}",
        "not_negative":       f"{label} must not be negative",
        "positive":           f"{label} must be positive",
        "matches_pattern":    f"{label} must match pattern {params.get('pattern', '')}",
        "expected_values":    f"{label} must be one of the allowed values",
        "not_future":         f"{label} must not be a future date",
        "between_times":      f"{label} must fall between {params.get('after', '')} and {params.get('before', '')}",
        "greater_than_field": f"{label} must be greater than {params.get('field', '')}",
        "less_than_field":    f"{label} must be less than {params.get('field', '')}",
        "equal_to_field":     f"{label} must equal {params.get('field', '')}",
        "satisfies_expression": f"{label} satisfies: {params.get('expression', '')}",
        "unique":             "No duplicate rows allowed",
        "field_count":        f"Dataset must have exactly {params.get('min', '?')} columns",
        "min_length":         f"{label} must be at least {params.get('min_length', '?')} characters",
        "max_length":         f"{label} must not exceed {params.get('max_length', '?')} characters",
        "min_value":          f"{label} must be at least {params.get('min', '?')}",
        "max_value":          f"{label} must not exceed {params.get('max', '?')}",
        "distinct_count":     f"{label} must have between {params.get('min')} and {params.get('max')} distinct values",
    }
    return descriptions.get(ct, f"{label} passes {ct.replace('_', ' ')} check")


@router.post("/profiles/{profile_id}/checks/manual-rule")
def add_manual_dq_rule(profile_id: str, body: ManualRuleRequest):
    """Add a single user-defined DQ rule. Auto-normalizes parameters and fills in defaults."""
    if profile_id not in profile_store:
        raise HTTPException(404, f"Profile '{profile_id}' not found.")
    if not body.column_name.strip():
        raise HTTPException(400, "column_name is required.")

    from backend.dq.inference_engine import _sanitize_llm_check, _CHECK_DIMENSION

    col     = body.column_name.strip()
    ct      = body.check_type.value
    profile = profile_store[profile_id]

    # Normalize parameter keys and fill in missing defaults
    params = _normalize_params(ct, body.parameters or {})

    # Apply the same sanitization used for LLM-proposed checks (clamps, drops, overrides)
    col_profile = next((c for c in profile.columns if c.column_name == col), None)
    item = _sanitize_llm_check(
        {"check_type": ct, "column_name": col, "parameters": params, "severity": "HIGH"},
        col_profile=col_profile,
    )
    if item is None:
        item = {"check_type": ct, "column_name": col, "parameters": params, "severity": "HIGH"}

    # Auto-generate description if user left it blank
    description = body.description.strip() or _auto_description(ct, col, item.get("parameters", {}))

    # Always use canonical dimension
    dim = _CHECK_DIMENSION.get(ct, body.dimension)

    check = DQCheck(
        profile_id  = profile_id,
        column_name = col,
        check_type  = body.check_type,
        dimension   = dim,
        parameters  = item.get("parameters", {}),
        description = description,
        severity    = item.get("severity", "HIGH"),
        rationale   = "User-defined rule.",
        source      = "user_defined",
    )
    existing = dq_check_store.get(profile_id, [])
    existing.append(check)
    dq_check_store[profile_id] = existing
    _save_checks(profile_id)
    return check.model_dump()


@router.post("/profiles/{profile_id}/checks/upload-rules")
async def upload_dq_rules(profile_id: str, file: UploadFile = File(...)):
    """Upload DQ rules from a JSON array or CSV file."""
    import csv as _csv
    import io as _io_mod

    if profile_id not in profile_store:
        raise HTTPException(404, f"Profile '{profile_id}' not found.")

    content = await file.read()
    fname = (file.filename or "").lower()

    try:
        if fname.endswith(".json"):
            raw_rules = json.loads(content)
            if not isinstance(raw_rules, list):
                raise ValueError("JSON must be an array of rule objects.")
        elif fname.endswith(".csv"):
            text = content.decode("utf-8", errors="replace")
            reader = _csv.DictReader(_io_mod.StringIO(text))
            raw_rules = []
            for row in reader:
                r = {k.strip(): (v or "").strip() for k, v in row.items() if k}
                if r.get("parameters"):
                    try:
                        r["parameters"] = json.loads(r["parameters"])
                    except Exception:
                        r["parameters"] = {}
                else:
                    r["parameters"] = {}
                raw_rules.append(r)
        else:
            raise HTTPException(400, "Only .json and .csv files are supported.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"File parse error: {str(e)}")

    new_checks: list[DQCheck] = []
    errors: list[str] = []
    for i, rule in enumerate(raw_rules):
        try:
            check = DQCheck(
                profile_id=profile_id,
                column_name=str(rule.get("column_name", "")).strip(),
                check_type=DQCheckType(rule.get("check_type", "")),
                dimension=DQDimension(rule.get("dimension", "")),
                parameters=rule.get("parameters") or {},
                description=str(rule.get("description", "")),
                source="user_defined",
            )
            new_checks.append(check)
        except Exception as e:
            errors.append(f"Rule {i + 1}: {str(e)}")

    existing = dq_check_store.get(profile_id, [])
    dq_check_store[profile_id] = existing + new_checks
    _save_checks(profile_id)
    return {"added": len(new_checks), "errors": errors, "checks": [c.model_dump() for c in new_checks]}


# ── DataForge ─────────────────────────────────────────────

from typing import Optional as _Optional
from backend.core.dataforge import generate_schema_from_prompt, generate_all_tables
from pydantic import BaseModel as PydanticBase

class SchemaPromptRequest(PydanticBase):
    prompt: str

class GenerateDataRequest(PydanticBase):
    tables: list[dict]
    noise_prompt: _Optional[str] = None

@router.post("/dataforge/schema")
def dataforge_schema(request: SchemaPromptRequest):
    """Generate schema from plain English description."""
    try:
        tables = generate_schema_from_prompt(request.prompt)
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/dataforge/generate")
def dataforge_generate(request: GenerateDataRequest):
    """Generate synthetic data for all tables with referential integrity. Optionally injects noise."""
    try:
        results, noise_rules = generate_all_tables(request.tables, request.noise_prompt)
        return {"tables": results, "noise_rules": noise_rules}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))