# Smart Breakdown & Mechanic Recommendation System — Frontend

Next.js + TypeScript website for stranded highway drivers in Jaipur, partner mechanics and the control room.

| Route | Page |
|---|---|
| `/` | **Driver Portal** (mobile-first): Start → Location → Vehicle & problem → AI diagnosis → Mechanics → Confirm → Waiting (90 s) → Live tracking → Mechanic arrived (code check) → Repair → Bill → Completed + receipt |
| `/mechanic` | **Mechanic Dashboard**: Online/Offline → Waiting → New request (90 s countdown) → Accept/Decline → On the way → Arrived (code) → Repair → Bill → Completed, plus earnings, services and reviews |
| `/admin` | **Control Room**: SOS alert banner, key numbers, live map with layers, work queue (Incidents · SOS · Verifications) |
| `/feedback` | **Feedback**: job summary, rating, adaptive "what went well / wrong" tags, price check, report a problem, past requests |
| `/sos` | **Emergency SOS**: Ready → 3 s countdown (cancellable) → Active → Resolved, plus one-tap 112 / 108 / 1033, location sharing, emergency profile |
| `/login` | **Sign in**: Driver (optional) / Mechanic via mobile OTP, Control room via email + password + code |

## Run it

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local      # leave NEXT_PUBLIC_API_URL empty for demo mode
npm run dev                     # http://localhost:3000
```

Production build: `npm run build && npm start`.

## Demo mode vs your backend

- **`NEXT_PUBLIC_API_URL` empty (demo mode):** the site runs on sample data in the browser (`lib/mock/`).
  - **Sign-in code:** `123456`.
  - **Two tabs:** open the Driver Portal and the Mechanic Dashboard in two tabs of the same browser. A request sent by the driver appears on the dashboard, and the mechanic's clicks move the driver's screen forward.
  - **Driver tab alone:** an autopilot plays the mechanic so the whole flow can be tried.
  - **Dashboard alone:** a simulated driver sends a sample request.
- **`NEXT_PUBLIC_API_URL=http://your-backend`:** every screen calls your FastAPI service instead. The endpoints and JSON shapes are in **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**. Your trained model's diagnosis, confidence, ranking and "why" reasons are displayed as returned.

All sample names, phone numbers, prices, ratings and coordinates in `lib/mock/` are placeholders.

## What uses real browser features

- **Location:** real GPS via `navigator.geolocation`, with these states:
  - detecting
  - detected
  - weak (accuracy over 100 m)
  - permission denied
  - unavailable
  - manual search
- **Demo outside Jaipur:** in demo mode a GPS fix more than 60 km from Jaipur is replaced with a sample NH-48 location, and the screen says so.
- **Weak network banner:** shown when the browser reports offline or a 2G connection, or when polling the backend fails. Saved request IDs let the driver screen resume after a refresh.
- **Maps:** Leaflet with OpenStreetMap tiles. You can set your own tile server with `NEXT_PUBLIC_MAP_TILES_URL`. Use a commercial tile provider for production traffic.
- **Sharing and calling:** live location uses the Web Share API, falling back to the clipboard. Emergency numbers use `tel:` links.
- **SOS emergency profile:** contacts, vehicle and medical info are stored only in the browser.

## Not included (needs backend support)

- SMS delivery of codes
- Real payment collection (the driver confirms they've paid; no payment gateway)
- Push or sound alerts for mechanics
- Server-side session checks — `/mechanic` and `/admin` are gated in the browser only; your API must enforce roles
- Hindi translations — the EN · हिं switch is in place but copy is English only

## Project layout

```
app/                 routes (one folder per page)
components/          driver/, mechanic/, admin/, feedback/, sos/, auth/ + shared ui.tsx, Icon.tsx, LiveMap*.tsx
lib/api.ts           single API client (HTTP or demo)
lib/types.ts         shared data shapes (snake_case, mirrors the backend)
lib/mock/            demo data + demo stand-ins for the model
lib/hooks.ts         geolocation, network, polling, session
app/globals.css      design tokens: navy structure, amber actions, blue AI, green done, red only for SOS
```

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
