"""Request/response shapes for the API (Pydantic models)."""
from __future__ import annotations

import datetime as dt
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class AssumedFieldIn(BaseModel):
    """A number the app filled in for the owner, and the plain-words rule it came from."""

    field: str
    rule: str = Field(max_length=300)


class BaselineOut(BaselineIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: dt.datetime
    assumed_fields: Optional[list[AssumedFieldIn]] = None


class BaselinePatch(BaseModel):
    """PATCH /businesses/{id}/baseline -- change some of the owner's numbers (makes a new snapshot)."""

    customers: Optional[float] = Field(None, ge=0)
    cash: Optional[float] = None
    staff_fte: Optional[float] = Field(None, ge=0)
    avg_ticket: Optional[float] = Field(None, gt=0)
    visits_per_regular: Optional[float] = Field(None, gt=0)
    walk_in_visits: Optional[float] = Field(None, ge=0)
    cogs_ratio: Optional[float] = Field(None, ge=0, lt=1)
    wage_per_fte: Optional[float] = Field(None, ge=0)
    fixed_costs: Optional[float] = Field(None, ge=0)
    marketing: Optional[float] = Field(None, ge=0)
    churn_rate: Optional[float] = Field(None, ge=0, le=1)
    seats: Optional[int] = Field(None, ge=0)
    open_days: Optional[float] = Field(None, gt=0, le=31)


class BusinessCreate(BaseModel):
    name: str
    industry: str = "cafe"
    currency: str = Field("USD", pattern=r"^[A-Za-z]{3}$", description="ISO 4217 currency code, e.g. USD, EUR, JPY.")
    # None means "use this industry's default baseline" -- see routers/businesses.py.
    baseline: Optional[BaselineIn] = None
    # How the numbers were gathered, and which of them the app filled in (quick start only).
    setup_source: Literal["full", "quick", "guide"] = "full"
    assumed_fields: Optional[list[AssumedFieldIn]] = None

    @field_validator("currency")
    @classmethod
    def _uppercase_currency(cls, v: str) -> str:
        return v.upper()


class BusinessOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    industry: str
    currency: str
    created_at: dt.datetime
    setup_source: str = "full"
    is_sample: bool = False
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


class StartingMonthOut(BaseModel):
    """POST /industries/{id}/preview -- the engine's month 1 for unsaved numbers."""

    sales: float
    ingredient_costs: float
    staff_costs: float
    rent_and_other_costs: float
    marketing: float
    costs: float
    profit: float


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
    confirmed_via: Optional[str] = Field(None, pattern=r"^[a-z_]{1,30}$")   # how it was confirmed (thesis data)

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


# ---------- coach ----------


class CoachStatusOut(BaseModel):
    enabled: bool
    mode: Optional[str] = None  # only filled in when COACH_SHOW_MODE=true


class IdeaResultOut(BaseModel):
    """All numbers here come straight from the engine's simulation of the idea."""

    profit_change_most_likely: float
    beats_change_nothing_of_10: int
    cash_runs_out_of_10: int
    profit_bad_case: float
    profit_most_likely: float
    profit_good_case: float


class CoachIdeaOut(BaseModel):
    title: str
    why: str
    builds_on: str  # a scenario name from the run, or "baseline"
    builds_on_scenario_id: Optional[int] = None
    decisions: list[dict[str, Any]]  # flat DECISIONS_JSON_SCHEMA shape, to be added on top of builds_on
    decision_texts: list[str]
    result: IdeaResultOut


class VerdictOut(BaseModel):
    key: str   # good | try | risky | no  (decided by rules from the engine facts, never by the AI)
    label: str


class BarOut(BaseModel):
    key: str
    label: str    # plain words, e.g. "Higher prices"
    amount: float  # money; positive helps, negative hurts


class TileOut(BaseModel):
    key: str        # profit | cash | customers
    now: float
    later: float


class CoachSummaryOut(BaseModel):
    """The skimmable part of the card. Every number comes from the engine."""

    tiles: list[TileOut]
    customers_word: str
    scenario: str
    verdict: VerdictOut
    months: int
    profit_change: float
    better_of_10: Optional[int] = None
    regulars_change_count: int
    regulars_change_percent: int
    bars: list[BarOut]
    risk_flags: list[str]
    has_risk: bool


class CoachOut(BaseModel):
    mode: str
    model: Optional[str] = None
    fallback: bool
    headline: str
    what_happens: str
    why: str
    watch_out: list[str]
    summary: CoachSummaryOut
    ideas: list[CoachIdeaOut]
    generated_at: str
    # none (no AI in use) | pending (AI still writing; this is the rule-based version) | done | failed
    ai_status: str = "none"


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=500)


