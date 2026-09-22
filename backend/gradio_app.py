# pyrefly: ignore [missing-import]
import gradio as gr
import requests
import json

API_URL = "http://127.0.0.1:8000/api/v1/recommendations/search"

def get_recommendations(lat, lng, issue_desc, vehicle_class):
    payload = {
        "driver_latitude": float(lat),
        "driver_longitude": float(lng),
        "issue_description": issue_desc,
        "vehicle_class": vehicle_class
    }
    
    try:
        response = requests.post(API_URL, json=payload)
        response.raise_for_status()
        data = response.json()
        
        # Format the Parsed Issue for Display
        parsed = data.get("parsed_issue", {})
        parsed_md = f"""### AI Issue Analysis
**Primary Category:** {parsed.get('primary_fault_category')}
**Severity Score:** {parsed.get('severity_score')}/5
**Extracted Keywords:** {', '.join(parsed.get('extracted_keywords', []))}
**Required Equipment:** {', '.join(parsed.get('required_equipment', []))}
"""
        
        # Format the Recommendations for Display
        recs = data.get("recommendations", [])
        if not recs:
            recs_md = "### No mechanics found within 25km for this vehicle type."
        else:
            recs_md = "### Top Recommended Mechanics\n"
            for i, r in enumerate(recs):
                recs_md += f"""
#### #{i+1} {r.get('business_name')} (★ {r.get('base_rating')}/5)
- **Distance:** {r.get('distance_km')} km away
- **Matched Capabilities:** {', '.join(r.get('matched_capabilities', [])[:5])}...
- **Mechanic Payout:** ₹{r.get('estimated_fare')}
- **Platform Fee:** ₹{r.get('platform_fee')}
- **Total User Cost:** **₹{r.get('total_user_cost')}**
- **Phone:** {r.get('phone_number')}
- *AI Rationale:* {r.get('rationale')}
---"""
                
        return parsed_md, recs_md, data # Return raw JSON as well for debugging
        
    except Exception as e:
        return f"Error: {str(e)}", "Please ensure the FastAPI backend is running.", {}

# Define the Gradio Interface
with gr.Blocks(title="Smart Breakdown AI") as demo:
    gr.Markdown("# 🚗 Smart Breakdown Dispatch AI")
    gr.Markdown("Test the GraphRAG Recommendation Engine. Ensure your FastAPI server is running on port 8000.")
    
    with gr.Row():
        with gr.Column(scale=1):
            gr.Markdown("### Enter Driver Details")
            lat_input = gr.Number(label="Latitude (e.g. 26.7719)", value=26.7719)
            lng_input = gr.Number(label="Longitude (e.g. 75.8331)", value=75.8331)
            vehicle_input = gr.Dropdown(
                choices=["TWO_WHEELER", "HATCHBACK", "SEDAN", "SUV", "TRUCK"],
                label="Vehicle Class", 
                value="TWO_WHEELER"
            )
            issue_input = gr.Textbox(
                label="Issue Description (Voice/Text)", 
                lines=4, 
                value="Bike tyre punctured near Sitapura Industrial Area. Rear tyre completely flat, cannot ride."
            )
            submit_btn = gr.Button("Find Mechanics", variant="primary")
            
        with gr.Column(scale=2):
            gr.Markdown("### AI Output")
            parsed_output = gr.Markdown()
            recs_output = gr.Markdown()
            
    with gr.Accordion("Raw JSON Response (For Developers)", open=False):
        json_output = gr.JSON()
        
    submit_btn.click(
        fn=get_recommendations,
        inputs=[lat_input, lng_input, issue_input, vehicle_input],
        outputs=[parsed_output, recs_output, json_output]
    )

if __name__ == "__main__":
    demo.launch(server_port=7860, share=True, theme=gr.themes.Soft())
