"""
Lens — Main Application Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

from backend.api.router import router

app = FastAPI(
    title="Lens",
    description="Unified Document & Data Intelligence Platform — Wells Fargo CDO",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all API routes
app.include_router(router)


@app.get("/")
def root():
    return {
        "platform":    "Lens",
        "version":     "1.0.0",
        "status":      "running",
        "timestamp":   datetime.utcnow().isoformat(),
        "docs":        "/docs",
        "endpoints": {
            "profile_file":   "POST /api/profile",
            "list_profiles":  "GET  /api/profiles",
            "get_profile":    "GET  /api/profiles/{id}",
            "page_summaries": "GET  /api/profiles/{id}/page-summaries",
        }
    }