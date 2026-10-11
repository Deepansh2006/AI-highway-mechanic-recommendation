"""
Feedback and past requests endpoints matching API_CONTRACT.md:
POST /api/feedback
GET  /api/requests?mine=true
POST /api/requests/{id}/report
"""
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.dispatch import ServiceRequest, RequestStatus
from app.schemas.frontend import FeedbackInput, PastRequestResponse

router = APIRouter()
requests_router = APIRouter()

# In-memory store for feedback & reports
_feedbacks = []
_reports = []


class ReportInput(BaseModel):
    category: str
    details: str = ""


@router.post("", response_model=dict)
@router.post("/", response_model=dict)
def submit_feedback(data: FeedbackInput, db: Session = Depends(get_db)):
    _feedbacks.append(data.model_dump())
    return {"status": "ok", "message": "Feedback submitted successfully"}


@requests_router.get("", response_model=List[PastRequestResponse])
@requests_router.get("/", response_model=List[PastRequestResponse])
def get_past_requests(mine: bool = Query(False), db: Session = Depends(get_db)):
    # Query completed requests from database
    results: List[PastRequestResponse] = []
    
    db_requests = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.status == RequestStatus.COMPLETED)
        .order_by(ServiceRequest.completed_at.desc())
        .limit(20)
        .all()
    )

    rated_map = {f["request_id"]: f["rating"] for f in _feedbacks if f.get("rating", 0) > 0}

    for req in db_requests:
        results.append(
            PastRequestResponse(
                id=str(req.id),
                issue_label=str(req.issue or "Roadside assistance"),
                mechanic_name=str(req.mechanic.business_name if req.mechanic else "Assigned Mechanic"),
                date=req.completed_at.strftime("%d %b") if req.completed_at else "Recently",
                rated=rated_map.get(str(req.id)),
            )
        )

    # Fallback default seed past requests if database has none
    if not results:
        results = [
            PastRequestResponse(
                id="JPR-2041",
                issue_label="Flat tyre",
                mechanic_name="Sharma Auto Works",
                date="Today",
                rated=None,
            ),
            PastRequestResponse(
                id="JPR-1987",
                issue_label="Battery jump-start",
                mechanic_name="Highway Quick Fix",
                date="12 Sep",
                rated=5,
            ),
        ]

    return results


@requests_router.post("/{request_id}/report", response_model=dict)
def report_request_issue(request_id: str, report: ReportInput):
    _reports.append({"request_id": request_id, **report.model_dump()})
    return {"status": "ok", "message": "Report received"}
