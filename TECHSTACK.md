# Technology Stack

TrendScope utilizes a modern, robust, and scalable technology stack that separates the frontend presentation layer from the heavy backend AI/data processing layer.

## 💻 Frontend (Consumer App & Admin Dashboard)

* **Framework:** [Next.js](https://nextjs.org/) (React)
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **UI Components:** [shadcn/ui](https://ui.shadcn.com/)
* **Animations:** Framer Motion
* **Data Visualization:** Recharts
* **Icons:** Lucide Icons

## ⚙️ Backend (API & Data Pipeline)

* **Language:** Python 3.10+
* **Framework:** [FastAPI](https://fastapi.tiangolo.com/) (High performance, async support)
* **Data Validation:** Pydantic
* **ORM:** SQLAlchemy

## 🗄️ Database & Storage

* **Primary Database:** PostgreSQL (via [Supabase](https://supabase.com/))
* **Vector Database:** `pgvector` (Extension for PostgreSQL to store and query AI embeddings)
* **Storage:** Supabase Storage (for images and cached media)

## ⚡ Caching & Background Processing

* **Cache Layer:** Redis (To avoid hitting PostgreSQL for every trend calculation or search)
* **Task Queue / Background Workers:** Celery + Redis (or RQ)
  * Used for scheduling data collection (every 15-30 mins).
  * Used for queuing AI processing tasks asynchronously.

## 🧠 AI & Machine Learning Pipeline

* **LLM API:** OpenAI (GPT-4o) or Anthropic (Claude 3.5 Sonnet) for classification, entity extraction, summarization, and trend explanations.
* **Embedding Model:** OpenAI `text-embedding-3-small` or HuggingFace equivalent (for clustering similar articles and trends).
* **Vision Model:** (Future) For analyzing images of celebrities and runways to extract colors and styles.

## 🚀 Deployment & Infrastructure

* **Frontend Hosting:** Vercel (Optimized for Next.js)
* **Backend API Hosting:** Render or AWS (EC2/ECS/App Runner) for FastAPI workers.
* **Database Hosting:** Supabase Managed PostgreSQL.
* **Redis Hosting:** Upstash or Render.
