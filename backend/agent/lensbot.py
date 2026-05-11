"""
Lens — LensBot  (Pure Numpy Semantic Vector Search)
====================================================
Architecture:
  1. Chunking   — profile split into meaningful text units.
  2. Embedding  — TF-IDF vectors projected to 384-d via stable random
                  projection (numpy only — zero extra dependencies).
  3. Vector store — in-memory numpy arrays keyed by profile_id.
                  No ChromaDB, no onnxruntime, no DLL loading.
  4. Retrieval  — brute-force cosine similarity (dot product on unit
                  vectors) finds top-K nearest chunks. Fast for < 500 chunks.
  5. Synthesis  — Groq / Llama-4 answers strictly from retrieved chunks.
"""

from __future__ import annotations
import os, json, re, math
from collections import Counter
from dotenv import load_dotenv
from groq import Groq

import numpy as np

from backend.models.profile_contract import ProfileContract

load_dotenv()
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
LLM_MODEL   = "meta-llama/llama-4-scout-17b-16e-instruct"

EMBED_DIM = 384

# ── Pure-numpy in-memory vector store ───────────────────────────────
# { profile_id: {"embs": np.ndarray(N,384), "chunks": list[dict], "vec": _Vectorizer} }
_store: dict[str, dict] = {}


# ─────────────────────────────────────────────
# VECTORIZER  — TF-IDF + Random Projection
# Pure numpy. Fit on corpus, reused for query.
# ─────────────────────────────────────────────

class _Vectorizer:
    """
    Fit on a set of documents, then transform any text to a
    384-d unit vector via TF-IDF + stable random projection.
    Uses only numpy + stdlib — no onnxruntime, no PyTorch, no ChromaDB.
    """

    def __init__(self, dim: int = EMBED_DIM):
        self._dim   = dim
        self._vocab: dict[str, int]   = {}
        self._idf:   dict[str, float] = {}
        self._proj:  np.ndarray | None = None   # (vocab_size, dim)

    @staticmethod
    def _tok(text: str) -> list[str]:
        return re.findall(r"[a-z0-9]+", text.lower())

    def fit_transform(self, texts: list[str]) -> np.ndarray:
        """Fit vocabulary on corpus; return (N, dim) unit-vector matrix."""
        N = len(texts)
        tokenized = [self._tok(t) for t in texts]

        df: Counter = Counter()
        for toks in tokenized:
            df.update(set(toks))

        self._idf = {t: math.log((N + 1) / (f + 1)) + 1 for t, f in df.items()}

        vocab_terms = sorted(self._idf, key=lambda t: -self._idf[t])
        self._vocab = {t: i for i, t in enumerate(vocab_terms)}
        V = len(self._vocab)

        rng = np.random.RandomState(42)
        self._proj = rng.randn(V, self._dim).astype(np.float32)
        col_norms  = np.linalg.norm(self._proj, axis=0, keepdims=True)
        col_norms[col_norms == 0] = 1
        self._proj /= col_norms

        return self._tfidf_and_project(tokenized, N, V)

    def transform(self, texts: list[str]) -> np.ndarray:
        """Transform new texts using the fitted vocabulary."""
        tokenized = [self._tok(t) for t in texts]
        return self._tfidf_and_project(tokenized, len(texts), len(self._vocab))

    def _tfidf_and_project(self, tokenized: list[list[str]],
                            n: int, V: int) -> np.ndarray:
        mat = np.zeros((n, V), dtype=np.float32)
        for i, toks in enumerate(tokenized):
            total = max(len(toks), 1)
            tf = Counter(toks)
            for term, cnt in tf.items():
                if term in self._vocab:
                    j = self._vocab[term]
                    mat[i, j] = (cnt / total) * self._idf.get(term, 1.0)

        proj = mat @ self._proj            # (n, dim)
        norms = np.linalg.norm(proj, axis=1, keepdims=True)
        norms[norms == 0] = 1
        return (proj / norms).astype(np.float32)


# ─────────────────────────────────────────────
# PROFILE → CHUNKS
# ─────────────────────────────────────────────

