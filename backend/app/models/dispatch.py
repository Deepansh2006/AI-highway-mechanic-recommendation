from sqlalchemy import Column, String, Float, Integer, Boolean, ForeignKey, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
import uuid

from app.models.graph import Base

class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"       # 90s lock is active
    ACCEPTED = "ACCEPTED"     # Mechanic accepted
    DECLINED = "DECLINED"     # Mechanic explicitly declined
    EXPIRED = "EXPIRED"       # 90s timeout reached
    EN_ROUTE = "EN_ROUTE"     # Mechanic is on the way (post-acceptance)
    COMPLETED = "COMPLETED"   # Job done
    FAILED = "FAILED"         # All mechanics declined/timed out
    ARRIVED = "ARRIVED"       # Mechanic has arrived at driver location
    REPAIRING = "REPAIRING"   # Repair work in progress
    BILLING = "BILLING"       # Mechanic sent the bill
    CANCELLED = "CANCELLED"   # Driver cancelled the request
    UNASSIGNED = "UNASSIGNED" # No mechanic available

class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    motorist_id = Column(String, index=True) # ID or phone number of motorist
    mechanic_id = Column(UUID(as_uuid=True), ForeignKey("mechanics.id"))
    
    issue_description = Column(String)
    vehicle_class = Column(String)
    
    status = Column(SQLEnum(RequestStatus), default=RequestStatus.PENDING)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationship to MechanicNode
    mechanic = relationship("MechanicNode")

    # Extended fields for frontend integration
    vehicle = Column(String(20), nullable=True)          # car/bike/auto/truck
    issue = Column(String(20), nullable=True)            # flat/battery/heat/start/fuel/tow/other
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    location_label = Column(String(500), nullable=True)
    diagnosis_json = Column(String, nullable=True)       # JSON-serialized diagnosis
    verification_code = Column(String(6), nullable=True) # 4-digit code
    accept_deadline = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    arrived_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    line_items_json = Column(String, nullable=True)      # JSON-serialized bill items
    final_amount = Column(Float, nullable=True)
    payment_method = Column(String(10), nullable=True)   # upi/cash
    reassigned = Column(Boolean, default=False)
    previous_mechanic_name = Column(String(255), nullable=True)
    distance_km = Column(Float, nullable=True)
    eta_min = Column(Integer, nullable=True)
    price_min = Column(Float, nullable=True)
    price_max = Column(Float, nullable=True)
    driver_name = Column(String(255), nullable=True)
    driver_vehicle_model = Column(String(255), nullable=True)
    driver_plate = Column(String(20), nullable=True)
    mechanic_live_lat = Column(Float, nullable=True)     # Live mechanic location
    mechanic_live_lng = Column(Float, nullable=True)
