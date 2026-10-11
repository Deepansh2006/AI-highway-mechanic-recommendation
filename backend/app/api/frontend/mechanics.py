"""
Mechanic dashboard and profile endpoints:

GET    /api/mechanics/{id}/dashboard   — Full dashboard data (polled every 2.5s)
POST   /api/mechanics/{id}/availability — Toggle online/offline
POST   /api/mechanics/{id}/services    — Toggle service offerings
"""
import json
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from geoalchemy2.elements import WKTElement
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.core.database import get_db
from app.models.graph import MechanicNode, ConceptNode
from app.models.dispatch import ServiceRequest, RequestStatus
from app.schemas.frontend import (
    MechanicDashboardResponse, MechanicProfile, TodayStats, WeekDay,
    WeekSummary, NearbyRequest, ServiceOffering, Review,
    ServiceRequestResponse, AvailabilityInput, ServiceToggleInput,
    GeoPoint, Diagnosis, LineItem, MechanicRegisterInput,
)
from app.services.rag_ranker import embedding_model

router = APIRouter()

def _find_mechanic(mechanic_id: str, db: Session):
    try:
        uuid_obj = uuid.UUID(str(mechanic_id))
        mech = db.query(MechanicNode).filter(MechanicNode.id == uuid_obj).first()
        if mech:
            return mech
    except (ValueError, TypeError):
        pass
    return db.query(MechanicNode).first()


# Hardcoded service offerings (matching the frontend mock)
DEFAULT_SERVICES = [
    ServiceOffering(key="tyre", label="Tyres & puncture", price_label="₹150–600", enabled=True),
    ServiceOffering(key="battery", label="Battery jump-start", price_label="₹300–500", enabled=True),
    ServiceOffering(key="fuel", label="Fuel delivery", price_label="₹200 + fuel", enabled=True),
    ServiceOffering(key="engine", label="Engine diagnosis", price_label="from ₹400", enabled=True),
    ServiceOffering(key="towing", label="Towing", price_label="₹1,500+ · needs tow van", enabled=False),
]

# In-memory store for disabled services per mechanic (use Redis in production)
_disabled_services: dict[str, set] = {}

ISSUE_LABELS = {
    "flat": "Flat tyre", "battery": "Battery dead", "heat": "Overheating",
    "start": "Won't start", "fuel": "Out of fuel", "tow": "Accident / towing",
    "other": "Not sure",
}
VEHICLE_LABELS = {
    "car": "Car", "bike": "Two-wheeler", "auto": "Auto", "truck": "Truck / Bus",
}


def _dt_to_epoch_ms(dt):
    if dt is None:
        return None
    return int(dt.timestamp() * 1000)


def _initials(name: str) -> str:
    parts = name.split()
    if len(parts) >= 2:
        return (parts[0][0] + parts[1][0]).upper()
    return name[:2].upper()