class AskOut(BaseModel):
    id: int
    question: str
    answer: str
    mode: str                     # "template" until an AI answer has replaced the instant one
    fallback: bool                # the AI was tried and failed, so the rule-based answer stays
    ai_status: str                # none | pending | done | failed
    answered: bool                # False: the rules could not tell (the frontend then offers `suggestions`)
    suggestions: list[str] = []


# ---------- plain-language decision input ("interpret") ----------


class InterpretAnswerIn(BaseModel):
    id: str = ""            # the question's id, e.g. "0:when"
    question: str = ""
    answer: str = Field(..., max_length=300)


class InterpretIn(BaseModel):
    text: str = Field(..., max_length=2000)
    answers: list[InterpretAnswerIn] = []


class InterpretedDecisionOut(BaseModel):
    """A decision in the flat DECISIONS_JSON_SCHEMA shape (ratios, not percentages), plus how it was read."""

    type: str
    start_month: int
    value: float
    unit: str
    loan_months: Optional[int] = None
    annual_rate: Optional[float] = None
    capacity_pct: Optional[float] = None
    cogs_ratio: Optional[float] = None
    investment: Optional[float] = None
    source_quote: str                  # the owner's exact words ("" when it cannot be shown)
    sentence: str                      # plain words, industry vocabulary and currency
    when_label: str                    # "March 2027 (month 6)"
    group: Optional[str] = None        # a temporary change is a start + an end sharing one group id
    role: Optional[str] = None         # "start" | "end"
    group_sentence: Optional[str] = None


class InterpretQuestionOut(BaseModel):
    id: str
    slot: str
    text: str
    about: str = ""
    options: Optional[list[str]] = None
    hint: str = ""


class OutOfScopeOut(BaseModel):
    message: str
    can_do: list[str]
    quotes: list[str] = []


class InterpretationOut(BaseModel):
    id: int
    business_id: int
    text: str
    status: str                        # "pending" (the AI is reading) | "done"
    provider: Optional[str] = None     # hidden unless COACH_SHOW_MODE is on
    fallback: Optional[bool] = None
    decisions: list[InterpretedDecisionOut]
    questions: list[InterpretQuestionOut]
    out_of_scope: Optional[OutOfScopeOut] = None
    notes: list[str]
    month_one: str


class InterpretOutcomeIn(BaseModel):
    decisions: list[DecisionIn]
    scenario_id: Optional[int] = None


class InterpretOutcomeOut(BaseModel):
    ai_decisions: int
    unchanged: int
    edited: int
    removed: int
    added_by_hand: int
    final_decisions: int
    confirmed: int
    confirmed_via: dict[str, int] = {}    # how the confirmed decisions were confirmed
    scenario_id: Optional[int] = None


# ---------- beginner journey: quick start, sample, today, events, config ----------


class QuickStartIn(BaseModel):
    """POST /industries/{id}/quick_baseline -- the four easy answers."""

    customers_per_day: float = Field(gt=0, le=20_000)
    avg_spend: float = Field(gt=0, le=100_000)
    monthly_rent: float = Field(ge=0, le=100_000_000)
    staff: float = Field(gt=0, le=500)


class QuickStartOut(BaseModel):
    baseline: BaselineIn
    assumed: list[AssumedFieldIn]
    warnings: list[str]
    preview: StartingMonthOut


class SampleBusinessIn(BaseModel):
    industry: str = "cafe"
    currency: str = Field("USD", pattern=r"^[A-Za-z]{3}$")

    @field_validator("currency")
    @classmethod
    def _uppercase(cls, v: str) -> str:
        return v.upper()


class AssumptionOut(BaseModel):
    """One row of the "what we assumed" note."""

    field: str
    label: str
    value: float
    unit: Literal["money", "count", "percent", "days", "number"]
    rule: str
    important: bool


class TodayNoteOut(BaseModel):
    text: str
    mode: str
    model: Optional[str] = None
    fallback: bool = False
    generated_at: str
    ai_status: str = "none"            # none | pending | done | failed
    ai_started_at: Optional[str] = None


class Band(BaseModel):
    p10: list[float]
    p50: list[float]
    p90: list[float]


