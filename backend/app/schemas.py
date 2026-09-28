"""Request/response shapes for the API (Pydantic models)."""
from __future__ import annotations

import datetime as dt
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

# ---------- businesses ----------


class BaselineIn(BaseModel):
    """What the owner enters: the business as it is today. Mirrors btm_engine.BusinessBaseline."""

    customers: float = 900.0
    cash: float = 25_000.0
    staff_fte: float = 5.0
    avg_ticket: float = 6.50
    visits_per_regular: float = 6.0
    walk_in_visits: float = 2_500.0
    cogs_ratio: float = Field(0.30, ge=0, lt=1)
    wage_per_fte: float = 3_000.0
    fixed_costs: float = 15_000.0
    marketing: float = 400.0
    churn_rate: float = Field(0.05, ge=0, le=1)
    seats: int = 35
    open_days: float = Field(28.0, gt=0, le=31)


class BaselineOut(BaselineIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: dt.datetime


class BusinessCreate(BaseModel):
    name: str
    industry: str = "cafe"
    # None means "use this industry's default baseline" -- see routers/businesses.py.
    baseline: Optional[BaselineIn] = None


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    industry: str
    created_at: dt.datetime
    baseline: Optional[BaselineOut]


# ---------- industries ----------


class IndustryOut(BaseModel):
    """GET /industries -- so the frontend never hard-codes café wording/defaults."""

    id: str
    display_name: str
    customer_noun: str
    staff_noun: str
    capacity_label: str
    default_baseline: BaselineIn
    field_labels: dict[str, str]


# ---------- scenarios / decisions ----------


class DecisionIn(BaseModel):
    """One decision lever, in the flat shape btm_engine.DECISIONS_JSON_SCHEMA expects."""

    type: str
    start_month: int
    value: float
    unit: str
    loan_months: Optional[int] = None
    annual_rate: Optional[float] = None
    capacity_pct: Optional[float] = None
    cogs_ratio: Optional[float] = None
    investment: Optional[float] = None
    source: str = "user"  # "user" | "ai"
    confirmed: bool = False

    _EXTRA_FIELDS = ("loan_months", "annual_rate", "capacity_pct", "cogs_ratio", "investment")

    def to_schema_dict(self) -> dict[str, Any]:
        """The raw dict shape used to validate against DECISIONS_JSON_SCHEMA."""
        d: dict[str, Any] = {
            "type": self.type, "start_month": self.start_month, "value": self.value, "unit": self.unit,
        }
        for field_name in self._EXTRA_FIELDS:
            value = getattr(self, field_name)
            if value is not None:
                d[field_name] = value
        return d

    def extra_dict(self) -> dict[str, Any]:
        return {k: v for k, v in self.to_schema_dict().items()
                if k not in ("type", "start_month", "value", "unit")}


class DecisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    start_month: int
    value: float
    unit: str
    extra: dict[str, Any]
    source: str
    confirmed: bool


class ScenarioCreate(BaseModel):
    name: str
    parent_scenario_id: Optional[int] = None
    decisions: list[DecisionIn] = Field(default_factory=list)


class ScenarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    name: str
    parent_scenario_id: Optional[int]
    parent_scenario_name: Optional[str] = None
    created_at: dt.datetime
    decisions: list[DecisionOut]


# ---------- simulations ----------


class SimulateRequest(BaseModel):
    """POST /businesses/{id}/simulate -- compare up to 3 scenarios on the same draws."""

    scenario_ids: list[int] = Field(min_length=1, max_length=3)
    horizon: int = Field(24, ge=12, le=36)
    iterations: int = Field(1000, ge=100, le=20_000)
    seed: Optional[int] = None


class SingleSimulateRequest(BaseModel):
    """POST /scenarios/{id}/simulate -- shortcut for a single scenario."""

    horizon: int = Field(24, ge=12, le=36)
    iterations: int = Field(1000, ge=100, le=20_000)
    seed: Optional[int] = None


class ScenarioResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    scenario_id: Optional[int]
    scenario_name: str
    bands: dict[str, Any]
    summary: dict[str, Any]


class SimulationRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    business_id: int
    engine_version: str
    seed: int
    iterations: int
    horizon: int
    created_at: dt.datetime
    results: list[ScenarioResultOut]


class SimulationRunSummaryOut(BaseModel):
    """Lightweight row for a run-history list -- no bands/summary payload."""

    id: int
    business_id: int
    engine_version: str
    seed: int
    iterations: int
    horizon: int
    created_at: dt.datetime
    scenario_names: list[str]
