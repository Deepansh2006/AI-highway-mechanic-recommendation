# 🔍 Deep Analysis: Backend AI ↔ Frontend Gap

## 1. What You Have (Backend — Your AI Part)

### Architecture
```
backend/
├── gradio_app.py              ← GRADIO UI (to be deleted)
├── .gradio/                   ← GRADIO cache (to be deleted)
├── app/
│   ├── main.py                ← FastAPI entry, CORS, 2 routers
│   ├── core/
│   │   ├── config.py          ← Settings (DB URL, Gemini key)
│   │   ├── database.py        ← SQLAlchemy engine + SessionLocal
│   │   └── websockets.py      ← ConnectionManager (motorist/mechanic WS)
│   ├── models/
│   │   ├── graph.py           ← MechanicNode, ConceptNode, mechanic_concept_link
│   │   └── dispatch.py        ← ServiceRequest model + RequestStatus enum
│   ├── schemas/
│   │   ├── recommend.py       ← BreakdownRequest, MechanicRecommendation, RecommendationResponse
│   │   └── dispatch.py        ← InitiateDispatchRequest, MechanicResponse
│   ├── services/
│   │   ├── ai_parser.py       ← Gemini 2.5 Flash → structured ParsedIssue
│   │   ├── rag_ranker.py      ← PostGIS + pgvector 2-stage ranking
│   │   └── dispatch_manager.py← 90s cascade state machine + WebSocket push
│   └── api/v1/endpoints/
│       ├── recommend.py       ← POST /api/v1/recommendations/search
│       └── dispatch.py        ← POST /request, POST /respond, GET /{id}, WS endpoints
```

### Your 2 existing API endpoints:
| Endpoint | Purpose |
|---|---|
| `POST /api/v1/recommendations/search` | AI parser + GraphRAG ranking → returns `parsed_issue` + `recommendations[]` |
| `POST /api/v1/dispatch/request` | Starts 90s cascade dispatch |
| `POST /api/v1/dispatch/{id}/respond` | Mechanic ACCEPT/DECLINE |
| `GET /api/v1/dispatch/{id}` | Poll status (PENDING/ACCEPTED/FAILED) |
| `WS /api/v1/dispatch/ws/motorist/{id}` | Real-time push to driver |
| `WS /api/v1/dispatch/ws/mechanic/{id}` | Real-time push to mechanic |

---

## 2. What The Frontend Expects (The Gap)

