"""Coach flow for one simulation run.

    facts (engine)  ->  provider writes text  ->  grounding check  ->  retry once  ->  template fallback
                    ->  ideas validated + simulated by the engine  ->  cached per run

Every provider call is written to ai_interactions (thesis data), including the fallback.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from typing import Any, Callable, Optional

from jsonschema import ValidationError, validate as jsonschema_validate
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import engine_bridge, models, settings
from . import grounding, prompts, template
from .providers import Provider, ProviderError, make_provider

MAX_IDEAS = 3
MIN_IDEAS = 2
MAX_ATTEMPTS = 2  # the first try, plus one retry


class CoachDisabled(Exception):
    """COACH_ENABLED is off (used to switch the coach off for the user study)."""


# ---------- helpers ----------

def parse_json(text: str) -> dict:
    """Models sometimes wrap JSON in ```json fences or add a sentence around it."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise ValueError("the reply was not JSON")
        value = json.loads(text[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("the reply was not a JSON object")
    return value


def _canon(decision: dict) -> str:
    """A decision as comparable text (10 and 10.0 are the same)."""
    return json.dumps({k: float(v) if isinstance(v, (int, float)) else v for k, v in decision.items()}, sort_keys=True)


def _repair(value: Any) -> Any:
    """Small local models sometimes return UTF-8 read as Latin-1 ("cafÃ©"). Undo that."""
    if isinstance(value, str):
        if "Ã" in value or "â€" in value:
            try:
                return value.encode("latin-1").decode("utf-8")
            except (UnicodeEncodeError, UnicodeDecodeError):
                return value
        return value
    if isinstance(value, list):
        return [_repair(v) for v in value]
    if isinstance(value, dict):
        return {k: _repair(v) for k, v in value.items()}
    return value


def _coach_texts(parsed: dict) -> list[str]:
    texts = [parsed["headline"], parsed["what_happens"], parsed["why"], *parsed["watch_out"]]
    for idea in parsed["ideas"]:
        texts += [idea.get("title", ""), idea.get("why", "")]
    return texts


def _idea_numbers(parsed: dict) -> list[float]:
    """Numbers an idea's own decisions contain, so its title may say "Hire 1 barista from month 6"."""
    nums: list[float] = []
    for idea in parsed.get("ideas", []):
        for d in idea.get("decisions", []) if isinstance(idea.get("decisions"), list) else []:
            if not isinstance(d, dict):
                continue
            for key, v in d.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    nums += [v, v * 100] if key in ("annual_rate", "cogs_ratio") else [v]
    return nums


def _log(db: Session, run_id: int, kind: str, provider: str, model: Optional[str], attempt: int, prompt: str,
         response: Optional[str] = None, prompt_tokens: Optional[int] = None, completion_tokens: Optional[int] = None,
         duration_ms: Optional[int] = None, grounding_result: Optional[dict] = None,
         error: Optional[str] = None) -> models.AiInteraction:
    row = models.AiInteraction(
        simulation_run_id=run_id, kind=kind, provider=provider, model=model, attempt=attempt, prompt=prompt,
        response=response, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
        duration_ms=duration_ms, grounding=grounding_result, error=error,
    )
    db.add(row)
    db.commit()
    return row


def _generate(db: Session, run: models.SimulationRun, kind: str, provider: Provider, facts: dict,
              system: str, user: str, schema: dict, texts_of: Callable[[dict], list[str]],
              extra_numbers: Callable[[dict], list[float]] = lambda p: [],
              reply_schema: Optional[dict] = None) -> Optional[dict]:
    """Ask the provider; accept the reply only if it is valid and every number is grounded.
    Returns the parsed reply, or None if the caller should fall back to the template."""
    note = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        full_user = user + note
        prompt_text = system + "\n\n" + full_user
        try:
            result = provider.complete(system, full_user, schema)
        except ProviderError as exc:
            _log(db, run.id, kind, provider.name, provider.model, attempt, prompt_text, error=str(exc))
            return None  # the provider is down or too slow: do not retry, fall back

        row = _log(db, run.id, kind, provider.name, result.model, attempt, prompt_text, response=result.text,
                   prompt_tokens=result.prompt_tokens, completion_tokens=result.completion_tokens,
                   duration_ms=result.duration_ms)
        try:
            parsed = _repair(parse_json(result.text))
            jsonschema_validate(parsed, reply_schema or schema)
        except (ValueError, ValidationError) as exc:
            row.error = f"invalid reply: {exc}"
            row.grounding = {"passed": False, "unmatched": []}
            db.commit()
            note = "\n\nYour previous reply was not valid JSON in the requested format. Reply with the JSON object only."
            continue

        allowed = grounding.allowed_numbers(facts, extra_numbers(parsed))
        unmatched = grounding.unmatched_numbers(texts_of(parsed), allowed)
        row.grounding = {"passed": not unmatched, "unmatched": unmatched}
        db.commit()
        if not unmatched:
            return parsed
        note = prompts.retry_note(unmatched)
    return None


def _fallback_row(db: Session, run_id: int, kind: str, facts: dict, output: Any) -> None:
    _log(db, run_id, kind, "template", None, 1, "facts: " + json.dumps(facts, ensure_ascii=False),
         response=json.dumps(output, ensure_ascii=False), grounding_result={"passed": True, "unmatched": []})


# ---------- ideas ----------

def _finalize_ideas(db: Session, run: models.SimulationRun, raw_ideas: Any,
                    raw_decisions: dict[str, list[dict]]) -> list[dict]:
    """Keep only valid ideas (schema + engine rules), simulate each on the run's own seed,
    and attach the engine's numbers. The AI wrote only the title and the one-line why."""
    scenario_ids = {r.scenario_name: r.scenario_id for r in run.results if r.scenario_name != "baseline"}
    by_lower = {name.lower(): name for name in scenario_ids}
    currency = run.business.currency
    valid: list[dict] = []
    for idea in raw_ideas if isinstance(raw_ideas, list) else []:
        try:
            title, why = str(idea["title"]).strip(), str(idea["why"]).strip()
            builds_on = str(idea.get("builds_on") or "baseline").strip()
            builds_on = "baseline" if builds_on.lower() == "baseline" else by_lower[builds_on.lower()]
            decisions = engine_bridge.clean_idea_decisions(idea["decisions"], run.horizon)
        except (KeyError, TypeError, ValueError):
            continue  # invalid idea: dropped
        if not title or not why:
            continue
        # An idea that changes a lever the scenario already changes would just stack on top of it
        # (e.g. "+1.1% prices" on top of "+10% prices"), which is confusing. Drop it.
        if builds_on == "baseline" and any(
                sorted(map(_canon, decisions)) == sorted(map(_canon, existing))
                for existing in raw_decisions.values()):
            continue  # just repeats a scenario the owner already ran
        used = {d["type"] for d in raw_decisions.get(builds_on, [])}
        if any(d["type"] in used for d in decisions):
            continue
        valid.append({"title": title, "why": why, "builds_on": builds_on, "decisions": decisions})
        if len(valid) == MAX_IDEAS:
            break
    if not valid:
        return []
    results = engine_bridge.simulate_ideas(db, run, valid)
    for idea, result in zip(valid, results):
        idea["builds_on_scenario_id"] = scenario_ids.get(idea["builds_on"])
        idea["decision_texts"] = engine_bridge.describe_flat_decisions(idea["decisions"], currency)
        idea["result"] = result
    return valid


# ---------- public API ----------

def status() -> dict:
    enabled = settings.coach_enabled()
    show = settings.coach_show_mode()
    return {"enabled": enabled, "mode": settings.coach_provider() if enabled and show else None}


def get_coach(db: Session, run: models.SimulationRun, regenerate: bool = False) -> dict:
    if not settings.coach_enabled():
        raise CoachDisabled()
    cached = db.query(models.CoachResult).filter_by(simulation_run_id=run.id).one_or_none()
    if cached is not None and not regenerate:
        return cached.payload

    facts, raw = engine_bridge.build_run_facts(db, run)
    name = settings.coach_provider()
    provider = make_provider(name)
    parsed: Optional[dict] = None
    mode, model = "template", None
    if provider is not None:
        system, user = prompts.coach_prompt(facts)
        parsed = _generate(db, run, "coach", provider, facts, system, user, prompts.COACH_SCHEMA,
                           _coach_texts, _idea_numbers, prompts.COACH_REPLY_SCHEMA)
        if parsed is not None:
            mode, model = provider.name, provider.model
    fallback = name != "template" and parsed is None
    if parsed is None:
        parsed = template.build_coach(facts, raw)
        _fallback_row(db, run.id, "coach", facts, parsed)

    ideas = _finalize_ideas(db, run, parsed.get("ideas"), raw)
    if len(ideas) < MIN_IDEAS:  # too few valid AI ideas: top up with the rule-based ones (also engine-tested)
        seen = {json.dumps([i["builds_on"], i["decisions"]], sort_keys=True) for i in ideas}
        for extra in _finalize_ideas(db, run, template.build_coach(facts, raw)["ideas"], raw):
            if len(ideas) >= MAX_IDEAS:
                break
            if json.dumps([extra["builds_on"], extra["decisions"]], sort_keys=True) not in seen:
                ideas.append(extra)

    payload = {
        "mode": mode, "model": model, "fallback": fallback,
        "headline": parsed["headline"], "what_happens": parsed["what_happens"], "why": parsed["why"],
        "watch_out": [str(x) for x in parsed["watch_out"]],
        "ideas": ideas,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    if cached is not None:
        cached.payload = payload
        db.commit()
    else:
        db.add(models.CoachResult(simulation_run_id=run.id, payload=payload))
        try:
            db.commit()
        except IntegrityError:  # two requests raced; keep the first
            db.rollback()
            return db.query(models.CoachResult).filter_by(simulation_run_id=run.id).one().payload
    return payload


def ask(db: Session, run: models.SimulationRun, question: str) -> dict:
    if not settings.coach_enabled():
        raise CoachDisabled()
    facts, _raw = engine_bridge.build_run_facts(db, run)
    name = settings.coach_provider()
    provider = make_provider(name)
    answer: Optional[str] = None
    mode = "template"
    if provider is not None:
        system, user = prompts.ask_prompt(facts, question)
        parsed = _generate(db, run, "ask", provider, facts, system, user, prompts.ASK_SCHEMA,
                           lambda p: [p["answer"]])
        if parsed is not None:
            answer, mode = str(parsed["answer"]).strip(), provider.name
    fallback = name != "template" and answer is None
    if answer is None:
        answer = template.answer(facts, question)
        _log(db, run.id, "ask", "template", None, 1, "QUESTION: " + question, response=answer,
             grounding_result={"passed": True, "unmatched": []})
    return {"answer": answer, "mode": mode, "fallback": fallback}
