"""
Full request lifecycle endpoints:

POST   /api/requests                    — Create request (driver)
GET    /api/requests/{id}               — Poll status (driver/mechanic)
POST   /api/requests/{id}/cancel        — Cancel (driver)
POST   /api/requests/{id}/confirm-mechanic — Driver confirms identity
POST   /api/requests/{id}/confirm-payment  — Driver confirms payment
POST   /api/requests/{id}/accept        — Mechanic accepts
POST   /api/requests/{id}/decline       — Mechanic declines (triggers cascade)
POST   /api/requests/{id}/arrive        — Mechanic marks arrival
POST   /api/requests/{id}/verify        — Mechanic enters driver's code
POST   /api/requests/{id}/bill          — Mechanic sends bill
"""
import json
import random
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.models.dispatch import ServiceRequest, RequestStatus
from app.models.graph import MechanicNode
from app.schemas.frontend import (
    CreateRequestInput, CancelInput, AcceptInput, DeclineInput,
    VerifyCodeInput, BillInput, ServiceRequestResponse, GeoPoint,
    Diagnosis, LineItem,
)
from app.services.ai_parser import (
    parse_breakdown_issue, build_frontend_diagnosis, VEHICLE_MAP,
)
from app.services.rag_ranker import get_recommendations
from app.services.dispatch_manager import (
    dispatch_queues, dispatch_timer, trigger_cascade, DISPATCH_TIMEOUT_SECONDS,
)
from app.core.websockets import manager

router = APIRouter()

ACCEPT_WINDOW_S = 90


def _dt_to_epoch_ms(dt: Optional[datetime]) -> Optional[int]:
    """Convert a datetime to epoch milliseconds, or None."""
    if dt is None:
        return None
    return int(dt.timestamp() * 1000)


