import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add workspace root to sys.path
workspace_dir = Path(__file__).resolve().parent.parent.parent
if str(workspace_dir) not in sys.path:
    sys.path.append(str(workspace_dir))

from backend.app.routers import exams, ocr

app = FastAPI(
    title="Azozo Exam Platform API",
    description="Azota-like PDF OCR, Sequence Labelling & Online Examination System API",
    version="1.0.0",
)

# CORS Middleware for Frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(exams.router)
app.include_router(ocr.router)

@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "service": "Azozo Exam Backend"}