def _build_chunks(profile: dict) -> list[dict]:
    chunks: list[dict] = []
    modality = profile.get("modality", "")
    filename = profile.get("filename", "document")

    def add(text: str, section: str, **meta):
        t = (text or "").strip()
        if t:
            chunks.append({"text": t,
                            "metadata": {"section": section,
                                         "modality": str(modality), **meta}})

    # Health
    bd = profile.get("health_breakdown") or {}
    add(f"Health score: {profile.get('health_score')}/100. Breakdown: {json.dumps(bd)}", "health")

    # ── STRUCTURED ──────────────────────────────────────────
    if str(modality) in ("structured", "DataModality.STRUCTURED"):
        add(f"Dataset '{filename}': {profile.get('row_count')} rows, "
            f"{profile.get('column_count')} columns, "
            f"{profile.get('duplicate_row_count', 0)} duplicates. "
            f"Health {profile.get('health_score')}.", "overview")

        for col in profile.get("columns", []):
            p = [f"Column '{col['column_name']}' type {col.get('var_type')} ({col.get('data_type')})"]
            if col.get("business_definition"): p.append(col["business_definition"])
            if col.get("semantic_type"):       p.append(f"Semantic type: {col['semantic_type']}")
            if col.get("is_pii"):              p.append("Contains PII personal sensitive data")
            if col.get("sensitivity"):         p.append(f"Sensitivity: {col['sensitivity']}")
            mp = col.get("missing_pct") or 0
            if mp > 0: p.append(f"Missing: {mp}% ({col.get('missing_count')} nulls)")
            if col.get("mean") is not None:
                p.append(f"Mean {col['mean']} Min {col['min']} Max {col['max']} "
                         f"StdDev {col.get('std_dev')} Median {col.get('median')}")
            if col.get("unique_count"):
                p.append(f"Unique values: {col['unique_count']} ({col.get('unique_pct')}%)")
            if col.get("top_values"):
                p.append("Top values: " +
                         ", ".join(str(v.get("value")) for v in col["top_values"][:5]))
            if col.get("completeness_score") is not None:
                p.append(f"Completeness: {col['completeness_score']}%")
            add(" | ".join(p), "column", field=str(col["column_name"]))

        for alert in profile.get("drift_alerts", []):
            add(f"Drift alert column '{alert['column_name']}': "
                f"{alert['metric']} changed {alert['prior_value']} → {alert['current_value']} "
                f"delta={alert['delta']}.", "drift")

        for para in (profile.get("raw_llm_narrative") or "").split("\n\n")[:10]:
            if para.strip(): add(f"Cross-column intelligence: {para.strip()}", "intelligence")

    # ── UNSTRUCTURED ─────────────────────────────────────────
    elif str(modality) in ("unstructured", "DataModality.UNSTRUCTURED"):
        add(f"Document '{filename}' type={profile.get('document_type')} "
            f"pages={profile.get('page_count')} scanned={profile.get('is_scanned')} "
            f"tables={profile.get('has_tables')}. "
            f"CDEs {profile.get('total_cdes_found')}/{profile.get('total_cdes_expected')}. "
            f"Core CDEs {profile.get('core_cdes_found')}/{profile.get('core_cdes_expected')}.",
            "overview")

        for cde in profile.get("critical_data_elements", []):
            fname = cde.get("field_name", "unknown")
            val   = cde.get("value")
            if val:
                text = f"Field '{fname}' value: {val}."
                if cde.get("business_definition"): text += f" {cde['business_definition']}."
                if cde.get("raw_text"):            text += f' Source: "{cde["raw_text"][:200]}".'
                prov = cde.get("provenance") or {}
                if prov.get("page"):               text += f" Page {prov['page']}."
                cs = prov.get("confidence_score")
                if cs is not None:                 text += f" Confidence {int(cs*100)}%."
                if cde.get("confidence_rationale"): text += f" {cde['confidence_rationale']}"
                if cde.get("is_cde"):              text += " Critical Data Element."
                if cde.get("info_classification"): text += f" {cde['info_classification']}."
                if cde.get("pii_classification"):  text += f" PII: {cde['pii_classification']}."
            else:
                text = f"Field '{fname}' NOT FOUND."
                if cde.get("not_found_reason"):    text += f" {cde['not_found_reason']}"
            add(text, "cde", field=str(fname))

        for party in profile.get("parties", []):
            if party.get("value"):
                add(f"Party '{party['field_name']}': {party['value']}. "
                    f"{party.get('business_definition','')}", "party")

        for ob in profile.get("obligations", []):
            text = f"Obligation {ob['obligation_type']}: {ob['description']}."
            if ob.get("trigger_language"):  text += f" Trigger: {ob['trigger_language']}."
            if ob.get("party_responsible"): text += f" Party: {ob['party_responsible']}."
            add(text, "obligation")

        amounts = [f"{a['field_name']}: {a['value']}"
                   for a in profile.get("monetary_amounts", [])[:25] if a.get("value")]
        if amounts: add("Monetary amounts: " + " | ".join(amounts), "amounts")

        dates = [f"{d['field_name']}: {d['value']}"
                 for d in profile.get("key_dates", [])[:20] if d.get("value")]
        if dates: add("Key dates: " + " | ".join(dates), "dates")

        for f in profile.get("additional_findings", [])[:15]:
            if f.get("value"):
                add(f"Finding '{f['field_name']}': {f['value']}. "
                    f"{f.get('business_definition','')}", "finding")

        for para in ((profile.get("summary") or {}).get("executive", "") or "").split("\n\n")[:7]:
            if para.strip(): add(f"Executive summary: {para.strip()}", "summary")

        for para in ((profile.get("summary") or {}).get("detailed", "") or "").split("\n\n")[:10]:
            if para.strip(): add(f"Detailed summary: {para.strip()}", "detailed_summary")

        for para in (profile.get("raw_llm_narrative") or "").split("\n\n")[:6]:
            if para.strip(): add(f"Risk narrative: {para.strip()}", "narrative")

        for sf in profile.get("extraction_schema", [])[:30]:
            add(f"Schema field '{sf.get('field_name')}': {sf.get('description')} "
                f"type={sf.get('semantic_type')} is_cde={sf.get('is_cde')} "
                f"core={sf.get('is_core_field')}", "schema")

    # ── SEMI-STRUCTURED ──────────────────────────────────────
    elif str(modality) in ("semi_structured", "DataModality.SEMI_STRUCTURED"):
        add(f"File '{filename}' {profile.get('row_count')} records "
            f"{profile.get('column_count')} fields "
            f"{profile.get('duplicate_row_count', 0)} duplicates "
            f"health {profile.get('health_score')}.", "overview")

        for col in profile.get("columns", []):
            p = [f"Field '{col['column_name']}' type {col.get('var_type')}"]
            if col.get("business_definition"): p.append(col["business_definition"])
            mp = col.get("missing_pct") or 0
            if mp > 0: p.append(f"Missing {mp}%")
            if col.get("mean") is not None:
                p.append(f"Mean {col['mean']} Min {col['min']} Max {col['max']}")
            add(" | ".join(p), "field", field=str(col["column_name"]))

        for sf in profile.get("critical_data_elements", []):
            add(f"Schema '{sf['field_name']}': {sf.get('value','')}. "
                f"{sf.get('business_definition','')}", "schema")

        for alert in profile.get("drift_alerts", []):
            add(f"Drift '{alert['column_name']}' {alert['metric']} "
                f"{alert['prior_value']}→{alert['current_value']}.", "drift")

        for para in (profile.get("raw_llm_narrative") or "").split("\n\n")[:8]:
            if para.strip(): add(f"Intelligence: {para.strip()}", "intelligence")

    return chunks


