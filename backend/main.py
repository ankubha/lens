"""
Lens — Main Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

app = FastAPI(
    title="Lens",
    description="Unified Document & Data Intelligence Platform — Wells Fargo CDO",
    version="1.0.0",
)

# Allow the React frontend to talk to this API later
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ──────────────────────────────
@app.get("/")
def root():
    return {
        "platform": "Lens",
        "status": "running",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Profile routes (we'll fill these in next steps) ──
@app.get("/api/profiles")
def list_profiles():
    return {"profiles": [], "message": "No profiles yet — profilers coming soon."}