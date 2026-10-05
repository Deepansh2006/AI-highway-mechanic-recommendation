import json
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from app.core.config import settings
from typing import List, Optional

# ---------- Pydantic Schema for Gemini Structured Output ----------

class EnhancedParsedIssue(BaseModel):
    """Extended schema: returns both technical fields (for RAG ranker) and
    user-facing diagnosis fields (for the frontend UI cards)."""
    # Technical fields used by the GraphRAG ranker
    primary_fault_category: str = Field(
        description="One of: TIRE_PUNCTURE, BATTERY_DEAD, ENGINE_OVERHEAT, FUEL_EMPTY, BRAKE_FAILURE, OTHER"
    )
    severity_score: int = Field(
        description="1 to 5 scale representing danger or urgency"
    )
    required_equipment: List[str] = Field(
        description="Tools or equipment needed based on the description"
    )
    extracted_keywords: List[str] = Field(
        description="Key noun phrases from the description for vector searching (e.g. 'flat tyre', 'smoking hood')"
    )
    # User-facing diagnosis fields for the frontend
    diagnosis_title: str = Field(
        description="Short human-readable title, e.g. 'Likely a tyre puncture or burst'"
    )
    diagnosis_confidence: str = Field(
        description="Exactly one of: High, Medium, Low"
    )
    recommended_service: str = Field(
        description="Short service label, e.g. 'Mobile tyre repair', 'Jump-start / battery check'"
    )
    diagnosis_explanation: str = Field(
        description="A detailed, reassuring 3-4 sentence explanation for the stranded driver. Explain the likely technical cause in simple terms, and include 1-2 safe, actionable self-checks or quick fixes they can try right now while waiting (e.g., checking battery terminals, looking at the fuel gauge, checking for leaks)."
    )
    mechanic_tip: str = Field(
        description="Practical tip for the mechanic who will arrive, mentioning tools and precautions"
    )


# ---------- Mapping helpers ----------

VEHICLE_MAP = {
    "car": "HATCHBACK",
    "bike": "TWO_WHEELER",
    "auto": "TWO_WHEELER",
    "truck": "TRUCK",
}

VEHICLE_MAP_REVERSE = {
    "TWO_WHEELER": "bike",
    "HATCHBACK": "car",
    "SEDAN": "car",
    "SUV": "car",
    "TRUCK": "truck",
}

CATEGORY_TO_ISSUE = {
    "TIRE_PUNCTURE": "flat",
    "BATTERY_DEAD": "battery",
    "ENGINE_OVERHEAT": "heat",
    "FUEL_EMPTY": "fuel",
    "BRAKE_FAILURE": "other",
    "OTHER": "other",
}

ISSUE_TO_CATEGORY = {
    "flat": "TIRE_PUNCTURE",
    "battery": "BATTERY_DEAD",
    "heat": "ENGINE_OVERHEAT",
    "start": "OTHER",
    "fuel": "FUEL_EMPTY",
    "tow": "OTHER",
    "other": "OTHER",
}

# ---------- Fallback rules (when no API key or API fails) ----------

