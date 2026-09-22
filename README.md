# 🚗 Smart Breakdown Dispatch AI

An AI-driven roadside assistance recommendation engine powered by **Google Gemini**, **PostGIS**, and **pgvector**. This system parses emergency breakdown requests, executes a semantic vector search across mechanic capabilities, and ranks mechanics based on proximity, AI capability match, and rating.

---

## 🛠️ Requirements
- Docker Desktop (for PostgreSQL with PostGIS & pgvector)
- Python 3.10+
- A Google Gemini API Key

---

## 🚀 Setup Guide (Start From Scratch)

Follow these exact steps to run the complete backend API and Gradio User Interface on a fresh machine.

### Step 1: Clone the Repository
Clone this repository to your local machine and open a terminal inside the project root folder (`final year`).

---

### Step 2: Start the Database Container
We need a PostgreSQL database with both **pgvector** and **PostGIS** installed. Run these commands sequentially:

1. Spin up the container:
```bash
docker run --name smart-breakdown-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d ankane/pgvector:latest
```

2. Install the PostGIS extension into the container:
```bash
docker exec -it smart-breakdown-db bash
apt-get update
apt-get install -y postgresql-15-postgis-3
exit
```

3. Enable the extensions inside Postgres:
```bash
docker exec smart-breakdown-db psql -U postgres -d postgres -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS vector;"
```

---

### Step 3: Setup the Python Environment
Navigate into the `backend` folder and create a virtual environment to install dependencies.

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
pip install gradio requests
```

---

### Step 4: Configure API Keys
Create a file named `.env` inside the `backend` folder and add the following lines. Replace `<YOUR_GEMINI_API_KEY>` with your actual Gemini API key.

```ini
# backend/.env
SQLALCHEMY_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
GEMINI_API_KEY="<YOUR_GEMINI_API_KEY>"
```

---

### Step 5: Seed the Database
Now we need to populate the database with mock mechanics and run the AI Concept Enrichment script to link their capabilities.

Run these two commands:
```bash
# 1. Populate Mechanics
python app/db/seed_data.py

# 2. Run AI Enrichment (Takes ~2 minutes to infer skills via Gemini)
python app/db/enrich_concepts.py
```

---

### Step 6: Start the Backend API
The GraphRAG recommendation engine is powered by FastAPI. Run the server:

```bash
uvicorn app.main:app --reload
```
*Wait ~10 seconds for the sentence-transformer embeddings model to load into memory. You should see `Application startup complete.`*

---

### Step 7: Start the Gradio User Interface
Open a **new, separate terminal** (keep the FastAPI server running), navigate to the `backend` folder, activate the virtual environment again, and run the UI:

```bash
cd backend
venv\Scripts\activate
python gradio_app.py
```

The terminal will provide a local URL: **http://127.0.0.1:7860**. 
Open that link in your browser to interact with the AI Engine!
