# API contract — Smart Breakdown frontend ↔ backend

The frontend calls only the endpoints below, through `lib/api.ts`.
Set `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`) to switch from demo data to your backend.

- **Format:** JSON in and out. Field names are snake_case and match `lib/types.ts` exactly, so Pydantic models can mirror them 1:1.
- **Times:** epoch milliseconds (`created_at`, `accept_deadline`, …).
- **Auth:** `Authorization: Bearer <token>`. The token is returned by `/api/auth/otp/verify` and stored by the frontend.
- **Errors:** any non-2xx status with `{"detail": "Human-readable message"}`. The message is shown to the user as-is, so write it for drivers.
- **CORS:** allow the frontend origin.

## Where your trained model plugs in

| UI element | Comes from |
|---|---|
| AI quick diagnosis card (title, High/Medium/Low confidence, recommended service, explanation) | `diagnosis` in `POST /api/recommendations` |
| Mechanic list and order, "Best match" label | `mechanics[]` order and `is_best` |
| "Why this mechanic?" | `mechanics[].reasons[]` — return the real factors your ranker used (label + value) |
| Mechanic's "AI tip" on the incoming request | `diagnosis.mechanic_tip` on the request |

`confidence` must be exactly `"High" | "Medium" | "Low"`. The UI intentionally shows no percentage; map your model score to these buckets.

The frontend never ranks or diagnoses on its own when a backend URL is set.

## Driver

### `POST /api/recommendations`
Request:
```json
{ "lat": 26.8371, "lng": 75.5701, "vehicle": "car", "issue": "flat", "description": "loud bang from rear wheel", "sort": "best" }
```
- `vehicle`: `car | bike | auto | truck`
- `issue`: `flat | battery | heat | start | fuel | tow | other`

Response — `RecommendResult`:
```json
{
  "radius_km": 25,
  "diagnosis": { "issue": "flat", "title": "Likely a tyre puncture or burst", "confidence": "High",
                 "service": "Mobile tyre repair", "body": "…", "mechanic_tip": "…" },
  "mechanics": [{
    "mechanic_id": "m1", "name": "Sharma Auto Works", "owner": "Ramesh Sharma", "initials": "SA",
    "rating": 4.8, "reviews": 312, "distance_km": 2.4, "eta_min": 9, "price_min": 300, "price_max": 600,
    "services_label": "Tyres · Battery · Mobile van", "vehicle_label": "Mobile van", "plate": "RJ14 GC 4471",
    "verified": true, "is_best": true,
    "reasons": [{ "label": "Distance", "value": "2.4 km from you" }, { "label": "Matching service", "value": "Tyre repair" }]
  }]
}
```
- Return only verified, online mechanics inside `radius_km`.
- An empty `mechanics` list shows a "no mechanics nearby" screen with helpline buttons.
- Sorting by Nearest / Top rated happens in the browser; the frontend always requests `sort: "best"`.

### `POST /api/requests` → `ServiceRequest`
```json
{ "location": { "lat": 26.8371, "lng": 75.5701, "label": "NH-48, near Mahindra World City turn", "accuracy_m": 15 },
  "vehicle": "car", "issue": "flat", "description": "", "mechanic_id": "m1" }
```
Create the request with `status: "pending"` and `accept_deadline = now + 90 s`, and generate a 4-digit `verification_code`.

### `GET /api/requests/{id}` → `ServiceRequest`
The driver screen polls this every 3 s. The backend owns these state changes:

- **Accept deadline passed:** reassign to the next best mechanic. Set `reassigned: true` and `previous_mechanic_name`, and start a new 90 s deadline. If no mechanic is left, set status `unassigned`.
- **While `en_route`:** keep `mechanic_location` (live GPS) and `eta_min` updated.

### Request status lifecycle
`pending → en_route → arrived → repairing → billing → completed` (or `cancelled`, `unassigned`)