_FALLBACK_RULES = {
    "flat": {
        "primary_fault_category": "TIRE_PUNCTURE",
        "severity_score": 3,
        "required_equipment": ["jack", "wheel spanner", "puncture kit"],
        "extracted_keywords": ["flat tyre", "puncture"],
        "diagnosis_title": "Likely a tyre puncture or burst",
        "diagnosis_confidence": "High",
        "recommended_service": "Mobile tyre repair",
        "diagnosis_explanation": "Your tyre has lost air pressure, likely due to a puncture or valve leak. While waiting, ensure you're parked safely away from traffic. If you have a spare wheel and feel confident, you can loosen the lug nuts before jacking up the car, but otherwise, our mechanic will handle it swiftly.",
        "mechanic_tip": "Bring a jack, wheel spanner and puncture kit. The driver may not have a usable spare.",
    },
    "battery": {
        "primary_fault_category": "BATTERY_DEAD",
        "severity_score": 3,
        "required_equipment": ["jump leads", "booster pack", "battery tester"],
        "extracted_keywords": ["dead battery", "won't start"],
        "diagnosis_title": "Likely a drained or weak battery",
        "diagnosis_confidence": "High",
        "recommended_service": "Jump-start / battery check",
        "diagnosis_explanation": "Your battery doesn't have enough charge to turn the starter motor. Turn off all lights, radio, and AC to save whatever power is left. You can open the hood to check if the battery terminals look loose or covered in white/blue crust, but don't touch them with bare hands.",
        "mechanic_tip": "Bring jump leads or a booster pack and a battery tester.",
    },
    "heat": {
        "primary_fault_category": "ENGINE_OVERHEAT",
        "severity_score": 4,
        "required_equipment": ["coolant", "hose clamps", "pressure tester"],
        "extracted_keywords": ["overheating", "steam", "radiator"],
        "diagnosis_title": "Likely a coolant or radiator problem",
        "diagnosis_confidence": "Medium",
        "recommended_service": "Cooling system repair",
        "diagnosis_explanation": "Your engine is running too hot, which can cause severe damage if driven further. Turn off the engine immediately and step away. DO NOT open the radiator cap, as boiling coolant can spray out. While waiting, you can check under the car for any dripping green or pink fluid.",
        "mechanic_tip": "Bring coolant, hose clamps and a pressure tester. Let the engine cool before opening the cap.",
    },
    "start": {
        "primary_fault_category": "OTHER",
        "severity_score": 3,
        "required_equipment": ["booster pack", "multimeter", "OBD scanner"],
        "extracted_keywords": ["won't start", "crank", "no start"],
        "diagnosis_title": "Could be battery, starter or fuel supply",
        "diagnosis_confidence": "Low",
        "recommended_service": "On-site diagnosis",
        "diagnosis_explanation": "The starter motor is engaging, but the engine isn't catching, which points to a fuel, spark, or sensor issue. Double-check your fuel gauge just in case. You can also try removing your key, locking and unlocking the car with the remote, and trying again in case the immobilizer is stuck.",
        "mechanic_tip": "Bring a booster pack, multimeter and OBD scanner.",
    },
    "fuel": {
        "primary_fault_category": "FUEL_EMPTY",
        "severity_score": 2,
        "required_equipment": ["fuel can"],
        "extracted_keywords": ["out of fuel", "empty tank"],
        "diagnosis_title": "You've likely run out of fuel",
        "diagnosis_confidence": "High",
        "recommended_service": "Fuel delivery",
        "diagnosis_explanation": "Your engine has been starved of fuel. Turn on your hazard lights and stay safe. Double-check that your vehicle isn't parked on a steep incline, which can sometimes cause the fuel pump to suck air even if there's a little fuel left.",
        "mechanic_tip": "Confirm petrol or diesel with the driver before setting off.",
    },
    "tow": {
        "primary_fault_category": "OTHER",
        "severity_score": 4,
        "required_equipment": ["tow kit", "safety cones"],
        "extracted_keywords": ["accident", "towing", "collision"],
        "diagnosis_title": "Your vehicle may need towing",
        "diagnosis_confidence": "Medium",
        "recommended_service": "Towing & recovery",
        "diagnosis_explanation": "Due to the situation, your vehicle is not safe to drive and needs to be moved via a flatbed or tow truck. If anyone is injured, please dial 112 immediately. Turn on your hazard lights, exit the vehicle if it's safe to do so, and wait behind a barrier.",
        "mechanic_tip": "Check for injuries first. Bring cones and the tow kit.",
    },
    "other": {
        "primary_fault_category": "OTHER",
        "severity_score": 3,
        "required_equipment": ["general toolkit", "diagnostic scanner"],
        "extracted_keywords": ["vehicle problem"],
        "diagnosis_title": "Not enough information yet",
        "diagnosis_confidence": "Low",
        "recommended_service": "General roadside assistance",
        "diagnosis_explanation": "Based on the details, the exact cause isn't clear yet, but a professional mechanic will inspect the vehicle. While you wait, observe if there are any strange smells (like burning rubber or sweet syrup) or warning lights on your dashboard to tell the mechanic when they arrive.",
        "mechanic_tip": "No clear symptoms reported. Bring a general toolkit and diagnostic scanner.",
    },
}


