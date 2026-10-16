# Implementation Steps & Build Order

To avoid being overwhelmed, we will build TrendScope in a strict, phased approach over 8 weeks. **Do not attempt to build everything simultaneously.** 

## Phase 1: MVP Core (Weeks 1-4)

### Week 1: Foundation & Base UI
* [x] **Initialize Frontend:** Setup Next.js, Tailwind, shadcn/ui.
* [x] **Database Setup:** Initialize Supabase PostgreSQL database.
* [x] **Authentication:** Implement Supabase Auth (Login/Signup).
* [x] **Core Layout:** Build the Navigation bar, Footer, and base responsive shell.
* [x] **Homepage UI:** Build static/mocked UI for the Homepage (Hero, Trend Radar, Celebrity Signals).

### Week 2: Data Ingestion Pipeline
* [x] **Backend Setup:** Initialize FastAPI, SQLAlchemy, and Pydantic schemas.
* [x] **Source Management:** Create the `sources` database table. Build Admin UI to add/edit/disable sources.
* [x] **Collectors:** Generic RSS collector + 21 seeded sources (`python -m app.core.seed_sources`).
* [x] **Background Workers:** Setup Celery/Redis to run the collectors on a schedule.
* [x] **Raw Storage:** Save fetched articles to the `articles` table, ensuring URL/content deduplication.

### Week 3: AI Processing Pipeline
* [x] **LLM Integration:** Gemini via `google-genai` (model set by `GEMINI_MODEL`), typed JSON output.
* [x] **Article AI Prompt:** Implement the "Master AI Prompt" to classify content and extract entities/trends.
* [x] **Processing Queue:** Hook the AI processing up to the Celery queue (process articles asynchronously after ingestion).
* [x] **Embeddings:** Generate vector embeddings for processed articles using `pgvector`.
* [x] **Admin Monitoring:** Show AI processing queue health, success rates, and errors in the Admin Dashboard.

### Week 4: Trend Engine & Analytics
* [x] **Trend Database:** Create `trends` and `trend_mentions` tables.
* [x] **Trend Scoring:** Implement the V1 Trend Scoring Algorithm (growth, source diversity, celebrity signals).
* [x] **Trend Detail API:** Create backend endpoints to fetch a trend's historical score and related articles.
* [x] **Trend UI:** Build the "Trend Detail Page" on the frontend (Charts, "Why is this trending?" panel).
* [x] **Integration:** Connect the Homepage UI to real backend data.

---

## Phase 2: Refinement & Expansion (Weeks 5-8)

### Week 5: Categorization & Search
* [x] **Vertical Pages:** Build the Bollywood, Hollywood, Brands, and Celebrity specific pages.
* [x] **Search Engine:** Implement global search (Trends, Celebrities, Brands, Articles).
* [x] **Filtering:** Allow users to filter trends by category (e.g., Menswear vs. Beauty).

### Week 6: Visualizations & Analytics
* [x] **Trend Radar:** Implement the dynamic Trend Radar visualization.
* [x] **Momentum Charts:** Add historical trend graphs (Emerging -> Rising -> Peak).
* [x] **AI Explanations:** Automatically generate the "Why it's trending" textual explanations on the fly or via scheduled batch jobs.

### Week 7: Advanced Features
* [x] **AI Assistant:** Implement "Ask TrendScope" (RAG-based chat using the vector database of articles and trends).
* [x] **Forecasting (V1):** Simple statistical forecasting based on growth rates to label trends as "Likely to Peak" or "Declining".
* [x] **Notifications:** In-app alerts for emerging trends, stage changes and breakouts (email still to do: needs a provider).

### Week 8: Polish & Production Prep
* [ ] **Caching:** Implement Redis caching on high-traffic FastAPI endpoints (e.g., Homepage data).
* [ ] **SEO:** Add metadata, OpenGraph tags, and sitemaps to the Next.js frontend.
* [ ] **Security:** Final review of API rate limits, database RLS (Row Level Security) in Supabase.
* [ ] **Deployment:** Deploy Frontend to Vercel, Backend to Render/AWS. Configure production environment variables.

---

## The MVP Definition
If you need to launch faster, your absolute minimum viable product requires:
1. 10-20 active data sources.
2. The AI pipeline extracting trends.
3. The Trend Scoring algorithm.
4. A frontend displaying the **Trend Radar** (Homepage) and **Trend Detail Pages**.
*(Ignore Search, Forecasting, and the AI Assistant for the V1 Launch).*
