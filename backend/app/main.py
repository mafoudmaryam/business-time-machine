"""FastAPI app entry point.

Run migrations first (`alembic upgrade head`), then start this with uvicorn --
see the backend README / the commands the assistant printed after setup.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import beginner, businesses, coach, deletions, how, sketch, industries, interpret, scenarios, simulations

app = FastAPI(
    title="Business Time Machine API",
    description="Small food-service business decision simulator backend. The engine (btm_engine) "
                "does all the math; this API stores businesses, scenarios and results around it.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(businesses.router)
app.include_router(industries.router)
app.include_router(scenarios.router)
app.include_router(simulations.router)
app.include_router(coach.router)
app.include_router(interpret.router)
app.include_router(beginner.router)
app.include_router(deletions.router)
app.include_router(sketch.router)
app.include_router(how.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
