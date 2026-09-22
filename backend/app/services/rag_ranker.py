from sqlalchemy.orm import Session
from sqlalchemy import text
from sentence_transformers import SentenceTransformer
from app.schemas.recommend import MechanicRecommendation
from typing import List, Optional

print("Loading Embedding Model for GraphRAG Engine...")
try:
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
except Exception as e:
    print(f"Error loading model: {e}")
    embedding_model = None


def _build_vehicle_filter(vehicle_class: Optional[str]) -> str:
    """
    Hard filter based on vehicle_class:
    - TWO_WHEELER: only show mechanics with at least one bike/motorcycle concept
    - SEDAN/SUV/HATCHBACK/TRUCK: exclude mechanics whose ONLY concepts are bike-specific
    """
    if not vehicle_class:
        return ""

    vc = vehicle_class.upper()

    if vc == "TWO_WHEELER":
        # Must have at least one bike-related concept
        return """
        AND md.mechanic_id IN (
            SELECT mcl_f.mechanic_id FROM mechanic_concept_link mcl_f
            JOIN concepts c_f ON mcl_f.concept_id = c_f.id
            WHERE LOWER(c_f.name) LIKE '%%bike%%'
               OR LOWER(c_f.name) LIKE '%%motorcycle%%'
               OR LOWER(c_f.name) LIKE '%%scooter%%'
               OR LOWER(c_f.name) LIKE '%%two wheeler%%'
        )
        """
    elif vc in ("SEDAN", "HATCHBACK", "SUV", "TRUCK"):
        # Exclude mechanics that ONLY have bike-specific concepts
        return """
        AND md.mechanic_id NOT IN (
            SELECT sub.mechanic_id FROM (
                SELECT mcl_f.mechanic_id,
                       bool_and(
                           LOWER(c_f.name) LIKE '%%bike%%'
                           OR LOWER(c_f.name) LIKE '%%motorcycle%%'
                           OR LOWER(c_f.name) LIKE '%%scooter%%'
                       ) AS all_bike
                FROM mechanic_concept_link mcl_f
                JOIN concepts c_f ON mcl_f.concept_id = c_f.id
                GROUP BY mcl_f.mechanic_id
            ) sub WHERE sub.all_bike = true
        )
        """
    return ""


