"""
Pydantic schemas matching the frontend API contract (docs/API_CONTRACT.md).
Field names are snake_case and map 1:1 to the frontend's lib/types.ts.
"""
from pydantic import BaseModel, Field
from typing import List, Optional


# ---------- Shared ----------

class GeoPoint(BaseModel):
    lat: float
    lng: float
    label: Optional[str] = None
    accuracy_m: Optional[int] = None


class LineItem(BaseModel):
    label: str
    amount: float


# ---------- Recommendations ----------

class RecommendInput(BaseModel):
    lat: float
    lng: float
    vehicle: str  # car | bike | auto | truck
    issue: str    # flat | battery | heat | start | fuel | tow | other
    description: str = ""
    sort: str = "best"


class Diagnosis(BaseModel):
    issue: str
    title: str
    confidence: str  # High | Medium | Low
    service: str
    body: str
    mechanic_tip: str


class Reason(BaseModel):
    label: str
    value: str


class Recommendation(BaseModel):
    mechanic_id: str
    name: str
    owner: str
    initials: str
    rating: float
    reviews: int
    distance_km: float
    eta_min: int
    price_min: float
    price_max: float
    services_label: str
    vehicle_label: str
    plate: str
    verified: bool
    is_best: bool
    reasons: List[Reason]


class RecommendResult(BaseModel):
    radius_km: float
    diagnosis: Diagnosis
    mechanics: List[Recommendation]


# ---------- Service Request (full lifecycle) ----------

class CreateRequestInput(BaseModel):
    location: GeoPoint
    vehicle: str
    issue: str
    description: str = ""
    mechanic_id: str


class CancelInput(BaseModel):
    reason: Optional[str] = None


class ConfirmMechanicInput(BaseModel):
    pass  # no body needed


class ConfirmPaymentInput(BaseModel):
    pass  # no body needed


class AcceptInput(BaseModel):
    mechanic_id: str


class DeclineInput(BaseModel):
    mechanic_id: str
    reason: str = ""


class ArriveInput(BaseModel):
    pass  # no body needed


class VerifyCodeInput(BaseModel):
    code: str


class BillInput(BaseModel):
    line_items: List[LineItem]
    payment_method: str  # upi | cash


class ServiceRequestResponse(BaseModel):
    """The full ServiceRequest shape the frontend polls for."""
    id: str
    status: str
    vehicle: Optional[str] = None
    issue: Optional[str] = None
    description: Optional[str] = None
    location: Optional[GeoPoint] = None
    diagnosis: Optional[Diagnosis] = None
    mechanic_id: Optional[str] = None
    mechanic_name: Optional[str] = None
    mechanic_owner: Optional[str] = None
    mechanic_initials: Optional[str] = None
    mechanic_rating: Optional[float] = None
    mechanic_vehicle_label: Optional[str] = None
    mechanic_plate: Optional[str] = None
    mechanic_phone: Optional[str] = None
    mechanic_location: Optional[GeoPoint] = None
    reassigned: bool = False
    previous_mechanic_name: Optional[str] = None
    created_at: Optional[int] = None        # epoch ms
    accept_deadline: Optional[int] = None   # epoch ms
    accepted_at: Optional[int] = None
    arrived_at: Optional[int] = None
    completed_at: Optional[int] = None
    verification_code: Optional[str] = None
    distance_km: Optional[float] = None
    eta_min: Optional[int] = None
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    line_items: List[LineItem] = []
    final_amount: Optional[float] = None
    payment_method: Optional[str] = None
    driver_name: str = "Driver"
    driver_vehicle_model: str = ""
    driver_plate: str = ""


# ---------- Mechanic Dashboard ----------

class MechanicProfile(BaseModel):
    id: str
    name: str
    owner: str
    initials: str
    area: str
    radius_km: float
    rating: float
    reviews: int
    verified: bool


class TodayStats(BaseModel):
    jobs: int
    earned: float
    avg_response_min: int


class WeekDay(BaseModel):
    day: str
    amount: float


class WeekSummary(BaseModel):
    earned: float
    jobs: int
    accepted: int
    offered: int
    on_time: int


class NearbyRequest(BaseModel):
    id: str
    issue_label: str
    vehicle_label: str
    place: str
    minutes_ago: int
    distance_km: float


class ServiceOffering(BaseModel):
    key: str
    label: str
    price_label: str
    enabled: bool


class Review(BaseModel):
    id: str
    stars: int
    service: str
    text: str
    tags: List[str]
    when: str


class MechanicDashboardResponse(BaseModel):
    mechanic: MechanicProfile
    online: bool
    incoming: Optional[ServiceRequestResponse] = None
    active: Optional[ServiceRequestResponse] = None
    last_completed: Optional[ServiceRequestResponse] = None
    today: TodayStats
    week: List[WeekDay]
    week_summary: WeekSummary
    nearby: List[NearbyRequest]
    services: List[ServiceOffering]
    reviews: List[Review]


class AvailabilityInput(BaseModel):
    online: bool


class ServiceToggleInput(BaseModel):
    service: str
    enabled: bool


# ---------- Admin / Control Room ----------

class IncidentResponse(BaseModel):
    id: str
    issue_label: str
    vehicle_label: str
    highway: str
    place: str
    lat: float
    lng: float
    status: str  # open | en_route | fixing | resolved
    minutes_waiting: int
    eta_min: Optional[int] = None
    mechanic_name: Optional[str] = None
    sos: bool = False


class MechanicMapPoint(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    online: bool


class Hotspot(BaseModel):
    lat: float
    lng: float
    weight: float
    label: str


class KPIs(BaseModel):
    open_requests: int
    mechanics_online: int
    avg_arrival_min: int
    active_sos: int


class AdminOverviewResponse(BaseModel):
    kpis: KPIs
    incidents: List[IncidentResponse]
    sos: list = []  # Stub — backend person will implement
    verifications: list = []  # Stub
    mechanics: List[MechanicMapPoint]
    hotspots: List[Hotspot]


# ---------- Feedback (stubs for backend person) ----------

class FeedbackInput(BaseModel):
    request_id: str
    rating: int
    tags: List[str] = []
    price_matched: Optional[bool] = None
    charged_amount: Optional[float] = None
    comment: str = ""


class PastRequestResponse(BaseModel):
    id: str
    issue_label: str
    mechanic_name: str
    date: str
    rated: Optional[int] = None


# ---------- SOS (stubs) ----------

class SosInput(BaseModel):
    location: Optional[GeoPoint] = None
    request_id: Optional[str] = None


class SosAlertResponse(BaseModel):
    id: str
    sent_at: int
    location: Optional[GeoPoint] = None
    notified: List[str] = []
    status: str  # active | acknowledged | resolved
    place: str = ""


# ---------- Auth (stubs) ----------

class OtpSendInput(BaseModel):
    role: str  # driver | mechanic | admin
    phone: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class OtpChallengeResponse(BaseModel):
    challenge_id: str
    sent_to: str
    expires_in_s: int
    demo_code: Optional[str] = None


class OtpVerifyInput(BaseModel):
    challenge_id: str
    code: str


class SessionResponse(BaseModel):
    role: str
    name: str
    mechanic_id: Optional[str] = None
    token: str


# ---------- Mechanic Registration ----------

class MechanicRegisterInput(BaseModel):
    business_name: str
    phone_number: str
    latitude: float
    longitude: float
    owner_name: Optional[str] = None
    vehicle_label: Optional[str] = "Service vehicle"
    vehicle_plate: Optional[str] = None
    area: Optional[str] = "Jaipur"
    capabilities: List[str] = []  # list of concept names like "tyre repair", "battery"
