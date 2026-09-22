from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints import recommend

app = FastAPI(
    title="Smart Breakdown AI Engine API",
    description="Backend API powering the Phase 3 GraphRAG recommendation engine.",
    version="1.0.0"
)

# CORS configuration to allow Next.js frontend to talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to frontend domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(recommend.router, prefix="/api/v1/recommendations", tags=["Recommendations"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Smart Breakdown AI Engine API. Visit /docs for Swagger UI."}