def get_recommendations(
    db: Session,
    parsed_issue: dict,
    lat: float,
    lng: float,
    vehicle_class: Optional[str] = None,
    radius_km: float = 25.0
) -> List[MechanicRecommendation]:
    """
    Two-Stage Recommendation Engine (v2):
    Stage 1: Spatial Sweep (PostGIS) + Vehicle Class Hard Filter
    Stage 2: RAG Vector Semantic Re-Ranker (pgvector) with proximity-first scoring
    """

    keywords = parsed_issue.get("extracted_keywords", [])
    if not keywords:
        search_query = parsed_issue.get("primary_fault_category", "")
    else:
        search_query = " ".join(keywords)

    # Generate query embedding
    if embedding_model:
        query_vector = embedding_model.encode(search_query).tolist()
    else:
        query_vector = [0.0] * 384

    vector_str = "[" + ",".join(map(str, query_vector)) + "]"

    # Build vehicle class filter
    vehicle_filter = _build_vehicle_filter(vehicle_class)

    sql_query = text(f"""
        WITH mechanic_distances AS (
            SELECT
                m.id AS mechanic_id,
                m.business_name,
                m.phone_number,
                m.base_rating,
                ST_DistanceSphere(
                    m.location::geometry,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
                ) / 1000.0 AS distance_km
            FROM mechanics m
            WHERE ST_DWithin(
                m.location::geometry,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                :radius_meters
            )
        ),
        mechanic_scores AS (
            SELECT
                md.mechanic_id,
                md.business_name,
                md.phone_number,
                md.base_rating,
                md.distance_km,
                MIN(c.embedding <=> '{vector_str}'::vector) AS best_vector_distance,
                array_agg(DISTINCT c.name) AS matched_capabilities
            FROM mechanic_distances md
            JOIN mechanic_concept_link mcl ON md.mechanic_id = mcl.mechanic_id
            JOIN concepts c ON mcl.concept_id = c.id
            {vehicle_filter}
            GROUP BY md.mechanic_id, md.business_name, md.phone_number, md.base_rating, md.distance_km
        )
        SELECT
            mechanic_id,
            business_name,
            phone_number,
            base_rating,
            distance_km,
            matched_capabilities,
            -- Rebalanced Composite Score (v2):
            --   15% Rating  (was 40%)
            --   45% Proximity (was 30%) — closest mechanics win ties
            --   40% Vector Similarity (was 30%) — semantic match matters more
            ((base_rating / 5.0) * 15) +
            (((:radius_km - distance_km) / :radius_km) * 45) +
            (((2.0 - best_vector_distance) / 2.0) * 40) AS composite_score
        FROM mechanic_scores
        ORDER BY composite_score DESC
        LIMIT 3;
    """)

    results = db.execute(sql_query, {
        "lat": lat,
        "lng": lng,
        "radius_meters": radius_km * 1000,
        "radius_km": radius_km
    }).fetchall()

    # Fallback: if vehicle_class filter returned 0 results, retry without it
    if len(results) == 0 and vehicle_class:
        print(f"No results with vehicle filter '{vehicle_class}', falling back to unfiltered search...")
        return get_recommendations(db, parsed_issue, lat, lng, vehicle_class=None, radius_km=radius_km)

    # Severity Multiplier Logic
    severity = parsed_issue.get("severity_score", 3)
    if severity <= 2:
        severity_multiplier = 1.0
    elif severity == 3:
        severity_multiplier = 1.2
    elif severity == 4:
        severity_multiplier = 1.5
    else:
        severity_multiplier = 2.0

    # Vehicle Tier Pricing Logic
    vc = vehicle_class.upper() if vehicle_class else "UNKNOWN"
    if vc == "TWO_WHEELER":
        base_fee = 80
        per_km_rate = 10
    elif vc in ("HATCHBACK", "SEDAN"):
        base_fee = 150
        per_km_rate = 14
    elif vc == "SUV":
        base_fee = 200
        per_km_rate = 14
    elif vc == "TRUCK":
        base_fee = 400
        per_km_rate = 20
    else:
        base_fee = 150  # Default fallback
        per_km_rate = 14

    recommendations = []
    for r in results:
        # Dynamic Pricing Formula: (Base + Distance * Rate) * Multiplier
        distance = round(r.distance_km, 2)
        raw_fare = base_fee + (distance * per_km_rate)
        estimated_fare = round(raw_fare * severity_multiplier, 2)
        
        # Platform Commission (Flat convenience fee on top of the mechanic's fare)
        # Scaled slightly by vehicle type (Cars/Trucks pay a higher platform fee than bikes)
        if vc == "TWO_WHEELER":
            platform_fee = 30.0
        elif vc == "TRUCK":
            platform_fee = 100.0
        else:
            platform_fee = 50.0
            
        total_user_cost = round(estimated_fare + platform_fee, 2)
        
        recommendations.append(
            MechanicRecommendation(
                mechanic_id=str(r.mechanic_id),
                business_name=r.business_name,
                phone_number=r.phone_number,
                distance_km=distance,
                base_rating=float(r.base_rating),
                composite_score=round(float(r.composite_score), 2),
                matched_capabilities=r.matched_capabilities,
                estimated_fare=estimated_fare,
                platform_fee=platform_fee,
                total_user_cost=total_user_cost,
                rationale=f"Ranked #{len(recommendations)+1}: {', '.join(r.matched_capabilities[:3])} | {round(r.distance_km, 1)}km away | Rating {float(r.base_rating)}/5"
            )
        )

    return recommendations