The frontend ([API_CONTRACT.md](file:///c:/Users/Dell/OneDrive/Desktop/final%20year/smart-breakdown-frontend%20(1)/smart-breakdown-frontend%20(1)/frontend/docs/API_CONTRACT.md)) expects a completely different API shape. Here's the mismatch:

### 🔴 CRITICAL MISMATCH: Recommendation Endpoint

**Frontend calls:** `POST /api/recommendations` (no `/v1/`)
**Backend has:** `POST /api/v1/recommendations/search`

**Frontend sends:**
```json
{ "lat": 26.8371, "lng": 75.5701, "vehicle": "car", "issue": "flat", "description": "loud bang", "sort": "best" }
```

**Backend expects:**
```json
{ "driver_latitude": 26.8371, "driver_longitude": 75.5701, "issue_description": "loud bang", "vehicle_class": "TWO_WHEELER" }
```

**Frontend expects back:**
```json
{
  "radius_km": 25,
  "diagnosis": {
    "issue": "flat",
    "title": "Likely a tyre puncture or burst",
    "confidence": "High",
    "service": "Mobile tyre repair",
    "body": "A mechanic with a mobile tyre van can fix...",
    "mechanic_tip": "Bring a jack, wheel spanner..."
  },
  "mechanics": [{
    "mechanic_id": "m1",
    "name": "Sharma Auto Works",
    "owner": "Ramesh Sharma",
    "initials": "SA",
    "rating": 4.8,
    "reviews": 312,
    "distance_km": 2.4,
    "eta_min": 9,
    "price_min": 300,
    "price_max": 600,
    "services_label": "Tyres · Battery · Mobile van",
    "vehicle_label": "Mobile van",
    "plate": "RJ14 GC 4471",
    "verified": true,
    "is_best": true,
    "reasons": [
      { "label": "Distance", "value": "2.4 km from you" },
      { "label": "Matching service", "value": "Tyre repair" }
    ]
  }]
}
```

**Backend currently returns:**
```json
{
  "parsed_issue": {
    "primary_fault_category": "TIRE_PUNCTURE",
    "severity_score": 4,
    "required_equipment": ["jack", "wheel spanner"],
    "extracted_keywords": ["flat tyre", "rear wheel"]
  },
  "recommendations": [{
    "mechanic_id": "uuid",
    "business_name": "Sharma Auto",
    "phone_number": "9876543210",
    "distance_km": 2.4,
    "base_rating": 4.8,
    "composite_score": 78.5,
    "matched_capabilities": ["tyre repair", "puncture"],
    "estimated_fare": 350,
    "platform_fee": 50,
    "total_user_cost": 400,
    "rationale": "Ranked #1: tyre repair, puncture | 2.4km away"
  }]
}
```

### Summary of ALL missing fields the frontend needs but backend doesn't return:

| Missing Field | Where It Goes | What to Do |
|---|---|---|
| `diagnosis.issue` | AI diagnosis card | Map `primary_fault_category` → issue key |
| `diagnosis.title` | AI diagnosis card heading | Generate from Gemini (new) |
| `diagnosis.confidence` | AI diagnosis card | Map severity_score to "High/Medium/Low" (new) |
| `diagnosis.service` | AI diagnosis card | Generate from Gemini (new) |
| `diagnosis.body` | AI explanation | Generate from Gemini (new) |
| `diagnosis.mechanic_tip` | Mechanic dashboard tip | Generate from Gemini (new) |
| `mechanic.name` | Card title | Already have as `business_name` |
| `mechanic.owner` | Card subtitle | **Missing from DB — need to add** |
| `mechanic.initials` | Avatar fallback | Compute from `business_name` |
| `mechanic.reviews` | Card details | Already have `total_reviews` in DB |
| `mechanic.eta_min` | ETA badge | Compute from distance (new) |
| `mechanic.price_min/max` | Price range | Currently only `total_user_cost` (need range) |
| `mechanic.services_label` | Services text | Build from `matched_capabilities` |
| `mechanic.vehicle_label` | Vehicle info | **Missing from DB — need to add** |
| `mechanic.plate` | Vehicle plate | **Missing from DB — need to add** |
| `mechanic.verified` | Badge | Map from DB (can derive from `is_online`) |
| `mechanic.is_best` | "Best Match" label | Tag highest `composite_score` |
| `mechanic.reasons[]` | "Why this mechanic?" panel | Build from ranking factors |

---

## 3. The Full Endpoint Mapping (Frontend → Backend)

### Endpoints that DON'T EXIST yet in your backend:

| Frontend Endpoint | Purpose | Your Responsibility? |
|---|---|---|
| `POST /api/recommendations` | Diagnosis + Ranking | ✅ YES (reshape existing) |
| `POST /api/requests` | Create dispatch request | ✅ YES (reshape existing dispatch) |
| `GET /api/requests/{id}` | Poll status | ✅ YES (reshape existing) |
| `POST /api/requests/{id}/cancel` | Cancel | ✅ YES (new) |
| `POST /api/requests/{id}/confirm-mechanic` | Driver confirms identity | ✅ YES (new) |
| `POST /api/requests/{id}/confirm-payment` | Driver pays | ✅ YES (new) |
| `POST /api/requests/{id}/accept` | Mechanic accepts | ✅ YES (reshape existing) |
| `POST /api/requests/{id}/decline` | Mechanic declines | ✅ YES (reshape existing) |
| `POST /api/requests/{id}/arrive` | Mechanic arrived | ✅ YES (new) |
| `POST /api/requests/{id}/verify` | Verify code | ✅ YES (new) |
| `POST /api/requests/{id}/bill` | Send bill | ✅ YES (new) |
| `GET /api/mechanics/{id}/dashboard` | Mechanic dashboard | ✅ YES (new — big one) |
| `POST /api/mechanics/{id}/availability` | Online/offline toggle | ✅ YES (new) |
| `POST /api/mechanics/{id}/services` | Toggle services | ✅ YES (new) |
| `POST /api/feedback` | Submit feedback | ❌ Backend person |
| `GET /api/requests?mine=true` | Past requests | ❌ Backend person |
| `POST /api/requests/{id}/report` | Report problem | ❌ Backend person |
| `POST /api/sos` | Emergency SOS | ❌ Backend person |
| `POST /api/sos/{id}/resolve` | Resolve SOS | ❌ Backend person |
| `GET /api/admin/overview` | Control room dashboard | ⚠️ Partial (mechanic locations from your DB) |
| `POST /api/admin/sos/{id}/acknowledge` | Acknowledge SOS | ❌ Backend person |
| `POST /api/admin/incidents/{id}/assign` | Assign incident | ❌ Backend person |
| `POST /api/admin/verifications/{id}/approve` | Approve verification | ❌ Backend person |
| `POST /api/auth/otp/send` | Auth | ❌ Backend person |
| `POST /api/auth/otp/verify` | Auth | ❌ Backend person |

---

## 4. What I Need To Do (Action Items For YOUR Part)

### Task 1: Remove Gradio ✂️
- Delete [gradio_app.py](file:///c:/Users/Dell/OneDrive/Desktop/final%20year/backend/gradio_app.py)
- Delete `.gradio/` directory
- Remove `gradio` from [requirements.txt](file:///c:/Users/Dell/OneDrive/Desktop/final%20year/backend/requirements.txt)
- Remove Gradio comment from [graph.py](file:///c:/Users/Dell/OneDrive/Desktop/final%20year/backend/app/models/graph.py) line 35
- Update [README.md](file:///c:/Users/Dell/OneDrive/Desktop/final%20year/README.md) to remove all Gradio references

### Task 2: Enhance AI Parser (Gemini Output) 🧠
The current `ai_parser.py` only returns basic `ParsedIssue` (category, severity, equipment, keywords). The frontend needs a rich `Diagnosis` object. I need to:
- Expand the Gemini prompt to also produce: `title`, `confidence` (High/Medium/Low), `service`, `body` (explanation for driver), `mechanic_tip`
- Map the `primary_fault_category` to the frontend's `Issue` type (`flat | battery | heat | start | fuel | tow | other`)

### Task 3: Reshape Recommendation API 🔄
Create a new endpoint `POST /api/recommendations` that:
1. Accepts the frontend's input format (`lat`, `lng`, `vehicle`, `issue`, `description`, `sort`)
2. Maps `vehicle` (car/bike/auto/truck) → backend's `vehicle_class` (TWO_WHEELER/HATCHBACK/etc.)
3. Calls the existing AI parser + RAG ranker
4. Transforms the output into the frontend's expected `RecommendResult` shape (with `diagnosis`, `mechanics[]` including `reasons[]`, `is_best`, `eta_min`, `price_min/max`, etc.)

### Task 4: Build the Full Request Lifecycle Endpoints 📡
Expand the dispatch system from the current 3-endpoint design to the full lifecycle:
- `POST /api/requests` — Create request with `verification_code`, 90s deadline
- `GET /api/requests/{id}` — Return full `ServiceRequest` shape with mechanic location, ETA, etc.
- `POST /api/requests/{id}/cancel` — Cancel
- `POST /api/requests/{id}/confirm-mechanic` — arrived → repairing
- `POST /api/requests/{id}/confirm-payment` — billing → completed
- `POST /api/requests/{id}/accept` — Mechanic accepts
- `POST /api/requests/{id}/decline` — Mechanic declines + cascade
- `POST /api/requests/{id}/arrive` — en_route → arrived
- `POST /api/requests/{id}/verify` — Verify 4-digit code
- `POST /api/requests/{id}/bill` — Send bill with line items

### Task 5: Mechanic Dashboard API 🔧
Build `GET /api/mechanics/{id}/dashboard` returning `MechanicDashboard`:
- Mechanic profile from DB
- Incoming pending request (if any)
- Active job (if any)
- Today's stats, weekly earnings
- Nearby requests
- Service offerings with toggle
- Reviews

Plus:
- `POST /api/mechanics/{id}/availability` — Toggle online/offline (update `is_online` in DB)
- `POST /api/mechanics/{id}/services` — Toggle service offerings

### Task 6: Enrich DB Schema 🗃️
Add missing fields to `MechanicNode`:
- `owner_name` (String) — owner/contact person name
- `vehicle_label` (String) — e.g. "Mobile van", "Tow truck"
- `vehicle_plate` (String) — e.g. "RJ14 GC 4471"
- `verified` (Boolean) — verification status
- `area` (String) — area name, e.g. "Sitapura, Jaipur"
- `typical_arrival_min` (Integer) — average arrival time

Add fields to `ServiceRequest`:
- `vehicle` (String) — car/bike/auto/truck
- `issue` (String) — flat/battery/heat/etc.
- `description` (String) — already exists
- `location_lat`, `location_lng`, `location_label` — driver's location
- `verification_code` (String, 4 digits)
- `accept_deadline` (DateTime)
- `accepted_at`, `arrived_at`, `completed_at` (DateTime)
- `line_items` (JSON) — bill items
- `final_amount` (Float)
- `payment_method` (String)
- `driver_name`, `driver_vehicle_model`, `driver_plate` (String)

### Task 7: Control Room (Partial) 🖥️
Build `GET /api/admin/overview` with data from YOUR part:
- `kpis.open_requests` — count from `service_requests` where status is pending
- `kpis.mechanics_online` — count from `mechanics` where `is_online = true`
- `mechanics[]` — list of all mechanics with lat/lng/online status for the map
- `incidents[]` — derived from active `service_requests`
- Leave SOS, verifications, hotspots as stubs for the backend person

### Task 8: Mechanic Registration → Database 📝
When a new mechanic registers (via the backend person's auth flow), ensure the `MechanicNode` is created in the database with all required fields so they appear in:
- The recommendations search
- The control room map
- Provide a `POST /api/mechanics/register` endpoint stub

---

## 5. Key Insights

> [!IMPORTANT]
> **The biggest gap is the response shape.** Your AI model and ranking engine WORK well. The problem is that the frontend expects a completely different JSON structure than what your backend returns. The core AI logic stays the same — we're wrapping it in new API endpoints that speak the frontend's language.

> [!WARNING]
> **Route prefix mismatch.** Your backend uses `/api/v1/...` but the frontend calls `/api/...` (no `/v1`). We need to add new routers at `/api/` or change the frontend's `httpApi` URLs.

> [!NOTE]
> **The 90-second dispatch cascade already works in your backend** — it just needs to be reshaped into the full request lifecycle (pending → en_route → arrived → repairing → billing → completed) instead of the current simple (PENDING → ACCEPTED/FAILED).

> [!TIP]
> **The mock data in the frontend (`lib/mock/`) is basically a complete specification** of what every API should return. We can use it as a reference to build every endpoint.
