"""FastAPI app entry point.

Run migrations first (`alembic upgrade head`), then start this with uvicorn --
see the backend README / the commands the assistant printed after setup.
"""
from __future__ import annotations

from fastapi import FastAPI

from .routers import businesses, scenarios, simulations

app = FastAPI(
    title="Business Time Machine API",
    description="Café decision simulator backend. The engine (btm_engine) does all the math; "
                "this API stores businesses, scenarios and results around it.",
    version="0.1.0",
)

app.include_router(businesses.router)
app.include_router(scenarios.router)
app.include_router(simulations.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
