# 🚗 Smart Breakdown Dispatch AI

An AI-driven roadside assistance recommendation engine powered by **Google Gemini**, **PostGIS**, and **pgvector**. This system parses emergency breakdown requests, executes a semantic vector search across mechanic capabilities, and ranks mechanics based on proximity, AI capability match, and rating.

---

## 🛠️ Requirements
- Docker Desktop (for PostgreSQL with PostGIS & pgvector)
- Python 3.10+
- A Google Gemini API Key
- Node.js 20+ (for the Next.js frontend)

---

## 🚀 Setup Guide

### Step 1: Clone & Navigate
Clone this repository and open a terminal inside the project root folder.

---

### Step 2: Start the Database Container
```bash
docker run --name smart-breakdown-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d ankane/pgvector:latest
docker exec -it smart-breakdown-db bash
apt-get update
apt-get install -y postgresql-15-postgis-3
exit
docker exec smart-breakdown-db psql -U postgres -d postgres -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS vector;"
```

---

### Step 3: Setup Python Environment
```bash
cd backend
python -m venv venv

# Activate the virtual environment
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install all required packages
pip install -r requirements.txt
```

---

### Step 4: Configure API Keys
Create/edit `backend/.env`:
```ini
SQLALCHEMY_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
GEMINI_API_KEY="<YOUR_GEMINI_API_KEY>"
```

---

### Step 5: Seed the Database
```bash
python app/db/seed_data.py
python app/db/enrich_concepts.py
```

### Step 5b: Run Migration (if upgrading from v1)
If you already have data and just updated the code:
```bash
python -m app.db.migrate
```

---

### Step 6: Start the Backend API
```bash
uvicorn app.main:app --reload
```
*Wait ~10 seconds for the sentence-transformer model to load. You should see `Application startup complete.`*

The API is now running at **http://127.0.0.1:8000**. Visit **http://127.0.0.1:8000/docs** for Swagger UI.

---

### Step 7: Start the Next.js Frontend
```bash
cd smart-breakdown-frontend (1)/smart-breakdown-frontend (1)/frontend
npm install
```

Edit `.env.local` to point to your backend:
```ini
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
npm run dev
```
Open **http://localhost:3000** in your browser.

---

## 📡 API Endpoints

### Frontend API (used by Next.js)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/recommendations` | AI diagnosis + mechanic ranking |
| POST | `/api/requests` | Create dispatch request |
| GET | `/api/requests/{id}` | Poll request status |
| POST | `/api/requests/{id}/cancel` | Cancel request |
| POST | `/api/requests/{id}/confirm-mechanic` | Driver confirms identity |
| POST | `/api/requests/{id}/confirm-payment` | Driver confirms payment |
| POST | `/api/requests/{id}/accept` | Mechanic accepts |
| POST | `/api/requests/{id}/decline` | Mechanic declines |
| POST | `/api/requests/{id}/arrive` | Mechanic arrived |
| POST | `/api/requests/{id}/verify` | Verify 4-digit code |
| POST | `/api/requests/{id}/bill` | Send bill |
| GET | `/api/mechanics/{id}/dashboard` | Mechanic dashboard |
| POST | `/api/mechanics/{id}/availability` | Online/offline toggle |
| POST | `/api/mechanics/{id}/services` | Toggle services |
| GET | `/api/admin/overview` | Control room dashboard |

### Legacy V1 API (backward compatible)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/recommendations/search` | Original search endpoint |
| POST | `/api/v1/dispatch/request` | Original dispatch |
| POST | `/api/v1/dispatch/{id}/respond` | Original mechanic response |
| GET | `/api/v1/dispatch/{id}` | Original status check |
