"""Business Time Machine simulation engine (café template).

Pure Python + NumPy, no web dependencies. The LLM layer never computes numbers:
it only produces `Decision` objects, and everything numeric comes from here.
"""
from .params import BusinessBaseline, IndustryTemplate, Draws
from .decisions import Decision, DECISION_TYPES, DECISIONS_JSON_SCHEMA, build_timeline
from .model import METRICS, simulate
from .montecarlo import ENGINE_VERSION, RunResult, ScenarioResult, run_deterministic, run_scenarios
from .sensitivity import one_at_a_time
from .explain import month_one_summary, profit_breakdown, key_moments, build_facts, describe_decision, format_money, round_display
from .templates import TEMPLATES, get_template, list_industries

__all__ = [
    "BusinessBaseline", "IndustryTemplate", "Draws", "Decision", "DECISION_TYPES", "DECISIONS_JSON_SCHEMA",
    "build_timeline", "METRICS", "simulate", "ENGINE_VERSION", "RunResult", "ScenarioResult",
    "run_deterministic", "run_scenarios", "one_at_a_time",
    "month_one_summary", "profit_breakdown", "key_moments", "build_facts", "describe_decision", "format_money", "round_display",
    "TEMPLATES", "get_template", "list_industries",
]
