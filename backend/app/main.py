"""FastAPI app entry point.

Run migrations first (`alembic upgrade head`), then start this with uvicorn --
see the backend README / the commands the assistant printed after setup.
"""
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .routers import beginner, businesses, coach, deletions, how, journal, sketch, industries, interpret, scenarios, simulations

app = FastAPI(
    title="Business Time Machine API",
    description="Small food-service business decision simulator backend. The engine (btm_engine) "
                "does all the math; this API stores businesses, scenarios and results around it.",
    version="0.1.0",
)


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError):
    """The usual 422, minus the echoed `input`: a value like NaN cannot be written back as JSON, which turned a clean
    422 into a 500."""
    errors = [{k: v for k, v in e.items() if k not in ("input", "ctx")} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


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
app.include_router(journal.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
