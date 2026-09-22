import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.config import settings
from typing import List

class ParsedIssue(BaseModel):
    primary_fault_category: str = Field(description="One of: TIRE_PUNCTURE, BATTERY_DEAD, ENGINE_OVERHEAT, FUEL_EMPTY, BRAKE_FAILURE, OTHER")
    severity_score: int = Field(description="1 to 5 scale representing danger or urgency")
    required_equipment: List[str] = Field(description="Tools or equipment needed based on the description")
    extracted_keywords: List[str] = Field(description="Key noun phrases from the description for vector searching (e.g. 'flat tyre', 'smoking hood')")

def parse_breakdown_issue(raw_text: str) -> dict:
    """
    Takes a raw driver distress message and uses Gemini 2.5 Flash to extract structured JSON.
    """
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        # Fallback dummy parser if no API key is provided
        return {
            "primary_fault_category": "UNKNOWN",
            "severity_score": 3,
            "required_equipment": [],
            "extracted_keywords": [raw_text],
            "fallback_used": True
        }
        
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    
    prompt = f"""
    You are an expert mechanic AI dispatcher. Read the following distress call from a stranded driver on a highway.
    Extract the core problem, rate the severity (1-5), deduce any tools a mechanic might need, and pull out search keywords.
    
    Distress Call: "{raw_text}"
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ParsedIssue,
            temperature=0.1
        )
    )
    
    try:
        return json.loads(response.text)
    except Exception as e:
        print(f"Error parsing JSON: {e}")
        return {
            "primary_fault_category": "UNKNOWN",
            "severity_score": 3,
            "required_equipment": [],
            "extracted_keywords": [raw_text],
            "error": str(e)
        }