# ─────────────────────────────────────────────
# INDEXING  — pure numpy, no external deps
# ─────────────────────────────────────────────

def _ensure_indexed(profile: ProfileContract) -> None:
    pid = profile.profile_id
    if pid in _store:
        return

    chunks = _build_chunks(profile.model_dump())
    if not chunks:
        print(f"  [LensBot] WARNING: 0 chunks for '{profile.filename}' — skipped")
        return

    texts = [c["text"] for c in chunks]
    vec   = _Vectorizer()
    embs  = vec.fit_transform(texts)   # (N, 384) float32, unit vectors

    _store[pid] = {"embs": embs, "chunks": chunks, "vec": vec}
    print(f"  [LensBot] Indexed {len(chunks)} chunks for '{profile.filename}' "
          f"(TF-IDF/RP {EMBED_DIM}-d, pure numpy cosine search)")


# ─────────────────────────────────────────────
# RETRIEVAL  — brute-force cosine similarity
# Unit vectors → cosine sim = dot product
# ─────────────────────────────────────────────

def _retrieve(question: str, profile_id: str,
              k: int = 10) -> list[tuple[str, dict, float]]:
    entry = _store.get(profile_id)
    if not entry:
        return []

    vec    = entry["vec"]
    embs   = entry["embs"]    # (N, 384)
    chunks = entry["chunks"]

    q_emb = vec.transform([question])[0]  # (384,) unit vector

    # cosine similarity = dot product (unit vectors)
    sims = embs @ q_emb                   # (N,) in [-1, 1]

    # Convert to cosine distance [0, 2] to match previous interface
    dists = (1.0 - sims).astype(float)

    top_k = min(k, len(chunks))
    idx   = np.argsort(dists)[:top_k]

    # Keep hits with cosine similarity > 0.1  (distance < 0.9)
    return [
        (chunks[i]["text"], chunks[i]["metadata"], float(dists[i]))
        for i in idx
        if dists[i] < 0.9
    ]


