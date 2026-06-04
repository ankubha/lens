# Lens — Unified Data Intelligence Platform

Lens is an enterprise-grade data intelligence platform built for the Wells Fargo Chief Data Office. It profiles, analyzes, and quality-checks any data asset — structured spreadsheets, semi-structured files, or unstructured financial documents — through a single unified interface powered by a hybrid LLM + rule-based engine.

---

## What it does

### Structured Data (CSV / XLSX)
- Deep column profiling: data types, distributions, missing values, outliers, skewness, top values, IQR bounds
- LLM-generated business definitions, CDE flags, PII/sensitivity classifications for every column
- Cross-column intelligence: primary key suggestions, functional dependencies, join recommendations
- **Data Quality Engine**: hybrid inference (LLM + deterministic rules) proposes checks across 8 dimensions — completeness, validity, numeric, string, datetime, cross-field, aggregate, dataset-level
- Scan execution: runs all authorized checks against the dataset, scores each one, surfaces anomalies at record and shape level
- DQ Score (0–100) based on checks passed / total authorized

### Unstructured Data (PDF / DOCX)
- Automatic document type classification (commercial loan, term sheet, credit memo, etc.)
- Dynamic schema discovery — no hardcoded field lists, fields are inferred per document instance
- CDE extraction with LLM self-assessed confidence scores and raw text provenance (anti-hallucination guarantee)
- Party extraction (borrower, lender, counsel, agents, guarantors)
- Obligation extraction (conditions, reporting duties, payment triggers, restrictions)
- Monetary amount detection and role classification
- Executive summary (400–500 words) and detailed summary (700–900 words)
- Per-page summaries with key entity extraction (up to 15 pages)
- Free-form risk narrative and CRO-style "what did we miss" sweep
- Document health score (0–100) across: core completeness, provenance integrity, extraction confidence, value validity

### Semi-Structured Data (JSON / XML)
- Schema inference and field-level profiling

### DataForge — Synthetic Data Generator
- Describe a relational database in plain English → LLM generates the schema
- Deterministic Python generates clean synthetic data (Faker-based, no LLM hallucination)
- Inject noise via plain English ("add 10% nulls to account_balance, add typos to customer_name")
- Download as CSV or XLSX

### LensBot — RAG Chatbot
- Ask any question about a profiled document or dataset
- Answers grounded strictly in the profile — never invents or hallucinates
- Vector similarity search (cosine) over profile context
- Cites column names, field values, and page numbers exactly as they appear

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11, FastAPI, Uvicorn |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| LLM | Groq API — `meta-llama/llama-4-scout-17b-16e-instruct` |
| Structured profiling | pandas, numpy, ydata-profiling, scipy |
| Unstructured parsing | PyMuPDF, pdfplumber, python-docx, docling |
| Embeddings / RAG | ChromaDB, tiktoken |
| Synthetic data | Faker |

---

## Project Structure

```
Lens/
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── api/router.py            # All API endpoints
│   ├── profilers/
│   │   ├── structured/          # CSV/XLSX profiler
│   │   ├── unstructured/        # PDF/DOCX profiler + validity checker
│   │   └── semi_structured/     # JSON/XML profiler
│   ├── dq/
│   │   ├── inference_engine.py  # Hybrid LLM + rule-based check inference
│   │   ├── scanner.py           # Check execution engine
│   │   └── models.py            # DQ check and result models
│   ├── core/
│   │   └── dataforge.py         # Synthetic data generation
│   ├── agent/
│   │   └── lensbot.py           # RAG chatbot
│   ├── models/
│   │   └── profile_contract.py  # Shared output schema (ProfileContract)
│   └── store/                   # Profile persistence layer
├── frontend/
│   ├── app/                     # Next.js app router pages
│   ├── components/              # React components
│   └── lib/                     # API client, utilities
├── demo_data/                   # Sample structured / unstructured / semi-structured files
├── requirements.txt
├── run.bat                      # Windows one-click backend start
└── Makefile
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- A [Groq API key](https://console.groq.com) (free tier works)

---

## Setup & Running

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/Lens.git
cd Lens
```

### 2. Backend — create virtual environment and install dependencies

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Set environment variables

Create a `.env` file in the root directory:

```env
GROQ_API_KEY=your_groq_api_key_here
```

### 4. Start the backend

```bash
# Option A — Makefile
make dev

# Option B — Windows batch file
run.bat

# Option C — Direct command
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Backend runs at **http://localhost:8000**  
Interactive API docs at **http://localhost:8000/docs**

### 5. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**

---

## How to use

1. Open **http://localhost:3000**
2. Upload any CSV, XLSX, PDF, DOCX, JSON, or XML file
3. Lens profiles it automatically — structured files get column stats + DQ check inference, documents get CDE extraction + summaries
4. For structured data: review inferred DQ checks, authorize or reject them, add custom rules, then run a scan to get a DQ score and see anomalies
5. For documents: read the extracted CDEs, parties, obligations, executive summary, and per-page breakdown
6. Use **LensBot** to ask questions about any profiled file
7. Use **DataForge** to generate a synthetic relational dataset from a plain English description

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/profile` | Upload and profile a file |
| `GET` | `/api/profiles` | List all profiles |
| `GET` | `/api/profiles/{id}` | Get a specific profile |
| `GET` | `/api/profiles/{id}/page-summaries` | Per-page summaries (PDF/DOCX) |
| `POST` | `/api/dq/infer/{id}` | Infer DQ checks for a structured profile |
| `POST` | `/api/dq/scan/{id}` | Run a DQ scan |
| `POST` | `/api/chat` | LensBot chat |
| `POST` | `/api/dataforge/generate` | Generate a synthetic dataset |

Full interactive docs at `/docs` when the backend is running.

---

## DQ Dimensions

| Dimension | What it checks |
|---|---|
| Completeness | Nulls, missing required values |
| Validity | Data types, regex patterns, allowed values, schema |
| Numeric | Value ranges, IQR bounds, sign constraints, distinct counts |
| String | Min/max length constraints |
| DateTime | Future dates, date range bounds |
| Cross-field | Relationships between columns (e.g. transaction_date > open_date) |
| Aggregate | Column-level sum bounds |
| Dataset-level | Row uniqueness, field count |

---

## Unstructured Health Score Formula

```
health_score = (
  core_completeness    × 0.40   # critical fields found / expected (up to 6 per doc)
  provenance_integrity × 0.30   # extractions backed by raw text citation
  avg_confidence       × 0.20   # LLM self-assessed extraction confidence
  validity_rate        × 0.10   # values passing semantic type validation
) × 100
```