| Status | Driver screen | Mechanic screen |
|---|---|---|
| `pending` | 90 s countdown, "Finding your mechanic" | New request card with Accept / Decline |
| `en_route` | Live tracking map, ETA, 6-step timeline | Navigation and "I've Arrived" |
| `arrived` | Shows `verification_code`, "Confirm Mechanic" | Enter driver's code |
| `repairing` | "Repair in progress" | Checklist and "Complete Job" |
| `billing` | Bill with "I've paid ₹…" | "Waiting for driver to confirm payment" |
| `completed` | Repair Completed, receipt, Rate Mechanic | Job completed, earnings |

### Driver actions (each returns the updated `ServiceRequest`)
- `POST /api/requests/{id}/cancel` with `{ "reason": "Taking too long" }`
- `POST /api/requests/{id}/confirm-mechanic` — driver confirmed identity; `arrived → repairing`
- `POST /api/requests/{id}/confirm-payment` — `billing → completed`

## Mechanic

### `GET /api/mechanics/{mechanic_id}/dashboard` → `MechanicDashboard`
Polled every 2.5 s. Contains:

- `mechanic`, `online`
- `incoming`: the pending request offered to this mechanic, or null
- `active`: the current job, or null
- `last_completed`
- `today`, `week`, `week_summary`
- `nearby`, `services`, `reviews`

> **Security:** never include `verification_code` in requests sent to the mechanic. The mechanic must hear it from the driver. The frontend shows it there only in demo mode.

### Mechanic actions
- `POST /api/mechanics/{id}/availability` with `{ "online": true }`
- `POST /api/mechanics/{id}/services` with `{ "service": "towing", "enabled": false }`
- `POST /api/requests/{id}/accept` with `{ "mechanic_id": "m1" }` → `ServiceRequest`. Return `409` if the request was already reassigned.
- `POST /api/requests/{id}/decline` with `{ "mechanic_id": "m1", "reason": "Too far from me" }`. Reassign immediately.
- `POST /api/requests/{id}/arrive` → `ServiceRequest`
- `POST /api/requests/{id}/verify` with `{ "code": "4827" }` → `ServiceRequest`. Return `422` with a detail message when the code is wrong.
- `POST /api/requests/{id}/bill` with `{ "line_items": [{ "label": "Puncture repair", "amount": 300 }], "payment_method": "upi" }` → `ServiceRequest`

## Feedback
- `GET /api/requests?mine=true` → `PastRequest[]`
- `POST /api/feedback` with `{ "request_id", "rating": 1–5, "tags": [], "price_matched": true|false|null, "charged_amount": number|null, "comment" }`
  - These signals are meant to feed back into your ranking model.
- `POST /api/requests/{id}/report` with `{ "category": "Overcharged", "details": "…" }`

## Emergency SOS
- `POST /api/sos` with `{ "location": GeoPoint | null, "request_id": string | null }` → `SosAlert`
  - Return the parties actually notified in `notified[]`.
- `POST /api/sos/{id}/resolve` → `SosAlert`

## Control room
- `GET /api/admin/overview` → `AdminOverview`
  - Contains `kpis`, `incidents[]`, `sos[]`, `verifications[]`, `mechanics[]` (map points) and `hotspots[]`.
  - Polled every 5 s.
- `POST /api/admin/sos/{id}/acknowledge`
- `POST /api/admin/incidents/{id}/assign`
- `POST /api/admin/verifications/{id}/approve`
- `POST /api/admin/verifications/{id}/request-document` with `{ "document": "Vehicle RC" }`

## Sign in
- `POST /api/auth/otp/send` → `OtpChallenge`
  - Request body: `{ "role": "driver"|"mechanic"|"admin", "phone"?, "email"?, "password"? }`
  - Response: `{ "challenge_id", "sent_to", "expires_in_s" }`. Omit `demo_code` in production.
- `POST /api/auth/otp/verify` with `{ "challenge_id", "code" }` → `Session`
  - Response: `{ "role", "name", "mechanic_id"?, "token" }`
  - Wrong code: `422` with a detail message such as "That code didn't match. 2 attempts left."