# ─────────────────────────────────────────────
# PUBLIC INTERFACE
# ─────────────────────────────────────────────

def ask_lensbot(
    question: str,
    profile: ProfileContract,
    history: list[dict] | None = None,
) -> dict:
    """
    Pure-numpy vector RAG for LensBot.
    Embeddings: TF-IDF + Random Projection (numpy only, no external deps).
    Retrieval:  brute-force cosine similarity — instant for < 500 chunks.
    Synthesis:  Groq / Llama-4, grounded in retrieved chunks only.
    """
    _ensure_indexed(profile)
    hits = _retrieve(question, profile.profile_id, k=10)

    print(f"  [LensBot] Q='{question[:60]}' → {len(hits)} hits")

    if hits:
        context = "\n\n".join(
            f"[{m.get('section','?').upper()} — Source {i+1} "
            f"({int((1 - dist/2)*100)}% match)]\n{text}"
            for i, (text, m, dist) in enumerate(hits)
        )
    else:
        context = "No relevant profile data found for this question."

    system_prompt = f"""You are LensBot, a data intelligence assistant for the Wells Fargo CDO Lens platform.
You answer questions about the specific data profile described below.

FILE: {profile.filename}
MODALITY: {profile.modality}
HEALTH SCORE: {profile.health_score}/100

RETRIEVED PROFILE CONTEXT (your ONLY source of truth):
───────────────────────────────────────────────────────
{context}
───────────────────────────────────────────────────────

ABSOLUTE RULES:
1. Answer ONLY from the retrieved context above. Never use training knowledge.
2. If the answer is NOT in the context, say exactly:
   "This information is not available in the current profile."
3. Never invent, infer, or estimate values.
4. Cite column names, field values, page numbers exactly as they appear.
5. Be concise and professional."""

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history[-6:]:
            if msg.get("role") in ("user", "assistant"):
                messages.append({"role": msg["role"], "content": msg.get("content", "")})
    messages.append({"role": "user", "content": question})

    try:
        resp = groq_client.chat.completions.create(
            model=LLM_MODEL, messages=messages, temperature=0.05, max_tokens=1024,
            timeout=30.0,
        )
        raw    = resp.choices[0].message.content
        answer = (raw or "").strip() or "No response generated."
        print(f"  [LensBot] Answer ({len(answer)} chars): {answer[:80]!r}")
    except Exception as e:
        answer = f"Error generating response: {e}"
        print(f"  [LensBot] LLM error: {e}")

    sections = sorted({m.get("section", "?") for _, m, _ in hits})
    top_sim  = int((1 - hits[0][2] / 2) * 100) if hits else 0

    return {
        "answer": answer,
        "tool_results": [{
            "tool":   "numpy_vector_search",
            "result": {
                "chunks_retrieved":  len(hits),
                "sections":          sections,
                "top_relevance_pct": top_sim,
            },
        }],
        "model": LLM_MODEL,
    }
