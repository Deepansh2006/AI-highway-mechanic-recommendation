import sys
import os

# Adjust sys path so we can import from app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.graph import MechanicNode, ConceptNode
# pyrefly: ignore [missing-import]
from pyvis.network import Network

def visualize_interactive_graph():
    print("Connecting to database to fetch Graph Nodes and Edges...")
    db = SessionLocal()
    
    # Create an interactive pyvis network
    net = Network(height="800px", width="100%", bgcolor="#222222", font_color="white", select_menu=True, filter_menu=True, cdn_resources='remote')
    
    # Optional: use a physics layout for interactive bouncy graph
    net.force_atlas_2based()
    
    mechanics = db.query(MechanicNode).all()
    print(f"Adding {len(mechanics)} Mechanics and their Capabilities to Interactive Web Graph...")
    
    for mechanic in mechanics:
        # Add mechanic node (blue)
        net.add_node(mechanic.business_name, label=mechanic.business_name, title="Mechanic", color="#4db6ac", size=20)
        
        for concept in mechanic.capabilities:
            # Add concept node (red)
            # Pyvis will ignore adding the node if it already exists
            net.add_node(concept.name, label=concept.name, title=f"Concept: {concept.category}", color="#e57373", size=15)
            # Draw edge
            net.add_edge(mechanic.business_name, concept.name, color="#555555")
            
    db.close()

    output_path = "../interactive_kg.html"
    print(f"Generating interactive HTML file...")
    net.show(output_path, notebook=False)
    print(f"✅ Success! Open this file in your browser: {os.path.abspath(output_path)}")

if __name__ == "__main__":
    visualize_interactive_graph()
