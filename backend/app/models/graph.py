import uuid
from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, Table, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.sql import func
# pyrefly: ignore [missing-import]
from pgvector.sqlalchemy import Vector
# pyrefly: ignore [missing-import]
from geoalchemy2 import Geography

Base = declarative_base()

# Many-to-Many Association Table linking Mechanics to Concepts (Capabilities/Tools)
mechanic_concept_link = Table(
    'mechanic_concept_link',
    Base.metadata,
    Column('mechanic_id', UUID(as_uuid=True), ForeignKey('mechanics.id'), primary_key=True),
    Column('concept_id', UUID(as_uuid=True), ForeignKey('concepts.id'), primary_key=True)
)

class MechanicNode(Base):
    """
    Graph Node representing a Mechanic.
    Stores spatial location and basic profile details.
    """
    __tablename__ = "mechanics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_name = Column(String(255), nullable=False)
    phone_number = Column(String(20), nullable=False)
    
    # PostGIS spatial column for exact location
    location = Column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    
    # Keeping raw lat/long for easy JSON serialization in Gradio API
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    
    is_online = Column(Boolean, default=True)
    is_active_job = Column(Boolean, default=False)
    base_rating = Column(Float, default=4.50)
    total_reviews = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Edges: A mechanic has multiple Concepts (tools/skills)
    capabilities = relationship("ConceptNode", secondary=mechanic_concept_link, back_populates="mechanics")


class ConceptNode(Base):
    """
    Graph Node representing an Open Mechanical Concept.
    This can be a tool (e.g., 'Hydraulic Jack'), a fault (e.g., 'Tire Puncture'), or a vehicle type.
    """
    __tablename__ = "concepts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), unique=True, nullable=False)
    category = Column(String(100)) # e.g., 'TOOL', 'FAULT', 'VEHICLE_TYPE'
    
    # pgvector embedding of the concept name and description (using sentence-transformers 384d)
    embedding = Column(Vector(384))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Edges: A concept is connected to multiple mechanics who possess it
    mechanics = relationship("MechanicNode", secondary=mechanic_concept_link, back_populates="capabilities")
