# Business Time Machine

Master's thesis project: an AI-assisted decision simulator for small cafés. An owner describes a decision in plain language ("raise prices 10% in March"). Claude turns it into structured parameters, the user confirms them, and a deterministic plus Monte Carlo engine projects revenue, profit, cash and customers for 12–36 months, compared against a baseline.

Thesis question: does AI-assisted simulation help non-expert owners compare the consequences of decisions before committing?

## Golden rules
1. **The LLM never computes numbers.** It only (a) turns text into `Decision` objects that are validated against `DECISIONS_JSON_SCHEMA` and (b) explains results using the engine's output. Every number comes from `engine/btm_engine`.
2. **Human in the loop:** the user confirms the parameters the LLM extracted before any simulation runs.
3. **The engine stays standalone:** no web or database imports inside `engine/btm_engine`.
4. **Reproducibility:** store `engine_version`, `seed` and `iterations` with every run.
5. **Scope:** one industry (café), six decision types (price, hiring, marketing, hours, menu, investment). Push back on scope creep.
6. Keep all tests passing (`cd engine && python -m pytest`). Add tests with every feature.

## Current state
- `engine/` is done: model, Monte Carlo (Latin hypercube sampling, common random numbers), sensitivity analysis, 19 tests, and a demo. See `engine/README.md`.
- The model spec (equations, sources, validation plan) lives in a Claude Doc the user can share with you.
- Known issue: the marketing (α, γ) and word-of-mouth (β) parameters are uncalibrated and look too optimistic.

## Planned architecture
- `backend/`: Python FastAPI, PostgreSQL (results stored as JSONB), SQLAlchemy + Alembic, JWT auth. The engine runs inline, since 1,000 runs take about 0.1 s.
- `frontend/`: React + TypeScript + Vite, Recharts for the p10/p50/p90 band charts.
- AI layer: Claude API with tool use for NL → decisions, and grounded explanations that stream to the frontend over SSE. Log every call to the `ai_interactions` table, because that data feeds the evaluation chapter.
- `docker-compose.yml`: frontend, API, PostgreSQL.

Database tables: users, businesses, business_snapshots, scenarios (with parent_scenario_id for versioning), decisions (source user|ai, confirmed bool), simulation_runs (engine_version, seed, iterations, summary JSONB), simulation_results (metric, p10/p50/p90 arrays), ai_interactions, assumptions.

## Environment
- Windows. Use PowerShell commands, and a Python venv at `engine/.venv` or the repo root.
- The user is a student and is learning, so explain what you change in plain words.
