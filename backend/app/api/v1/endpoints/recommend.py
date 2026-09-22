from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.recommend import BreakdownRequest, RecommendationResponse
from app.services.ai_parser import parse_breakdown_issue
from app.services.rag_ranker import get_recommendations

router = APIRouter()

@router.post("/search", response_model=RecommendationResponse)
def search_mechanics(request: BreakdownRequest, db: Session = Depends(get_db)):
    """
    Main endpoint for driver distress calls.
    1. Parses the raw text into structured AI issue.
    2. Sweeps the Postgres DB within 25km.
    3. Ranks mechanics based on vector similarity and distance.
    """
    
    # Step 1: AI Parser
    parsed_issue = parse_breakdown_issue(request.issue_description)
    
    # Step 2 & 3: GraphRAG Ranker (with vehicle class filter)
    try:
        recommendations = get_recommendations(
            db=db,
            parsed_issue=parsed_issue,
            lat=request.driver_latitude,
            lng=request.driver_longitude,
            vehicle_class=request.vehicle_class,
            radius_km=25.0
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error during ranking: {str(e)}")
        
    return RecommendationResponse(
        parsed_issue=parsed_issue,
        recommendations=recommendations
    )
