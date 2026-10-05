"""
Control room (admin) endpoints — partial implementation.
Only the parts that come from YOUR data (mechanics, requests) are real.
SOS, verifications, hotspots are stubs for the backend person.

GET  /api/admin/overview  — Dashboard data (polled every 5s)
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.graph import MechanicNode
from app.models.dispatch import ServiceRequest, RequestStatus
from app.schemas.frontend import (
    AdminOverviewResponse, KPIs, IncidentResponse, MechanicMapPoint, Hotspot,
)

router = APIRouter()

ISSUE_LABELS = {
    "flat": "Flat tyre", "battery": "Battery dead", "heat": "Overheating",
    "start": "Won't start", "fuel": "Out of fuel", "tow": "Accident / towing",
    "other": "Not sure",
    "TIRE_PUNCTURE": "Flat tyre", "BATTERY_DEAD": "Battery dead",
    "ENGINE_OVERHEAT": "Overheating", "FUEL_EMPTY": "Out of fuel",
    "BRAKE_FAILURE": "Brake failure", "OTHER": "Other",
}
VEHICLE_LABELS = {
    "car": "Car", "bike": "Two-wheeler", "auto": "Auto", "truck": "Truck / Bus",
    "TWO_WHEELER": "Two-wheeler", "HATCHBACK": "Car", "SEDAN": "Car",
    "SUV": "SUV", "TRUCK": "Truck",
}


@router.get("/overview", response_model=AdminOverviewResponse)
def admin_overview(db: Session = Depends(get_db)):
    """
    Returns the control room dashboard data.
    Real data: KPIs, mechanic map points, active incidents from service_requests.
    Stubs: SOS alerts, verifications, hotspots.
    """
    now = datetime.now(timezone.utc)

    # KPIs from real data
    open_count = db.query(ServiceRequest).filter(
        ServiceRequest.status.in_([RequestStatus.PENDING, RequestStatus.UNASSIGNED])
    ).count()

    mechanics_online = db.query(MechanicNode).filter(
        MechanicNode.is_online == True
    ).count()

    # Active incidents from service_requests
    active_statuses = [
        RequestStatus.PENDING, RequestStatus.EN_ROUTE, RequestStatus.ARRIVED,
        RequestStatus.REPAIRING, RequestStatus.BILLING, RequestStatus.ACCEPTED,
        RequestStatus.UNASSIGNED,
    ]
    active_reqs = db.query(ServiceRequest).filter(
        ServiceRequest.status.in_(active_statuses)
    ).all()

    incidents = []
    for r in active_reqs:
        minutes_waiting = max(1, int((now - r.created_at).total_seconds() / 60)) if r.created_at else 0

        # Map status
        if r.status in (RequestStatus.PENDING, RequestStatus.UNASSIGNED):
            inc_status = "open"
        elif r.status in (RequestStatus.EN_ROUTE, RequestStatus.ACCEPTED):
            inc_status = "en_route"
        else:
            inc_status = "fixing"

        mech_name = None
        if r.mechanic and r.status != RequestStatus.PENDING:
            mech_name = r.mechanic.business_name

        incidents.append(IncidentResponse(
            id=r.id,
            issue_label=ISSUE_LABELS.get(r.issue or r.vehicle_class or "", "Unknown"),
            vehicle_label=VEHICLE_LABELS.get(r.vehicle or r.vehicle_class or "", "Unknown"),
            highway=r.location_label or "Unknown location",
            place=r.location_label or "Unknown",
            lat=r.location_lat or 26.9124,
            lng=r.location_lng or 75.7873,
            status=inc_status,
            minutes_waiting=minutes_waiting,
            eta_min=r.eta_min if r.status == RequestStatus.EN_ROUTE else None,
            mechanic_name=mech_name,
            sos=False,
        ))

    # All mechanics for the map
    all_mechanics = db.query(MechanicNode).all()
    mech_points = [
        MechanicMapPoint(
            id=str(m.id),
            name=m.business_name,
            lat=m.latitude,
            lng=m.longitude,
            online=m.is_online,
        )
        for m in all_mechanics
    ]

    # Hotspots — placeholder data around Jaipur
    hotspots = [
        Hotspot(lat=26.8571, lng=75.5701, weight=0.8, label="NH-48 Bagru toll"),
        Hotspot(lat=26.7719, lng=75.8331, weight=0.6, label="Sitapura industrial area"),
        Hotspot(lat=26.9521, lng=75.7289, weight=0.5, label="Jhotwara flyover"),
        Hotspot(lat=26.7231, lng=75.8463, weight=0.9, label="NH-52 Tonk Road junction"),
    ]

    return AdminOverviewResponse(
        kpis=KPIs(
            open_requests=open_count,
            mechanics_online=mechanics_online,
            avg_arrival_min=14,  # Placeholder; compute from real data when available
            active_sos=0,  # Stub
        ),
        incidents=incidents,
        sos=[],  # Stub for backend person
        verifications=[],  # Stub for backend person
        mechanics=mech_points,
        hotspots=hotspots,
    )