def parse_breakdown_issue(raw_text: str, issue_hint: Optional[str] = None) -> dict:
    """
    Takes a raw driver distress message and uses Gemini 2.5 Flash to extract
    structured JSON with both technical fields (for the ranker) and user-facing
    diagnosis fields (for the frontend).

    Args:
        raw_text: The driver's description of the problem.
        issue_hint: Optional frontend issue type (flat/battery/heat/start/fuel/tow/other)
                    to help the AI produce more accurate results.
    """
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "your_gemini_api_key_here":
        # Fallback: use rule-based diagnosis when no API key
        key = issue_hint if issue_hint and issue_hint in _FALLBACK_RULES else "other"
        fallback = dict(_FALLBACK_RULES[key])
        if raw_text.strip():
            fallback["extracted_keywords"] = [raw_text]
        fallback["fallback_used"] = True
        return fallback

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    issue_context = ""
    if issue_hint and issue_hint != "other":
        issue_context = f"\nThe driver also selected '{issue_hint}' as the problem category."

    prompt = f"""
    You are an expert, highly knowledgeable mechanic AI dispatcher for a highway roadside assistance service.
    Read the following distress call from a stranded driver.

    1. Extract the core problem and classify it into one of: TIRE_PUNCTURE, BATTERY_DEAD, ENGINE_OVERHEAT, FUEL_EMPTY, BRAKE_FAILURE, OTHER.
    2. Rate the severity (1-5) based on danger and urgency.
    3. List tools a mechanic should bring.
    4. Pull out search keywords for finding the right mechanic.
    5. Write a short, reassuring diagnosis title (like "Likely a tyre puncture or burst").
    6. Set confidence to exactly "High", "Medium", or "Low" based on how certain the diagnosis is.
    7. Name the recommended service (like "Mobile tyre repair").
    8. Write a detailed, highly accurate, and reassuring 3-4 sentence explanation for the driver. Explain the likely technical cause in simple terms. Crucially, include 1 or 2 safe, actionable self-checks or quick fixes they can try right now while waiting (e.g., checking battery terminals, looking at the fuel gauge, listening for specific clicks, checking for leaks). Make them feel empowered and informed.
    9. Write a practical tip for the mechanic who will arrive.

    Distress Call: "{raw_text}"
    {issue_context}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=EnhancedParsedIssue,
                temperature=0.1
            )
        )
        result = json.loads(response.text)
        # Validate confidence is one of the expected values
        if result.get("diagnosis_confidence") not in ("High", "Medium", "Low"):
            result["diagnosis_confidence"] = "Medium"
        return result
    except Exception as e:
        print(f"Error in AI parser: {e}")
        # Fallback to rules
        key = issue_hint if issue_hint and issue_hint in _FALLBACK_RULES else "other"
        fallback = dict(_FALLBACK_RULES[key])
        if raw_text.strip():
            fallback["extracted_keywords"] = [raw_text]
        fallback["error"] = str(e)
        return fallback


def build_frontend_diagnosis(parsed: dict, issue_hint: Optional[str] = None) -> dict:
    """
    Transforms the enhanced parsed issue into the exact Diagnosis shape
    the frontend expects:
    { issue, title, confidence, service, body, mechanic_tip }
    """
    # Map category back to frontend issue type
    category = parsed.get("primary_fault_category", "OTHER")
    issue = CATEGORY_TO_ISSUE.get(category, "other")
    # Prefer the hint if provided
    if issue_hint and issue_hint != "other":
        issue = issue_hint

    return {
        "issue": issue,
        "title": parsed.get("diagnosis_title", "Checking the problem…"),
        "confidence": parsed.get("diagnosis_confidence", "Medium"),
        "service": parsed.get("recommended_service", "Roadside assistance"),
        "body": parsed.get("diagnosis_explanation", "A mechanic is on the way to help."),
        "mechanic_tip": parsed.get("mechanic_tip", "Bring a general toolkit."),
    }