def _build_request_response(req: ServiceRequest, db: Session) -> ServiceRequestResponse:
    """Convert a DB ServiceRequest into the frontend shape."""
    mech = None
    if req.mechanic_id:
        mech = db.query(MechanicNode).filter(MechanicNode.id == req.mechanic_id).first()

    diagnosis = None
    if req.diagnosis_json:
        try:
            diagnosis = Diagnosis(**json.loads(req.diagnosis_json))
        except Exception:
            pass

    line_items = []
    if req.line_items_json:
        try:
            line_items = [LineItem(**item) for item in json.loads(req.line_items_json)]
        except Exception:
            pass

    mech_location = None
    if req.mechanic_live_lat and req.mechanic_live_lng:
        mech_location = GeoPoint(lat=req.mechanic_live_lat, lng=req.mechanic_live_lng)
    elif mech:
        mech_location = GeoPoint(lat=mech.latitude, lng=mech.longitude)

    location = None
    if req.location_lat and req.location_lng:
        location = GeoPoint(lat=req.location_lat, lng=req.location_lng, label=req.location_label)

    status_map = {
        RequestStatus.PENDING: "pending",
        RequestStatus.ACCEPTED: "en_route",
        RequestStatus.EN_ROUTE: "en_route",
        RequestStatus.ARRIVED: "arrived",
        RequestStatus.REPAIRING: "repairing",
        RequestStatus.BILLING: "billing",
        RequestStatus.COMPLETED: "completed",
        RequestStatus.CANCELLED: "cancelled",
        RequestStatus.FAILED: "unassigned",
        RequestStatus.UNASSIGNED: "unassigned",
        RequestStatus.DECLINED: "pending",
        RequestStatus.EXPIRED: "pending",
    }

    initials = None
    if mech:
        initials = _initials(mech.business_name)

    return ServiceRequestResponse(
        id=req.id,
        status=status_map.get(req.status, "pending"),
        vehicle=req.vehicle,
        issue=req.issue,
        description=req.issue_description,
        location=location,
        diagnosis=diagnosis,
        mechanic_id=str(req.mechanic_id) if req.mechanic_id else None,
        mechanic_name=mech.business_name if mech else None,
        mechanic_owner=mech.owner_name or mech.business_name if mech else None,
        mechanic_initials=initials,
        mechanic_rating=float(mech.base_rating) if mech else None,
        mechanic_vehicle_label=mech.vehicle_label if mech else None,
        mechanic_plate=mech.vehicle_plate if mech else None,
        mechanic_phone=mech.phone_number if mech else None,
        mechanic_location=mech_location,
        reassigned=req.reassigned or False,
        previous_mechanic_name=req.previous_mechanic_name,
        created_at=_dt_to_epoch_ms(req.created_at),
        accept_deadline=_dt_to_epoch_ms(req.accept_deadline),
        accepted_at=_dt_to_epoch_ms(req.accepted_at),
        arrived_at=_dt_to_epoch_ms(req.arrived_at),
        completed_at=_dt_to_epoch_ms(req.completed_at),
        verification_code=None,  # Never expose to mechanic
        distance_km=req.distance_km,
        eta_min=req.eta_min,
        price_min=req.price_min,
        price_max=req.price_max,
        line_items=line_items,
        final_amount=req.final_amount,
        payment_method=req.payment_method,
        driver_name=req.driver_name or "Driver",
        driver_vehicle_model=req.driver_vehicle_model or "",
        driver_plate=req.driver_plate or "",
    )


@router.get("/{mechanic_id}/dashboard", response_model=MechanicDashboardResponse)
def mechanic_dashboard(mechanic_id: str, db: Session = Depends(get_db)):
    """
    Returns the full dashboard for a mechanic. Polled every 2.5s by the frontend.
    """
    mech = _find_mechanic(mechanic_id, db)
    if not mech:
        raise HTTPException(status_code=404, detail="Mechanic not found")

    now = datetime.now(timezone.utc)

    # Find all requests assigned to this mechanic
    all_reqs = db.query(ServiceRequest).filter(
        ServiceRequest.mechanic_id == mech.id
    ).order_by(ServiceRequest.created_at.desc()).all()

    # Categorize requests
    incoming = None
    active = None
    last_completed = None

    for r in all_reqs:
        if r.status == RequestStatus.PENDING and incoming is None:
            incoming = _build_request_response(r, db)
        elif r.status in (
            RequestStatus.EN_ROUTE, RequestStatus.ARRIVED,
            RequestStatus.REPAIRING, RequestStatus.BILLING,
            RequestStatus.ACCEPTED,
        ) and active is None:
            active = _build_request_response(r, db)
        elif r.status == RequestStatus.COMPLETED and last_completed is None:
            last_completed = _build_request_response(r, db)

    # Today's stats
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_done = [
        r for r in all_reqs
        if r.status == RequestStatus.COMPLETED
        and r.completed_at and r.completed_at >= today_start
    ]
    earned_today = sum(r.final_amount or 0 for r in today_done)
    jobs_today = len(today_done)

    # Weekly earnings (generate placeholder data + real today)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    today_idx = now.weekday()
    week_data = []
    for i, day in enumerate(days):
        if i == today_idx:
            week_data.append(WeekDay(day="Today", amount=earned_today))
        elif i < today_idx:
            # Placeholder earnings for past days this week
            week_data.append(WeekDay(day=day, amount=1500 + (i * 300)))
        else:
            week_data.append(WeekDay(day=day, amount=0))

    total_week_earned = sum(w.amount for w in week_data)
    total_week_jobs = jobs_today + 12  # placeholder

    # Nearby requests (other pending requests within range)
    nearby_reqs = db.query(ServiceRequest).filter(
        ServiceRequest.status == RequestStatus.PENDING,
        ServiceRequest.mechanic_id != mech.id,
    ).limit(5).all()

    nearby = []
    for nr in nearby_reqs:
        minutes_ago = max(1, int((now - nr.created_at).total_seconds() / 60)) if nr.created_at else 0
        nearby.append(NearbyRequest(
            id=nr.id,
            issue_label=ISSUE_LABELS.get(nr.issue or "", nr.issue_description or "Unknown"),
            vehicle_label=VEHICLE_LABELS.get(nr.vehicle or "", nr.vehicle_class or "Unknown"),
            place=nr.location_label or "Unknown location",
            minutes_ago=minutes_ago,
            distance_km=nr.distance_km or 0,
        ))

    # Build service offerings with disabled state
    disabled = _disabled_services.get(mechanic_id, {"towing"})
    services = [
        ServiceOffering(
            key=s.key, label=s.label, price_label=s.price_label,
            enabled=s.key not in disabled,
        )
        for s in DEFAULT_SERVICES
    ]

    # Build profile
    profile = MechanicProfile(
        id=str(mech.id),
        name=mech.business_name,
        owner=mech.owner_name or mech.business_name,
        initials=_initials(mech.business_name),
        area=mech.area or "Jaipur",
        radius_km=25,
        rating=float(mech.base_rating),
        reviews=mech.total_reviews or 0,
        verified=mech.verified if mech.verified is not None else True,
    )

    return MechanicDashboardResponse(
        mechanic=profile,
        online=mech.is_online,
        incoming=incoming if mech.is_online else None,
        active=active,
        last_completed=last_completed,
        today=TodayStats(
            jobs=jobs_today,
            earned=earned_today,
            avg_response_min=4,
        ),
        week=week_data,
        week_summary=WeekSummary(
            earned=total_week_earned,
            jobs=total_week_jobs,
            accepted=total_week_jobs,
            offered=total_week_jobs + 3,
            on_time=total_week_jobs - 1,
        ),
        nearby=nearby,
        services=services,
        reviews=[],  # No review table yet — will be filled by backend person
    )


