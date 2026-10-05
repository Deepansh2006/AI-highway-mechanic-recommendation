import asyncio
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks
import logging

from app.core.database import SessionLocal
from app.models.dispatch import ServiceRequest, RequestStatus
from app.core.websockets import manager

logger = logging.getLogger(__name__)

# Configurable timer for testing (use 90 in production)
DISPATCH_TIMEOUT_SECONDS = 90

# In-memory store for the queue of remaining mechanics for a given request_id
# (In production, use Redis)
dispatch_queues = {}

async def dispatch_timer(request_id: str, tracked_mechanic_id: str):
    """
    Background task that waits for the timeout. If the request is still pending for the SAME mechanic, it cascades.
    """
    await asyncio.sleep(DISPATCH_TIMEOUT_SECONDS)
    
    # We must use a new DB session since this runs in the background
    db = SessionLocal()
    try:
        request = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
        if not request:
            return
            
        # Only cascade if it's still PENDING and the mechanic hasn't changed
        if request.status == RequestStatus.PENDING and request.mechanic_id == tracked_mechanic_id:
            logger.info(f"Request {request_id} expired for {tracked_mechanic_id}. Cascading...")
            
            # Notify the mechanic that they missed it
            await manager.send_personal_message(
                {"event": "request_expired", "request_id": request_id}, 
                client_id=request.mechanic_id, 
                client_type="mechanic"
            )
            await trigger_cascade(request, db)
    finally:
        db.close()

async def trigger_cascade(request: ServiceRequest, db: Session):
    """ Immediately cascades to the next mechanic in the queue """
    queue = dispatch_queues.get(request.id, [])
    
    if not queue:
        # No one left to ping
        request.status = RequestStatus.FAILED
        db.commit()
        await manager.send_personal_message(
            {"event": "dispatch_failed", "message": "All mechanics declined or timed out."},
            client_id=request.motorist_id,
            client_type="motorist"
        )
        # Cleanup memory
        if request.id in dispatch_queues:
            del dispatch_queues[request.id]
    else:
        # Cascade to next
        next_mechanic_id = queue.pop(0)
        
        # Update request with new mechanic
        request.mechanic_id = next_mechanic_id
        request.status = RequestStatus.PENDING # reset to pending if it was declined
        db.commit()
        
        # Notify motorist
        await manager.send_personal_message(
            {"event": "cascade", "message": f"Cascading to next mechanic..."},
            client_id=request.motorist_id,
            client_type="motorist"
        )
        
        # Notify new mechanic
        await manager.send_personal_message(
            {
                "event": "new_request",
                "request_id": request.id,
                "issue_description": request.issue_description,
                "vehicle_class": request.vehicle_class
            },
            client_id=next_mechanic_id,
            client_type="mechanic"
        )
        
        # Spawn next timer recursively
        asyncio.create_task(dispatch_timer(request.id, next_mechanic_id))


async def initiate_dispatch(db: Session, motorist_id: str, mechanic_ids: list, issue_desc: str, vehicle_class: str, background_tasks: BackgroundTasks) -> ServiceRequest:
    if not mechanic_ids:
        raise ValueError("No mechanics provided for dispatch")
        
    first_mechanic = mechanic_ids.pop(0)
    # Create the request
    req = ServiceRequest(
        motorist_id=motorist_id,
        mechanic_id=first_mechanic,
        issue_description=issue_desc,
        vehicle_class=vehicle_class,
        status=RequestStatus.PENDING
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    
    dispatch_queues[req.id] = mechanic_ids
    
    # Notify the first mechanic via WebSocket
    await manager.send_personal_message(
        {
            "event": "new_request",
            "request_id": req.id,
            "issue_description": req.issue_description,
            "vehicle_class": req.vehicle_class
        },
        client_id=first_mechanic,
        client_type="mechanic"
    )
    
    # Start the 90-second countdown in the background
    background_tasks.add_task(dispatch_timer, req.id, first_mechanic)
    
    return req

async def process_mechanic_response(db: Session, request_id: str, mechanic_id: str, action: str):
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise ValueError("Request not found")
        
    if req.status != RequestStatus.PENDING:
        raise ValueError(f"Request is no longer pending (Current status: {req.status})")
        
    if str(req.mechanic_id) != str(mechanic_id):
        raise ValueError("Mechanic mismatch or request already cascaded")

    if action == "ACCEPT":
        req.status = RequestStatus.ACCEPTED
        db.commit()
        
        # Notify Motorist
        await manager.send_personal_message(
            {"event": "mechanic_accepted", "mechanic_id": mechanic_id, "request_id": request_id},
            client_id=req.motorist_id,
            client_type="motorist"
        )
        
        # Cleanup queue memory
        if req.id in dispatch_queues:
            del dispatch_queues[req.id]
            
        return {"status": "ACCEPTED"}
        
    elif action == "DECLINE":
        # Immediate cascade!
        logger.info(f"Mechanic {mechanic_id} declined. Triggering immediate cascade.")
        await trigger_cascade(req, db)
        
        return {"status": "CASCADED"}
    
    else:
        raise ValueError("Invalid action")
