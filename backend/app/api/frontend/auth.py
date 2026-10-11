"""
Authentication endpoints matching API_CONTRACT.md:
POST /api/auth/otp/send
POST /api/auth/otp/verify
"""
import uuid
import re
from fastapi import APIRouter, HTTPException
from app.schemas.frontend import (
    OtpSendInput,
    OtpChallengeResponse,
    OtpVerifyInput,
    SessionResponse,
)
from app.core.config import settings

router = APIRouter()

DEMO_CODES = {"4827", "123456"}
_challenges: dict[str, dict] = {}


@router.post("/otp/send", response_model=OtpChallengeResponse)
def send_otp(data: OtpSendInput):
    if data.role == "admin":
        if not data.email or not re.match(r".+@.+\..+", data.email):
            raise HTTPException(status_code=400, detail="Enter your work email.")
        if not data.password:
            raise HTTPException(status_code=400, detail="Enter your password.")
        sent_to = "your authenticator app"
    else:
        clean_phone = re.sub(r"\D", "", data.phone or "")
        if len(clean_phone) != 10:
            raise HTTPException(status_code=400, detail="Enter a 10-digit mobile number.")
        sent_to = f"+91 {clean_phone[:5]} ••{clean_phone[7:]}"

    challenge_id = uuid.uuid4().hex[:10]
    _challenges[challenge_id] = {
        "role": data.role,
        "phone": clean_phone if data.role != "admin" else None,
        "attempts": 3,
        "code": "4827",
    }

    return OtpChallengeResponse(
        challenge_id=challenge_id,
        sent_to=sent_to,
        expires_in_s=600,
        demo_code="4827" if settings.OTP_DEMO_MODE else None,
    )


@router.post("/otp/verify", response_model=SessionResponse)
def verify_otp(data: OtpVerifyInput):
    c = _challenges.get(data.challenge_id)
    if not c:
        raise HTTPException(status_code=410, detail="This code has expired. Request a new one.")

    if data.code != c["code"] and data.code not in DEMO_CODES:
        c["attempts"] -= 1
        if c["attempts"] <= 0:
            _challenges.pop(data.challenge_id, None)
            raise HTTPException(status_code=429, detail="Too many wrong attempts. Request a new code.")
        raise HTTPException(
            status_code=422,
            detail=f"That code didn't match. {c['attempts']} attempt{'s' if c['attempts'] != 1 else ''} left.",
        )

    role = c["role"]
    phone = c.get("phone")
    _challenges.pop(data.challenge_id, None)

    name = "Driver"
    mechanic_id = None

    if role == "mechanic":
        from app.core.database import SessionLocal
        from app.models.graph import MechanicNode
        db = SessionLocal()
        try:
            mech = None
            if phone:
                mech = db.query(MechanicNode).filter(MechanicNode.phone_number == phone).first()
                if not mech:
                    mech = db.query(MechanicNode).filter(MechanicNode.phone_number.ilike(f"%{phone}%")).first()

            if not mech:
                mech = db.query(MechanicNode).first()

            if mech:
                mechanic_id = str(mech.id)
                name = mech.owner_name or mech.business_name
            else:
                mechanic_id = "m1"
                name = "Ramesh Sharma"
        finally:
            db.close()
    elif role == "admin":
        name = "Control room"

    token = f"sb-token-{uuid.uuid4().hex}"

    return SessionResponse(
        role=role,
        name=name,
        mechanic_id=mechanic_id,
        token=token,
    )
