import sys
import os
import pandas as pd
from sentence_transformers import SentenceTransformer

# Adjust sys path so we can import from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.core.database import SessionLocal, engine
from app.models.graph import Base, MechanicNode, ConceptNode
# pyrefly: ignore [missing-import]
from geoalchemy2.elements import WKTElement

print("Loading Sentence Transformer model (this may take a minute)...")
model = SentenceTransformer('all-MiniLM-L6-v2')

def create_tables():
    print("Creating tables in PostgreSQL...")
    Base.metadata.create_all(bind=engine)

def seed_data():
    print("Reading jaipur_mechanics_dataset.xlsx...")
    file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), 'jaipur_mechanics_dataset.xlsx')
    df = pd.read_excel(file_path)

    db = SessionLocal()
    
    # Keep track of created concepts to avoid duplicate inserts in this session
    concept_cache = {}

    print(f"Seeding {len(df)} mechanics into the Knowledge Graph...")
    for index, row in df.iterrows():
        # 1. Create MechanicNode
        lat = row['Latitude']
        lng = row['Longitude']
        point = f"POINT({lng} {lat})" # WKT format is Longitude Latitude
        
        mechanic = MechanicNode(
            business_name=row['Mechanic Name'],
            phone_number=str(row['Phone Number']),
            latitude=lat,
            longitude=lng,
            location=WKTElement(point, srid=4326),
            base_rating=float(row['Rating']) if pd.notna(row['Rating']) else 4.0,
            total_reviews=int(row['Rating Count']) if pd.notna(row['Rating Count']) else 0
        )
        
        # 2. Extract ConceptNodes (from Category/Specialization)
        specializations_raw = str(row['Category/Specialization'])
        
        if pd.notna(specializations_raw):
            # Split by comma or slash to get individual concepts
            specs = [s.strip() for s in specializations_raw.replace('/', ',').split(',')]
            for spec_name in specs:
                if not spec_name:
                    continue
                
                # Check cache first
                if spec_name not in concept_cache:
                    # Check database if it exists
                    existing_concept = db.query(ConceptNode).filter(ConceptNode.name == spec_name).first()
                    if not existing_concept:
                        # Generate vector embedding!
                        embedding = model.encode(spec_name).tolist()
                        
                        new_concept = ConceptNode(
                            name=spec_name,
                            category='SERVICE',
                            embedding=embedding
                        )
                        db.add(new_concept)
                        db.flush() # Flush to get ID
                        concept_cache[spec_name] = new_concept
                    else:
                        concept_cache[spec_name] = existing_concept
                
                # Create Edge: link mechanic to this concept
                concept = concept_cache[spec_name]
                mechanic.capabilities.append(concept)
        
        db.add(mechanic)
        
    db.commit()
    print("✅ Graph seeding complete!")
    db.close()

if __name__ == "__main__":
    create_tables()
    seed_data()
