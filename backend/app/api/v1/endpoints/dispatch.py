from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Any

from app.core.database import get_db
from app.models.dispatch import ServiceRequest
from app.schemas.dispatch import InitiateDispatchRequest, MechanicResponse
from app.services.dispatch_manager import initiate_dispatch, process_mechanic_response
from app.core.websockets import manager

router = APIRouter()

@router.post("/request")
async def request_dispatch(
    data: InitiateDispatchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
) -> Any:
    """
    Motorist initiates a dispatch request to a list of recommended mechanics.
    """
    try:
        req = await initiate_dispatch(
            db=db,
            motorist_id=data.motorist_id,
            mechanic_ids=data.mechanic_ids,
            issue_desc=data.issue_description,
            vehicle_class=data.vehicle_class,
            background_tasks=background_tasks
        )
        return {"request_id": req.id, "status": req.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{request_id}/respond")
async def respond_to_dispatch(
    request_id: str,
    data: MechanicResponse,
    db: Session = Depends(get_db)
) -> Any:
    """
    Mechanic accepts or declines the dispatch request.
    """
    try:
        result = await process_mechanic_response(
            db=db,
            request_id=request_id,
            mechanic_id=data.mechanic_id,
            action=data.action
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{request_id}")
async def get_dispatch_status(request_id: str, db: Session = Depends(get_db)):
    """
    Get the current status and assigned mechanic for a request (useful for polling UIs).
    """
    req = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return {
        "request_id": req.id,
        "status": req.status,
        "mechanic_id": req.mechanic_id
    }


@router.websocket("/ws/motorist/{client_id}")
async def websocket_motorist(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id, "motorist")
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id, "motorist")


@router.websocket("/ws/mechanic/{client_id}")
async def websocket_mechanic(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id, "mechanic")
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(client_id, "mechanic")
