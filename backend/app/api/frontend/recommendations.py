"""
POST /api/recommendations
The core AI endpoint: parses the driver's distress call with Gemini,
runs the GraphRAG ranker, and returns the diagnosis + ranked mechanic list
in the shape the frontend expects.
"""
import math
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.frontend import (
    RecommendInput, RecommendResult, Diagnosis, Recommendation, Reason,
)
from app.services.ai_parser import (
    parse_breakdown_issue, build_frontend_diagnosis, VEHICLE_MAP,
)
from app.services.rag_ranker import get_recommendations

router = APIRouter()

SEARCH_RADIUS_KM = 25.0


def _eta_minutes(distance_km: float) -> int:
    """Estimate arrival time: roughly 3 min per km + 2 min base."""
    return max(5, round(distance_km * 3 + 2))


def _initials(name: str) -> str:
    """Extract 2-letter initials from a business name."""
    parts = name.split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return name[:2].upper()


def _price_range(estimated_fare: float, total_user_cost: float):
    """Derive a price range from the backend's pricing logic."""
    price_min = round(estimated_fare * 0.85, 0)
    price_max = round(total_user_cost, 0)
    if price_min >= price_max:
        price_min = round(price_max * 0.6, 0)
    return int(price_min), int(price_max)


@router.post("", response_model=RecommendResult)
def recommend(input: RecommendInput, db: Session = Depends(get_db)):
    """
    Main recommendation endpoint for the driver portal.
    1. Calls the enhanced Gemini AI parser.
    2. Runs the PostGIS + pgvector GraphRAG ranker.
    3. Transforms the result into the frontend's expected shape.
    """
    # Map frontend vehicle type to backend vehicle class
    vehicle_class = VEHICLE_MAP.get(input.vehicle, "HATCHBACK")

    # Step 1: AI Parser (enhanced — produces diagnosis + keywords)
    parsed_issue = parse_breakdown_issue(
        raw_text=input.description,
        issue_hint=input.issue,
    )

    # Step 2 & 3: GraphRAG Ranker
    try:
        raw_recs = get_recommendations(
            db=db,
            parsed_issue=parsed_issue,
            lat=input.lat,
            lng=input.lng,
            vehicle_class=vehicle_class,
            radius_km=SEARCH_RADIUS_KM,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error during ranking: {str(e)}")

    # Build the frontend Diagnosis object
    diagnosis = build_frontend_diagnosis(parsed_issue, issue_hint=input.issue)

    # Transform mechanics into frontend Recommendation shape
    mechanics = []
    best_id = None
    best_score = -1

    for rec in raw_recs:
        if rec.composite_score > best_score:
            best_score = rec.composite_score
            best_id = rec.mechanic_id

    for rec in raw_recs:
        eta = _eta_minutes(rec.distance_km)
        price_min, price_max = _price_range(rec.estimated_fare, rec.total_user_cost)

        # Build "why this mechanic?" reasons from the ranker's data
        reasons = [
            Reason(label="Distance", value=f"{rec.distance_km} km from you"),
            Reason(label="Matching service", value=" · ".join(rec.matched_capabilities[:3])),
            Reason(label="Rating", value=f"{rec.base_rating}★ from {0} jobs"),
            Reason(label="Typical arrival", value=f"~{eta} min estimated"),
            Reason(label="Verified", value="ID, workshop & licence checked"),
        ]

        # Try to get extra fields from the DB mechanic object
        # Query the mechanic to get extended fields
        from app.models.graph import MechanicNode
        mech_obj = db.query(MechanicNode).filter(
            MechanicNode.id == rec.mechanic_id
        ).first()

        owner = rec.business_name
        vehicle_label = "Service vehicle"
        plate = ""
        verified = True
        reviews = 0

        if mech_obj:
            owner = mech_obj.owner_name or rec.business_name
            vehicle_label = mech_obj.vehicle_label or "Service vehicle"
            plate = mech_obj.vehicle_plate or ""
            verified = mech_obj.verified if mech_obj.verified is not None else True
            reviews = mech_obj.total_reviews or 0
            # Update the reasons with real review count
            reasons[2] = Reason(
                label="Rating",
                value=f"{rec.base_rating}★ from {reviews} jobs"
            )

        mechanics.append(Recommendation(
            mechanic_id=rec.mechanic_id,
            name=rec.business_name,
            owner=owner,
            initials=_initials(rec.business_name),
            rating=rec.base_rating,
            reviews=reviews,
            distance_km=rec.distance_km,
            eta_min=eta,
            price_min=price_min,
            price_max=price_max,
            services_label=" · ".join(rec.matched_capabilities[:4]),
            vehicle_label=vehicle_label,
            plate=plate,
            verified=verified,
            is_best=(rec.mechanic_id == best_id),
            reasons=reasons,
        ))

    return RecommendResult(
        radius_km=SEARCH_RADIUS_KM,
        diagnosis=Diagnosis(**diagnosis),
        mechanics=mechanics,
    )
