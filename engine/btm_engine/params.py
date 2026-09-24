"""Inputs to the café model: the owner's business profile and the industry template.

Symbols follow the model spec (section 2).
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass(frozen=True)
class CafeBaseline:
    """What the owner enters: the café as it is today (monthly figures)."""

    customers: float = 900.0          # C0  regular customers
    cash: float = 25_000.0            # K0  cash balance
    staff_fte: float = 5.0            # S0  full-time equivalents
    avg_ticket: float = 6.50          # p0  spend per visit
    visits_per_regular: float = 6.0   # f   visits per regular per month
    walk_in_visits: float = 2_500.0   # W   non-regular visits per month
    cogs_ratio: float = 0.30          # c   food and drink cost share of revenue
    wage_per_fte: float = 3_000.0     # w   monthly wage per FTE
    fixed_costs: float = 15_000.0     # F   rent, utilities, other fixed costs
    marketing: float = 400.0          # M0  monthly marketing spend
    churn_rate: float = 0.05          # δ0  monthly churn of regulars (owner estimate)
    seats: int = 35
    open_days: float = 28.0           # d   opening days per month

    def validate(self) -> None:
        if self.customers < 0 or self.staff_fte < 0 or self.avg_ticket <= 0:
            raise ValueError("customers and staff must be >= 0 and avg_ticket > 0")
        if not 0 <= self.cogs_ratio < 1:
            raise ValueError("cogs_ratio must be in [0, 1)")
        if not 0 <= self.churn_rate <= 1:
            raise ValueError("churn_rate must be in [0, 1]")
        if self.open_days <= 0 or self.open_days > 31:
            raise ValueError("open_days must be in (0, 31]")

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class CafeTemplate:
    """Industry-template parameters. The point values are used for the
    deterministic run; the ranges drive the Monte Carlo (spec section 5)."""

    # Price elasticity of visits ε: triangular(min, mode, max). Andreyeva et al. 2010.
    elasticity: tuple[float, float, float] = (-1.76, -0.81, -0.23)
    # Short-run share φ of the price response: triangular. The share φ acts at once
    # on visit frequency; the rest (1-φ) acts slowly through churn, via η = -ε(1-φ).
    # This keeps the long-run elasticity of visits equal to ε (see model.py).
    short_run_share: tuple[float, float, float] = (0.3, 0.5, 0.7)
    # Baseline churn range (min, max) around the owner's estimate.
    churn_range: tuple[float, float] = (0.05, 0.12)
    # Marketing curvature γ in inflow = α·(M + m_ref)^γ: uniform(min, max); 0.5 = √M.
    marketing_curvature: tuple[float, float] = (0.3, 0.7)
    # Word-of-mouth rate β: uniform(min, max), new regulars per regular per month.
    word_of_mouth: tuple[float, float] = (0.005, 0.02)
    # Monthly demand noise e_t ~ Normal(1, sd).
    demand_noise_sd: float = 0.05

    awareness0: float = 0.30          # A0 starting brand awareness
    awareness_decay: float = 0.10     # ρ  monthly decay of awareness
    marketing_ref: float = 100.0      # m_ref so a café with zero marketing keeps some awareness
    service_penalty: float = 1.0      # λ  churn multiplier at zero service quality
    visits_per_fte: float = 1_800.0   # κ  visits one FTE can serve per month at d0 days
    utilities_share: float = 0.20     # share of fixed costs that scales with opening days
    seasonality: tuple[float, ...] = (1.0,) * 12   # s_m for Jan..Dec
    start_calendar_month: int = 1     # calendar month of simulation month 1

    def mode_values(self) -> dict:
        """Point values for the deterministic run."""
        return {
            "elasticity": self.elasticity[1],
            "short_run_share": self.short_run_share[1],
            "marketing_curvature": sum(self.marketing_curvature) / 2,
            "word_of_mouth": sum(self.word_of_mouth) / 2,
        }

    def season(self, t: int) -> float:
        """Seasonality index for simulation month t (0-based)."""
        return self.seasonality[(self.start_calendar_month - 1 + t) % 12]


@dataclass
class Draws:
    """One set of uncertain parameters per Monte Carlo run (arrays of length N)."""

    elasticity: "object"
    short_run_share: "object"
    churn0: "object"
    marketing_curvature: "object"
    word_of_mouth: "object"
    noise: "object" = field(default=None)   # shape (N, T), or None for no noise

    @property
    def n(self) -> int:
        import numpy as np
        return int(np.asarray(self.elasticity).shape[0])