@router.post("/{mechanic_id}/availability")
def set_availability(mechanic_id: str, body: AvailabilityInput, db: Session = Depends(get_db)):
    """Toggle the mechanic's online/offline status."""
    mech = _find_mechanic(mechanic_id, db)
    if not mech:
        raise HTTPException(status_code=404, detail="Mechanic not found")

    mech.is_online = body.online
    db.commit()
    return {"status": "ok"}


@router.post("/{mechanic_id}/services")
def set_service(mechanic_id: str, body: ServiceToggleInput, db: Session = Depends(get_db)):
    """Toggle a specific service offering on or off."""
    if mechanic_id not in _disabled_services:
        _disabled_services[mechanic_id] = {"towing"}

    if body.enabled:
        _disabled_services[mechanic_id].discard(body.service)
    else:
        _disabled_services[mechanic_id].add(body.service)

    return {"status": "ok"}

@router.post("/register")
def register_mechanic(body: MechanicRegisterInput, db: Session = Depends(get_db)):
    """Create a mechanic profile and link its service capabilities."""
    existing = db.query(MechanicNode).filter(
        MechanicNode.phone_number == body.phone_number
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="A mechanic is already registered with this phone number.")

    mechanic = MechanicNode(
        business_name=body.business_name,
        phone_number=body.phone_number,
        latitude=body.latitude,
        longitude=body.longitude,
        location=WKTElement(
            f"POINT({body.longitude} {body.latitude})",
            srid=4326,
        ),
        owner_name=body.owner_name,
        vehicle_label=body.vehicle_label,
        vehicle_plate=body.vehicle_plate,
        area=body.area,
    )

    seen_capabilities = set()
    try:
        for capability_name in body.capabilities:
            capability_name = capability_name.strip()
            if not capability_name or capability_name in seen_capabilities:
                continue
            seen_capabilities.add(capability_name)

            capability = db.query(ConceptNode).filter(
                ConceptNode.name == capability_name
            ).first()
            if capability is None:
                embedding = (
                    embedding_model.encode(capability_name).tolist()
                    if embedding_model is not None
                    else [0.0] * 384
                )
                capability = ConceptNode(
                    name=capability_name,
                    category="SERVICE",
                    embedding=embedding,
                )
                db.add(capability)
                db.flush()
            elif capability.embedding is None:
                capability.embedding = (
                    embedding_model.encode(capability_name).tolist()
                    if embedding_model is not None
                    else [0.0] * 384
                )

            mechanic.capabilities.append(capability)

        db.add(mechanic)
        db.commit()
        db.refresh(mechanic)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The mechanic could not be registered because matching details already exist.",
        )

    return {"status": "ok", "mechanic_id": str(mechanic.id)}
