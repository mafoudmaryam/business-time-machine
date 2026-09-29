"""Database tables.

Names and columns follow the schema sketched in CLAUDE.md, scoped down to
what the current endpoints need (no users / auth / ai_interactions yet).
"""
from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from .database import Base


class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    industry = Column(String, nullable=False, default="cafe", server_default="cafe")
    currency = Column(String, nullable=False, default="USD", server_default="USD")
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)

    snapshots = relationship(
        "BusinessSnapshot", back_populates="business", cascade="all, delete-orphan",
        order_by="BusinessSnapshot.id",
    )
    scenarios = relationship("Scenario", back_populates="business", cascade="all, delete-orphan")
    simulation_runs = relationship("SimulationRun", back_populates="business", cascade="all, delete-orphan")

    @property
    def baseline(self) -> "BusinessSnapshot | None":
        """The most recent snapshot -- what the engine treats as 'today'."""
        return self.snapshots[-1] if self.snapshots else None


class BusinessSnapshot(Base):
    """The owner's numbers at a point in time -- mirrors btm_engine.BusinessBaseline."""

    __tablename__ = "business_snapshots"

    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)

    customers = Column(Float, nullable=False, default=900.0)
    cash = Column(Float, nullable=False, default=25_000.0)
    staff_fte = Column(Float, nullable=False, default=5.0)
    avg_ticket = Column(Float, nullable=False, default=6.5)
    visits_per_regular = Column(Float, nullable=False, default=6.0)
    walk_in_visits = Column(Float, nullable=False, default=2_500.0)
    cogs_ratio = Column(Float, nullable=False, default=0.30)
    wage_per_fte = Column(Float, nullable=False, default=3_000.0)
    fixed_costs = Column(Float, nullable=False, default=15_000.0)
    marketing = Column(Float, nullable=False, default=400.0)
    churn_rate = Column(Float, nullable=False, default=0.05)
    seats = Column(Integer, nullable=False, default=35)
    open_days = Column(Float, nullable=False, default=28.0)

    business = relationship("Business", back_populates="snapshots")


class Scenario(Base):
    __tablename__ = "scenarios"
    __table_args__ = (UniqueConstraint("business_id", "name", name="uq_scenario_business_name"),)

    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False)
    parent_scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)

    business = relationship("Business", back_populates="scenarios")
    decisions = relationship("Decision", back_populates="scenario", cascade="all, delete-orphan")
    parent = relationship("Scenario", remote_side=[id])

    @property
    def parent_scenario_name(self) -> "str | None":
        return self.parent.name if self.parent is not None else None


class Decision(Base):
    """One decision lever. Matches btm_engine.Decision plus who added it and
    whether the user has confirmed it (golden rule 2: human in the loop)."""

    __tablename__ = "decisions"

    id = Column(Integer, primary_key=True)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=False)
    type = Column(String, nullable=False)
    start_month = Column(Integer, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
    extra = Column(JSON, nullable=False, default=dict)
    source = Column(String, nullable=False, default="user")  # "user" | "ai"
    confirmed = Column(Boolean, nullable=False, default=False)

    scenario = relationship("Scenario", back_populates="decisions")


class SimulationRun(Base):
    """One call to btm_engine.run_scenarios(): baseline plus 1-3 named scenarios,
    all sharing the same random draws (common random numbers)."""

    __tablename__ = "simulation_runs"

    id = Column(Integer, primary_key=True)
    business_id = Column(Integer, ForeignKey("businesses.id"), nullable=False)
    engine_version = Column(String, nullable=False)
    seed = Column(Integer, nullable=False)
    iterations = Column(Integer, nullable=False)
    horizon = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)

    business = relationship("Business", back_populates="simulation_runs")
    results = relationship("SimulationResult", back_populates="run", cascade="all, delete-orphan")


class SimulationResult(Base):
    """One scenario's bands + summary from a simulation run.
    scenario_id is null for the auto-added baseline."""

    __tablename__ = "simulation_results"

    id = Column(Integer, primary_key=True)
    simulation_run_id = Column(Integer, ForeignKey("simulation_runs.id"), nullable=False)
    scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    scenario_name = Column(String, nullable=False)
    bands = Column(JSON, nullable=False)
    summary = Column(JSON, nullable=False)

    run = relationship("SimulationRun", back_populates="results")


class AiInteraction(Base):
    """Every call to a coach provider (and every template answer), kept as thesis data.
    grounding says whether the numbers in the response were all found in the facts."""

    __tablename__ = "ai_interactions"

    id = Column(Integer, primary_key=True)
    simulation_run_id = Column(Integer, ForeignKey("simulation_runs.id"), nullable=False)
    kind = Column(String, nullable=False)              # "coach" | "ask"
    provider = Column(String, nullable=False)          # "template" | "ollama" | "anthropic"
    model = Column(String, nullable=True)
    attempt = Column(Integer, nullable=False, default=1)
    prompt = Column(Text, nullable=False)
    response = Column(Text, nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    grounding = Column(JSON, nullable=True)            # {"passed": bool, "unmatched": [numbers]}
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)


class CoachResult(Base):
    """The finished coach for a run, cached so reopening a run is instant."""

    __tablename__ = "coach_results"
    __table_args__ = (UniqueConstraint("simulation_run_id", name="uq_coach_run"),)

    id = Column(Integer, primary_key=True)
    simulation_run_id = Column(Integer, ForeignKey("simulation_runs.id"), nullable=False)
    payload = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow, nullable=False)