class TodayTilesOut(BaseModel):
    profit_a_month: float
    profit_a_month_bad_case: float
    profit_a_month_good_case: float
    cash_now: float
    months_of_bills_covered: int
    cash_runs_out_of_10: int
    lowest_cash_amount: float
    lowest_cash_month: int
    lowest_cash_month_label: str


class TodayOut(BaseModel):
    business_id: int
    name: str
    industry: str
    currency: str
    is_sample: bool
    setup_source: str = "full"          # "guide": made from the start-up guide, so Today shows the starting-picture banner
    run_id: int
    horizon: int
    engine_version: str
    seed: int
    iterations: int
    month_labels: list[str]
    tiles: TodayTilesOut
    profit: Band
    cash: Band
    note: Optional[TodayNoteOut] = None       # None when the coach is switched off
    assumptions: list[AssumptionOut]
    assumed_by_app: bool                       # False: the owner typed every number


# ---------- journal: what really happened, against what we expected ----------

_MONEY = dict(ge=-1e12, le=1e12, allow_inf_nan=False)
MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


class JournalEntryIn(BaseModel):
    month: str = Field(pattern=MONTH_PATTERN)                  # "YYYY-MM"
    actual_profit: float = Field(**_MONEY)
    actual_cash: float = Field(**_MONEY)
    actual_visits: float = Field(ge=0, le=1e9, allow_inf_nan=False)
    note: Optional[str] = Field(None, max_length=1000)


class JournalEntryUpdate(BaseModel):
    """PUT /businesses/{id}/journal/{month}: the month is in the address."""
    actual_profit: float = Field(**_MONEY)
    actual_cash: float = Field(**_MONEY)
    actual_visits: float = Field(ge=0, le=1e9, allow_inf_nan=False)
    note: Optional[str] = Field(None, max_length=1000)


class JournalEntryOut(BaseModel):
    id: int
    business_id: int
    month: str
    month_label: str                                           # "October 2026"
    actual_profit: float
    actual_cash: float
    actual_visits: float
    note: Optional[str] = None
    created_at: dt.datetime


class JournalComparisonOut(BaseModel):
    metric: Literal["profit", "cash", "visits"]
    actual: float
    expected_low: float
    expected: float
    expected_high: float
    difference: float
    percent_difference: Optional[float] = None
    position: Literal["below", "inside", "above"]
    sentence: str


class JournalMonthOut(BaseModel):
    entry: JournalEntryOut
    has_prediction: bool
    prediction_run_id: Optional[int] = None
    comparisons: list[JournalComparisonOut]                    # empty when there was no prediction for the month
    summary: str                                               # plain sentence, no AI


class JournalDueOut(BaseModel):
    month: str
    month_label: str


class JournalAccuracyOut(BaseModel):
    metric: Literal["profit", "cash", "visits"]
    months: int
    inside: int
    below: int
    above: int
    mean_difference: Optional[float] = None
    mean_abs_percent_difference: Optional[float] = None


class JournalForecastMonth(BaseModel):
    month: str
    month_label: str
    p10: float
    p50: float
    p90: float


class JournalForecast(BaseModel):
    """What the latest Today forecast said about profit, month by month (for the chart)."""
    run_id: int
    months: list[JournalForecastMonth]


class JournalOut(BaseModel):
    business_id: int
    currency: str
    is_sample: bool
    entries: list[JournalMonthOut]                             # newest month first
    due: list[JournalDueOut]                                   # months that ended, have a forecast, no entry yet
    accuracy: list[JournalAccuracyOut]                         # empty until a month has been compared
    forecast: Optional[JournalForecast] = None                 # None until a Today forecast exists


class JournalAccuracyRow(BaseModel):
    business_id: int
    month: str
    metric: str
    actual: float
    expected_low: float
    expected: float
    expected_high: float
    difference: float
    percent_difference: Optional[float] = None
    position: str
    engine_version: str
    seed: int
    iterations: int


class JournalAccuracyReport(BaseModel):
    """GET /journal/accuracy -- thesis output: every compared month, and totals per metric."""
    pilot: bool = True
    rows: list[JournalAccuracyRow]
    totals: list[JournalAccuracyOut]


class EventIn(BaseModel):
    name: str = Field(pattern=r"^[a-z0-9_]{1,40}$")
    screen: Optional[str] = Field(None, pattern=r"^[a-z0-9_/\-]{1,60}$")
    payload: Optional[dict[str, Any]] = None


class EventsIn(BaseModel):
    session_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    business_id: Optional[int] = None
    events: list[EventIn] = Field(min_length=1, max_length=50)


