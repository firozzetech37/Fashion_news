# TrendScope - AI Fashion Intelligence Platform

**Tagline:** Discover what's trending before it becomes mainstream.

## 🚀 Vision

TrendScope is not just a news aggregator. It is an AI engine that converts thousands of fashion signals into actionable trend intelligence. The platform aggregates fashion, Bollywood, Hollywood, celebrity, runway, designer, brand, and social signals, and converts them into structured fashion trend intelligence.

We are building a platform with two distinct layers:
1. **Layer 1 (Consumer):** Discover what's trending, what celebrities are wearing, and what's viral.
2. **Layer 2 (Fashion Industry/B2B):** Actionable analytics on emerging trends, rising colors, celebrity influence, and brand adoption to help designers and brands know what to create next.

## 📚 Documentation

Please refer to the following documents for a detailed breakdown of the project:

- [Architecture Details](ARCHITECTURE.md) - The complete end-to-end data pipeline and system architecture.
- [Tech Stack](TECHSTACK.md) - A detailed overview of the frontend, backend, AI, and deployment technologies.
- [Authentication](AUTHENTICATION.md) - How we handle user authentication, API security, and role-based access.
- [Implementation Steps](STEPS.md) - A step-by-step, 8-week guide to building the platform from scratch to MVP.

## 🌟 Core Loop
Collect → Clean → Understand → Cluster → Score → Predict → Present

## 🛠 Running locally

```bash
# Backend API (http://localhost:8000, docs at /docs)
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then fill in your keys
python app/core/init_db.py      # create/upgrade tables
uvicorn app.main:app --reload --port 8000

# Worker + scheduler (collection, AI pipeline, trend engine) - in another terminal
cd backend && source venv/bin/activate
celery -A workers.celery_app worker -B --loglevel=info

# Website (http://localhost:3000) - in another terminal
cd frontend && npm install
cp .env.example .env.local      # then fill in your keys
npm run dev
```

## 🚀 Deploying

| Part | Host | Config |
|---|---|---|
| Website (`frontend/`) | Vercel, region `sin1` | `frontend/vercel.json`, env from `frontend/.env.example` |
| API (`backend/`) | Render free plan, Singapore | `render.yaml` (Blueprint), env from `backend/.env.example` |
| Background jobs | GitHub Actions, every 30 min | `.github/workflows/scheduled-jobs.yml` calls `POST /api/jobs/run` |
| Database | Supabase (Singapore) | already hosted |
| Redis | Upstash | only for the optional local Celery worker |

Production settings that differ from local: `CORS_ORIGINS` (the Vercel URL), `TRUSTED_PROXY_HOPS=1`,
`NEXT_PUBLIC_API_URL` (the Render URL), and the Supabase Auth Site URL / redirect URLs.
