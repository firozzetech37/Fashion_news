# Starting TrendScope

The commands to run the site on your own computer. Each part runs in its own terminal window.

First go to the project folder. The quotes are needed because the folder name has a space in it:

```bash
cd "/Users/vaasu/Documents/MY_PROJECT/Fashion New"
```

## Everyday start

Use this when setup is already done (see [First-time setup](#first-time-setup) below).

**Terminal 1: API** (http://localhost:8000, API docs at http://localhost:8000/docs)

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Terminal 2: Website** (http://localhost:3000)

```bash
cd frontend
npm run dev
```

Open http://localhost:3000 in your browser. Start the API first, or the website shows "API unavailable".

**Terminal 3 (optional): Background jobs**

Collects news, runs the AI pipeline and the trend engine on a schedule. Needs `REDIS_URL` in `backend/.env`.

```bash
cd backend
source venv/bin/activate
celery -A workers.celery_app worker -B --loglevel=info
```

**Run the jobs once, without Celery**

With the API running, and `JOBS_TOKEN` set in `backend/.env`:

```bash
curl -X POST "http://localhost:8000/api/jobs/run?job=tick" -H "X-Jobs-Token: YOUR_JOBS_TOKEN"
```

`job` can be `tick` (everything that is due), `collect`, `topics`, `ai`, `search` or `trends`.

**To stop:** press `Ctrl+C` in each terminal.

## First-time setup

Only needed once, or on a new computer.

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env               # then fill in your keys
python app/core/init_db.py         # create/upgrade database tables
python -m app.core.seed_sources    # add the news sources

# Website (from the project folder)
cd frontend
npm install
cp .env.example .env.local         # then fill in your keys
```

## After pulling new code

```bash
# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
python app/core/init_db.py

# Website (from the project folder)
cd frontend
npm install
```

## Check the production build

To try the website the way it runs on Vercel:

```bash
cd frontend
npm run build
npm start
```

## Problems

| You see | Fix |
|---|---|
| `command not found: uvicorn` or `celery` | You forgot `source venv/bin/activate` in that terminal. |
| `Address already in use` | Something is already on that port. Stop it with `lsof -ti :8000 \| xargs kill` (or `:3000` for the website). |
| Website says "API unavailable" | The API (Terminal 1) isn't running, or it crashed. Check that terminal for errors. |
| `cd: no such file or directory` | Put quotes around the folder path, because of the space in `Fashion New`. |
