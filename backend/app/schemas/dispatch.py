from pydantic import BaseModel
from typing import List, Optional
from app.models.dispatch import RequestStatus

class InitiateDispatchRequest(BaseModel):
    motorist_id: str
    mechanic_ids: List[str] # Ordered list of recommended mechanics to cascade through
    issue_description: str
    vehicle_class: str

class MechanicResponse(BaseModel):
    mechanic_id: str
    action: str # "ACCEPT" or "DECLINE"

class DispatchStateResponse(BaseModel):
    request_id: str
    motorist_id: str
    current_mechanic_id: str
    status: RequestStatus
    queue_remaining: int
