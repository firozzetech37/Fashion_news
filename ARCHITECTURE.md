# System Architecture

TrendScope's architecture is designed to handle high volumes of unstructured data, process it intelligently using AI, and serve it blazingly fast to the end-user.

## 1. High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Data Sources
        FS[Fashion Sites]
        ENT[Entertainment News]
        SOC[Social Signals]
    end

    IE[Ingestion Engine\nRSS / APIs / Scheduled collectors]
    RDS[(Raw Data Storage\nPostgreSQL)]
    DP[Data Processing\nClean / Normalize / Deduplicate]
    
    subgraph AI Pipeline
        CLS[Classification]
        EXT[Entity & Trend Extraction]
        SUM[Summarization & Sentiment]
    end

    EC[Embedding / Clustering\npgvector]
    TE[Trend Engine\nScore / Momentum / Growth]
    TF[Trend Forecasting]

    subgraph Clients
        WEB[Next.js Web App]
        ADM[Admin Dashboard]
        API[External API]
    end

    FS --> IE
    ENT --> IE
    SOC --> IE
    
    IE --> RDS
    RDS --> DP
    DP --> AI Pipeline
    AI Pipeline --> EC
    EC --> TE
    TE --> TF
    
    TF --> WEB
    TF --> ADM
    TF --> API
```

## 2. Ingestion Pipeline
1. **Scheduler (Celery/Redis):** Triggers every 15–30 minutes.
2. **Fetch:** Pulls from active sources configured in the DB.
3. **Deduplication:** Checks URL and content hash. If duplicate, ignore.
4. **Storage:** Saves the raw article metadata and queues the ID for AI processing.

## 3. AI Processing Pipeline
Every raw article goes through the following AI steps:
1. **Language Detection & Classification:** Is it Fashion, Celebrity, Runway, etc.?
2. **Entity Extraction:** Extracts People, Brands, Designers, Colors, Fabrics.
3. **Trend Extraction:** Identifies the core trends (e.g., "Chocolate Brown", "Sheer Fabrics").
4. **Summary & Sentiment:** Creates an original AI summary and gauges sentiment.
5. **Embedding:** Generates a vector embedding for semantic search and duplicate detection.

## 4. Trend Engine & Scoring Algorithm
The core IP of the platform. Trends are scored based on multiple weighted signals:
- **Mention Growth:** 25%
- **Source Diversity:** 20%
- **Celebrity Influence:** 15%
- **Brand Adoption:** 15%
- **Social Signals:** 10%
- **Search Interest:** 10%
- **Fashion Week Presence:** 5%

## 5. Directory Structure Overview

### Frontend (`frontend/`)
```text
frontend/
├── app/
│   ├── (auth)/
│   ├── admin/
│   ├── trending/
│   ├── fashion/
│   └── page.tsx
├── components/
│   ├── trend-card/
│   ├── radar/
│   └── charts/
├── lib/
└── types/
```

### Backend (`backend/`)
```text
backend/
├── app/
│   ├── api/          # FastAPI Routes
│   ├── models/       # SQLAlchemy Models
│   ├── schemas/      # Pydantic Schemas
│   ├── services/     # Business Logic (Trends, Articles)
│   └── ai/           # Prompts, LLM integration, Embeddings
├── collectors/       # Scrapers, RSS parsers
└── workers/          # Celery background tasks
```