def _build_response(req: ServiceRequest, db: Session) -> ServiceRequestResponse:
    """
    Transform a DB ServiceRequest row into the full ServiceRequestResponse
    shape the frontend expects.
    """
    # Get the mechanic details from the relationship
    mech: Optional[MechanicNode] = None
    if req.mechanic_id:
        mech = db.query(MechanicNode).filter(MechanicNode.id == req.mechanic_id).first()

    # Parse diagnosis JSON
    diagnosis = None
    if req.diagnosis_json:
        try:
            diagnosis = Diagnosis(**json.loads(req.diagnosis_json))
        except Exception:
            pass

    # Parse line items JSON
    line_items = []
    if req.line_items_json:
        try:
            line_items = [LineItem(**item) for item in json.loads(req.line_items_json)]
        except Exception:
            pass

    # Build mechanic location if available
    mech_location = None
    if req.mechanic_live_lat and req.mechanic_live_lng:
        mech_location = GeoPoint(lat=req.mechanic_live_lat, lng=req.mechanic_live_lng)
    elif mech and mech.latitude and mech.longitude:
        mech_location = GeoPoint(lat=mech.latitude, lng=mech.longitude)

    # Build location
    location = None
    if req.location_lat and req.location_lng:
        location = GeoPoint(
            lat=req.location_lat,
            lng=req.location_lng,
            label=req.location_label,
        )

    # Map DB status to frontend status
    status_map = {
        RequestStatus.PENDING: "pending",
        RequestStatus.ACCEPTED: "en_route",  # ACCEPTED maps to en_route in frontend
        RequestStatus.EN_ROUTE: "en_route",
        RequestStatus.ARRIVED: "arrived",
        RequestStatus.REPAIRING: "repairing",
        RequestStatus.BILLING: "billing",
        RequestStatus.COMPLETED: "completed",
        RequestStatus.CANCELLED: "cancelled",
        RequestStatus.FAILED: "unassigned",
        RequestStatus.UNASSIGNED: "unassigned",
        RequestStatus.DECLINED: "pending",  # After decline, it cascades (still pending)
        RequestStatus.EXPIRED: "pending",
    }
    frontend_status = status_map.get(req.status, "pending")

    # Build initials from business name
    initials = None
    if mech and mech.business_name:
        parts = mech.business_name.split()
        initials = (parts[0][0] + (parts[1][0] if len(parts) > 1 else parts[0][1])).upper() if parts else "??"

    return ServiceRequestResponse(
        id=req.id,
        status=frontend_status,
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
        verification_code=req.verification_code,
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


# ---------- DRIVER ENDPOINTS ----------

@router.post("", response_model=ServiceRequestResponse)
async def create_request(
    input: CreateRequestInput,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Create a new service request. Assigns the chosen mechanic, starts the
    90-second accept deadline, and notifies via WebSocket.
    """
    # Verify mechanic exists
    mech = None
    try:
        uuid_obj = uuid.UUID(str(input.mechanic_id))
        mech = db.query(MechanicNode).filter(MechanicNode.id == uuid_obj).first()
    except (ValueError, TypeError):
        pass
    if not mech:
        mech = db.query(MechanicNode).first()
    if not mech:
        raise HTTPException(status_code=409, detail="That mechanic is no longer available. Please choose another.")

    # Run AI parser for diagnosis
    vehicle_class = VEHICLE_MAP.get(input.vehicle, "HATCHBACK")
    parsed = parse_breakdown_issue(input.description, issue_hint=input.issue)
    diagnosis = build_frontend_diagnosis(parsed, issue_hint=input.issue)

    # Calculate ETA and pricing
    from math import radians, sin, cos, sqrt, atan2
    lat1, lng1 = radians(input.location.lat), radians(input.location.lng)
    lat2, lng2 = radians(mech.latitude), radians(mech.longitude)
    dlat, dlng = lat2 - lat1, lng2 - lng1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlng/2)**2
    dist_km = round(6371 * 2 * atan2(sqrt(a), sqrt(1-a)), 2)
    eta = max(5, round(dist_km * 3 + 2))

    # Get price range from the ranker
    recs = get_recommendations(db, parsed, input.location.lat, input.location.lng, vehicle_class)
    price_min, price_max = 300, 800
    for r in recs:
        if r.mechanic_id == input.mechanic_id:
            price_min = round(r.estimated_fare * 0.85)
            price_max = round(r.total_user_cost)
            break

    now = datetime.now(timezone.utc)
    deadline = now + timedelta(seconds=ACCEPT_WINDOW_S)
    code = str(random.randint(1000, 9999))

    # Create the ServiceRequest
    req = ServiceRequest(
        motorist_id="driver_web",  # Placeholder — real auth will provide this
        mechanic_id=input.mechanic_id,
        issue_description=input.description,
        vehicle_class=vehicle_class,
        status=RequestStatus.PENDING,
        # Extended fields
        vehicle=input.vehicle,
        issue=input.issue,
        location_lat=input.location.lat,
        location_lng=input.location.lng,
        location_label=input.location.label,
        diagnosis_json=json.dumps(diagnosis),
        verification_code=code,
        accept_deadline=deadline,
        distance_km=dist_km,
        eta_min=eta,
        price_min=price_min,
        price_max=price_max,
        driver_name="Driver",
        driver_vehicle_model=input.vehicle,
        driver_plate="",
        mechanic_live_lat=mech.latitude,
        mechanic_live_lng=mech.longitude,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    # Find additional mechanics for cascade queue
    other_ids = [
        r.mechanic_id for r in recs
        if r.mechanic_id != input.mechanic_id
    ]
    dispatch_queues[req.id] = other_ids

    # Notify mechanic via WebSocket
    await manager.send_personal_message(
        {
            "event": "new_request",
            "request_id": req.id,
            "issue_description": req.issue_description,
            "vehicle_class": req.vehicle_class,
        },
        client_id=str(input.mechanic_id),
        client_type="mechanic",
    )

    # Start the 90-second countdown
    background_tasks.add_task(dispatch_timer, req.id, str(input.mechanic_id))

    return _build_response(req, db)


@router.get("/{request_id}", response_model=ServiceRequestResponse)
def get_request(request_id: str, db: Session = Depends(get_db)):
    """
    Poll the current state of a request. The driver screen polls this every 3s.
    Also checks if the accept deadline has passed and triggers reassignment.
    """
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Check if deadline has expired and request is still pending
    now = datetime.now(timezone.utc)
    if (
        req.status == RequestStatus.PENDING
        and req.accept_deadline
        and now > req.accept_deadline
    ):
        # Deadline expired — try to reassign
        queue = dispatch_queues.get(req.id, [])
        if queue:
            next_mech_id = queue.pop(0)
            req.previous_mechanic_name = req.mechanic.business_name if req.mechanic else None
            req.mechanic_id = next_mech_id
            req.reassigned = True
            req.accept_deadline = now + timedelta(seconds=ACCEPT_WINDOW_S)
            db.commit()
        else:
            req.status = RequestStatus.UNASSIGNED
            db.commit()

    return _build_response(req, db)


@router.post("/{request_id}/cancel", response_model=ServiceRequestResponse)
def cancel_request(request_id: str, body: CancelInput, db: Session = Depends(get_db)):
    """Driver cancels the request."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    req.status = RequestStatus.CANCELLED
    db.commit()

    # Clean up dispatch queue
    if req.id in dispatch_queues:
        del dispatch_queues[req.id]

    return _build_response(req, db)


@router.post("/{request_id}/confirm-mechanic", response_model=ServiceRequestResponse)
def confirm_mechanic(request_id: str, db: Session = Depends(get_db)):
    """Driver confirms the mechanic's identity after arrival → repairing."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status == RequestStatus.ARRIVED:
        req.status = RequestStatus.REPAIRING
        db.commit()

    return _build_response(req, db)


@router.post("/{request_id}/confirm-payment", response_model=ServiceRequestResponse)
def confirm_payment(request_id: str, db: Session = Depends(get_db)):
    """Driver confirms they've paid → completed."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != RequestStatus.BILLING:
        raise HTTPException(status_code=400, detail="There's no bill to confirm yet.")

    req.status = RequestStatus.COMPLETED
    req.completed_at = datetime.now(timezone.utc)
    db.commit()

    return _build_response(req, db)


# ---------- MECHANIC ENDPOINTS ----------

@router.post("/{request_id}/accept", response_model=ServiceRequestResponse)
async def accept_request(request_id: str, body: AcceptInput, db: Session = Depends(get_db)):
    """Mechanic accepts the request → en_route."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != RequestStatus.PENDING or str(req.mechanic_id) != body.mechanic_id:
        raise HTTPException(status_code=409, detail="This request is no longer available.")

    req.status = RequestStatus.EN_ROUTE
    req.accepted_at = datetime.now(timezone.utc)
    db.commit()

    # Clean up cascade queue
    if req.id in dispatch_queues:
        del dispatch_queues[req.id]

    # Notify driver
    await manager.send_personal_message(
        {"event": "mechanic_accepted", "mechanic_id": body.mechanic_id, "request_id": request_id},
        client_id=req.motorist_id,
        client_type="motorist",
    )

    return _build_response(req, db)


@router.post("/{request_id}/decline")
async def decline_request(request_id: str, body: DeclineInput, db: Session = Depends(get_db)):
    """Mechanic declines → immediate cascade to next mechanic."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != RequestStatus.PENDING or str(req.mechanic_id) != body.mechanic_id:
        raise HTTPException(status_code=409, detail="This request is no longer available.")

    # Cascade to next mechanic
    queue = dispatch_queues.get(req.id, [])
    if queue:
        next_mech_id = queue.pop(0)
        req.previous_mechanic_name = req.mechanic.business_name if req.mechanic else None
        req.mechanic_id = next_mech_id
        req.reassigned = True
        req.accept_deadline = datetime.now(timezone.utc) + timedelta(seconds=ACCEPT_WINDOW_S)
        db.commit()

        # Notify new mechanic
        await manager.send_personal_message(
            {
                "event": "new_request",
                "request_id": req.id,
                "issue_description": req.issue_description,
                "vehicle_class": req.vehicle_class,
            },
            client_id=str(next_mech_id),
            client_type="mechanic",
        )

        # Notify driver of cascade
        await manager.send_personal_message(
            {"event": "cascade", "message": "Cascading to next mechanic..."},
            client_id=req.motorist_id,
            client_type="motorist",
        )
    else:
        req.status = RequestStatus.UNASSIGNED
        db.commit()

    return {"status": "ok"}


@router.post("/{request_id}/arrive", response_model=ServiceRequestResponse)
async def mark_arrived(request_id: str, db: Session = Depends(get_db)):
    """Mechanic marks they've arrived at the driver's location."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != RequestStatus.EN_ROUTE:
        raise HTTPException(status_code=400, detail="You can only mark arrival while on the way.")

    req.status = RequestStatus.ARRIVED
    req.arrived_at = datetime.now(timezone.utc)
    req.eta_min = 0
    # Snap mechanic location to driver location
    if req.location_lat and req.location_lng:
        req.mechanic_live_lat = req.location_lat
        req.mechanic_live_lng = req.location_lng
    db.commit()

    return _build_response(req, db)


@router.post("/{request_id}/verify", response_model=ServiceRequestResponse)
def verify_code(request_id: str, body: VerifyCodeInput, db: Session = Depends(get_db)):
    """Mechanic enters the driver's 4-digit verification code → repairing."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if body.code.strip() != req.verification_code:
        raise HTTPException(
            status_code=422,
            detail="That code doesn't match. Ask the driver to read it again."
        )

    if req.status == RequestStatus.ARRIVED:
        req.status = RequestStatus.REPAIRING
        db.commit()

    return _build_response(req, db)


@router.post("/{request_id}/bill", response_model=ServiceRequestResponse)
def send_bill(request_id: str, body: BillInput, db: Session = Depends(get_db)):
    """Mechanic sends the bill → billing state."""
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    if req.status != RequestStatus.REPAIRING:
        raise HTTPException(status_code=400, detail="Start the repair before sending a bill.")

    req.status = RequestStatus.BILLING
    req.line_items_json = json.dumps([item.model_dump() for item in body.line_items])
    req.final_amount = sum(item.amount for item in body.line_items)
    req.payment_method = body.payment_method
    db.commit()

    return _build_response(req, db)