class EventsOut(BaseModel):
    stored: int


class ConfigOut(BaseModel):
    """GET /config -- what the frontend needs to know once, at start."""

    coach_enabled: bool
    coach_mode: Optional[str] = None          # only when COACH_SHOW_MODE=true
    study_mode: bool = False                  # reserved for the study release


# ---------- delete / undo ----------


class DeletedOut(BaseModel):
    """DELETE /... -- what was hidden, so the front end can say so and offer "Undo"."""

    id: int
    kind: Literal["business", "scenario", "run", "journal", "plan"]
    name: str
    deleted_at: dt.datetime


class ScenarioImpact(BaseModel):
    """What deleting a scenario also takes with it: its steps. Runs that used it keep their saved results."""

    decisions: int
    runs: int


class BusinessImpact(BaseModel):
    scenarios: int
    runs: int


# ---------- "Try a change": the quick sketch ----------


class StartOption(BaseModel):
    key: str
    label: str            # "Next month"
    month: int            # simulation month 1-12
    name: str             # "November 2026"


class StartOptionsOut(BaseModel):
    options: list[StartOption]


class PreviewChangeIn(BaseModel):
    """POST /businesses/{id}/preview_change -- one slider position. The ranges are checked by the engine."""

    type: Literal["price", "hours", "hiring", "marketing"]
    amount: float = Field(allow_inf_nan=False)
    start_month: int = Field(1, ge=1, le=12)


class SketchPath(BaseModel):
    profit: Band
    cash: Band
    customers: Band
    lowest_cash_amount: float
    lowest_cash_month: int


class PriceExample(BaseModel):
    before: float
    after: float


class PreviewChangeOut(BaseModel):
    just_a_sketch: bool = True        # the page must say so; nothing here is stored or explained by the AI
    type: str
    amount: float
    start_month: int
    start_label: str
    sentence: str
    engine_version: str
    seed: int
    iterations: int
    horizon: int
    month_labels: list[str]
    extra_profit_per_month: float
    profit_per_month_with_change: float
    profit_per_month_without: float
    visits_change_per_month: float
    visits_per_month_without: float
    ahead_of_10: int
    cash_now: float
    change: SketchPath
    baseline: SketchPath
    example: Optional[PriceExample] = None


# ---------- "How we worked it out" and the share page ----------


class HowItem(BaseModel):
    """One number the owner gave us, in their own words."""

    key: str
    label: str
    value: float
    unit: Literal["money", "count", "percent", "days", "number"]


class HowRun(BaseModel):
    """What the stored run behind the Today page used, so the answer can be repeated."""

    iterations: int
    horizon: int
    engine_version: str
    seed: int


class HowOut(BaseModel):
    business_id: int
    name: str
    industry: str
    currency: str
    is_sample: bool
    setup_source: str
    told: list[HowItem]                 # the owner's own numbers
    assumed: list[AssumptionOut]        # the numbers we filled in, each with its rule
    run: HowRun


# ---------- "I don't have a business yet": the start-up guide ----------

class GuideAnswersIn(BaseModel):
    """The nine screens' answers. Words are checked by the engine (btm_engine.startup.parse_answers), which answers in plain
    sentences, so here everything is loose and optional: a missing or odd answer becomes a 422 with that sentence."""

    business_type: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    budget: Optional[float] = None
    premises: Optional[str] = None
    rent: Optional[float] = None
    size: Optional[str] = None
    menu: Optional[str] = None
    alcohol: Optional[str] = None
    people: Optional[float] = None
    customers_per_day: Optional[float] = None
    avg_spend: Optional[float] = None
    ingredient_share: Optional[float] = None
    timeline: Optional[str] = None


class GuidePlanOut(BaseModel):
    id: int
    created_at: dt.datetime
    business_id: Optional[int] = None
    data_version: str                  # the version of the data file the plan below was worked out with
    data_changed: bool                 # the person last saw an older version of the data file
    plan: dict[str, Any]


class GuidePlanSummary(BaseModel):
    id: int
    created_at: dt.datetime
    country: str
    business_type: str
    business_id: Optional[int] = None


class GuideSimulatorOut(BaseModel):
    """What "Try it in the simulator" would set up (same shape as the quick start), or what is still missing."""

    ready: bool
    missing: list[str]
    notes: list[str]
    quick: Optional[QuickStartOut] = None


class GuideLinkIn(BaseModel):
    business_id: int
