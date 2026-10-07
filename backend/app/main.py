from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints import recommend, dispatch
from app.api.frontend import recommendations as fe_recommendations
from app.api.frontend import requests as fe_requests
from app.api.frontend import mechanics as fe_mechanics
from app.api.frontend import admin as fe_admin
from app.core.database import engine
from app.models.graph import Base
from app.models import graph, dispatch as dispatch_models
from app.api.frontend import feedback as fe_feedback
from app.api.frontend import auth as fe_auth

# Ensure tables exist (will create new ones like ServiceRequest if missing)
Base.metadata.create_all(bind=engine)
app = FastAPI(
    title="Smart Breakdown AI Engine API",
    description="Backend API powering the GraphRAG recommendation engine and frontend integration.",
    version="2.0.0"
)

# CORS configuration to allow Next.js frontend to talk to us
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------- Legacy V1 API Routers (backward compatible) -------
app.include_router(recommend.router, prefix="/api/v1/recommendations", tags=["V1 – Recommendations"])
app.include_router(dispatch.router, prefix="/api/v1/dispatch", tags=["V1 – Dispatch"])

# ------- Frontend API Routers (matches docs/API_CONTRACT.md) -------
app.include_router(fe_recommendations.router, prefix="/api/recommendations", tags=["Recommendations"])
app.include_router(fe_requests.router, prefix="/api/requests", tags=["Requests"])
app.include_router(fe_mechanics.router, prefix="/api/mechanics", tags=["Mechanics"])
app.include_router(fe_admin.router, prefix="/api/admin", tags=["Admin – Control Room"])
app.include_router(fe_feedback.router, prefix="/api/feedback", tags=["Feedback"])
app.include_router(fe_feedback.requests_router, prefix="/api/requests", tags=["Requests"])
app.include_router(fe_auth.router, prefix="/api/auth", tags=["Auth"])

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Smart Breakdown AI Engine API v2. Visit /docs for Swagger UI.",
        "endpoints": {
            "frontend_api": "/api/recommendations, /api/requests, /api/mechanics, /api/admin",
            "legacy_v1": "/api/v1/recommendations, /api/v1/dispatch",
            "swagger": "/docs",
        }
    }
