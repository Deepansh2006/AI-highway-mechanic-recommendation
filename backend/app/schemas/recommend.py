from pydantic import BaseModel, Field
from typing import List, Optional

class BreakdownRequest(BaseModel):
    driver_latitude: float = Field(..., description="Latitude of the stranded driver")
    driver_longitude: float = Field(..., description="Longitude of the stranded driver")
    issue_description: str = Field(..., description="Raw text or transcribed audio describing the breakdown")
    vehicle_class: Optional[str] = Field("Unknown", description="Optional vehicle class (SEDAN, SUV, TRUCK, TWO_WHEELER)")

class MechanicRecommendation(BaseModel):
    mechanic_id: str
    business_name: str
    phone_number: str
    distance_km: float
    base_rating: float
    composite_score: float
    matched_capabilities: List[str]
    estimated_fare: float
    platform_fee: float
    total_user_cost: float
    rationale: str

class RecommendationResponse(BaseModel):
    parsed_issue: dict
    recommendations: List[MechanicRecommendation]
