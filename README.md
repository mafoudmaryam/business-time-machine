# Business Time Machine

An AI-assisted decision simulator for small food-service businesses (café, restaurant,
bakery). An owner describes a decision in plain language ("raise prices 10% in
March"), confirms the parameters extracted from it, and a deterministic-plus-Monte-Carlo
engine projects revenue, profit, cash and customers for 12-36 months against what
happens if they change nothing. Built as a master's thesis project investigating
whether AI-assisted simulation helps non-expert owners compare the consequences of a
decision before committing to it.

**Screenshot:** _(add a screenshot of the comparison dashboard here)_

**Defaults are US-based.** The example numbers the setup wizard pre-fills (customer
counts, wages, rent, etc.) are rough benchmarks for a typical small business *in the
United States* -- they are not sourced for any other country's costs or customer
behaviour. The wizard says so and expects the owner to replace them with their own
numbers; only the money amounts adapt automatically, via the currency picker (any
ISO 4217 code, USD by default) and `Intl.NumberFormat`.

## Install and run (Windows)

Prerequisites: Python 3.11+ with a venv at `backend/.venv` and `engine/.venv` (or one
shared venv with both installed editable), and Node.js 18+.

One-time setup:

```powershell
cd backend
.venv\Scripts\Activate.ps1
alembic upgrade head          # creates backend/btm.db
python seed_demo.py           # optional: adds a "Demo Cafe" with 3 confirmed scenarios
cd ..\frontend
npm install
```

To reset the database and reseed from scratch:

```powershell
cd backend
Remove-Item btm.db
alembic upgrade head
python seed_demo.py
```

Then, from the repo root, start both servers at once:

```powershell
.\start.ps1
```

This opens two PowerShell windows (backend on http://localhost:8000, frontend on
http://localhost:5173), freeing port 8000 first if an old server is still on it. Stop
both with:

```powershell
.\stop.ps1
```

To start them by hand instead, in two separate terminals:

```powershell
# Terminal 1 -- backend
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000

# Terminal 2 -- frontend
cd frontend
npm run dev
```

## Running tests

```powershell
# Engine
cd engine
python -m pytest

# Backend
cd backend
python -m pytest

# Frontend
cd frontend
npm test
npm run build   # type-checks and bundles
```

## Folder overview

- `engine/` -- the simulation engine (`btm_engine`): pure Python + NumPy, no web or
  database imports. Turns a `BusinessBaseline` and a list of `Decision` objects into
  deterministic and Monte Carlo projections, using one of three `IndustryTemplate`s
  (café/restaurant/bakery, see `btm_engine/templates/`). The only source of every
  number shown anywhere in the app.
- `backend/` -- FastAPI + SQLAlchemy + Alembic, SQLite by default (`btm.db`). Stores
  businesses (including their industry and currency), scenarios, decisions and
  simulation runs; `app/engine_bridge.py` is the only file that imports the engine.
  `seed_demo.py` seeds sample data.
- `frontend/` -- React + TypeScript + Vite, Recharts for the bad-case/most-likely/
  good-case band charts. `src/api.ts` is the single typed client for the backend;
  `src/pages/` holds the four pages (business setup, scenario builder, comparison
  dashboard, run history). Money is formatted with `Intl.NumberFormat` in each
  business's own currency -- nothing is hard-coded to one currency.
- `start.ps1` / `stop.ps1` -- start or stop both dev servers together.
- `CLAUDE.md` -- project context and ground rules for AI-assisted development.
