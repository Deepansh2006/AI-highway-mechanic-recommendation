"""
Concept Enrichment Script
-------------------------
Uses Gemini LLM to infer fine-grained mechanical capabilities from each mechanic's
business name and broad Google Maps categories, then creates new ConceptNodes with
384-dim embeddings and links them to the mechanics.

Run once: python -m app.db.enrich_concepts
"""
import sys
import os
import json

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from google import genai
from google.genai import types
from sentence_transformers import SentenceTransformer
from app.core.database import SessionLocal
from app.core.config import settings
from app.models.graph import MechanicNode, ConceptNode

print("Loading Embedding Model...")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

client = genai.Client(api_key=settings.GEMINI_API_KEY)


def enrich_concepts():
    db = SessionLocal()
    mechanics = db.query(MechanicNode).all()

    # Build a compact summary of all mechanics for the LLM
    mechanic_summaries = []
    for m in mechanics:
        caps = [c.name for c in m.capabilities]
        mechanic_summaries.append({
            "business_name": m.business_name,
            "existing_categories": caps
        })

    # Batch into groups of 20 to stay within context limits
    batch_size = 20
    all_inferred = []

    for i in range(0, len(mechanic_summaries), batch_size):
        batch = mechanic_summaries[i:i + batch_size]
        print(f"Enriching batch {i // batch_size + 1} ({len(batch)} mechanics)...")

        prompt = f"""
You are an expert automotive industry analyst. For each mechanic below, infer 3-5 SPECIFIC 
mechanical service capabilities they likely offer, based on their business name and broad categories.

Use precise terms like these (pick what fits):
- tyre puncture repair, wheel alignment, tyre replacement
- engine diagnostics, engine repair, engine overhaul
- battery replacement, battery jumpstart, electrical repair
- brake service, brake pad replacement, brake fluid change
- oil change, oil filter replacement
- AC repair, AC gas refill
- suspension repair, shock absorber replacement
- clutch repair, transmission repair, gearbox service
- radiator repair, coolant flush
- body work, denting painting
- roadside assistance, towing service, mobile mechanic
- bike chain repair, bike engine repair, bike tyre repair (for bike shops)

IMPORTANT RULES:
- If the name contains "Bike" or categories mention "bike", infer BIKE-specific skills
- If the name contains "Car" or categories mention "car", infer CAR-specific skills
- Always include at least one very specific skill (not just "car repair")

Return ONLY a JSON array. Each element: {{"business_name": "...", "inferred_skills": ["skill1", "skill2", ...]}}

Mechanics:
{json.dumps(batch, indent=2)}
"""
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2
            )
        )

        try:
            batch_results = json.loads(response.text)
            all_inferred.extend(batch_results)
        except Exception as e:
            print(f"  Error parsing batch: {e}")
            continue

    # Now create ConceptNodes for all inferred skills and link them
    concept_cache = {}
    linked_count = 0

    for entry in all_inferred:
        bname = entry.get("business_name", "")
        skills = entry.get("inferred_skills", [])

        # Find the mechanic in DB
        mechanic = db.query(MechanicNode).filter(MechanicNode.business_name == bname).first()
        if not mechanic:
            print(f"  Mechanic '{bname}' not found in DB, skipping.")
            continue

        existing_concept_names = {c.name.lower() for c in mechanic.capabilities}

        for skill in skills:
            skill = skill.strip()
            if not skill or skill.lower() in existing_concept_names:
                continue

            # Check cache or DB for existing concept
            if skill not in concept_cache:
                existing = db.query(ConceptNode).filter(ConceptNode.name == skill).first()
                if not existing:
                    embedding = embedding_model.encode(skill).tolist()
                    new_concept = ConceptNode(
                        name=skill,
                        category='INFERRED_SERVICE',
                        embedding=embedding
                    )
                    db.add(new_concept)
                    db.flush()
                    concept_cache[skill] = new_concept
                else:
                    concept_cache[skill] = existing

            concept = concept_cache[skill]
            if concept not in mechanic.capabilities:
                mechanic.capabilities.append(concept)
                linked_count += 1

    db.commit()
    new_concepts = len(concept_cache)
    print(f"\nEnrichment complete!")
    print(f"  New ConceptNodes created: {new_concepts}")
    print(f"  New edges linked: {linked_count}")
    db.close()


if __name__ == "__main__":
    enrich_concepts()
