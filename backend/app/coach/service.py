"""Coach flow for one simulation run.

    facts (engine)  ->  provider writes text  ->  grounding check  ->  retry once  ->  template fallback
                    ->  ideas validated + simulated by the engine  ->  cached per run

Every provider call is written to ai_interactions (thesis data), including the fallback.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

from jsonschema import ValidationError, validate as jsonschema_validate
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import engine_bridge, models, settings
from . import consistency, grounding, prompts, template
from .ideas import areas_of, choose_diverse, drop_repeated_opening, is_repeat, limit_sentences
from .summary import build_summary
from .providers import Provider, ProviderError, make_provider

MAX_IDEAS = 3
MIN_IDEAS = 2
MAX_HEADLINE_WORDS = 12
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
            # Numbers exist in the facts; now check the risk CLAIMS agree with them. A contradiction rejects the AI
            # text (no retry): the caller keeps the rule-based version, and the reason is logged.
            reason = consistency.check(texts_of(parsed), facts)
            if reason is None:
                return parsed
            row.error = "claim check: " + reason
            row.grounding = {"passed": True, "unmatched": [], "claims_ok": False, "claims_reason": reason}
            db.commit()
            return None
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
        candidate = {"title": title, "why": why, "builds_on": builds_on, "decisions": decisions}
        if is_repeat(valid, candidate):
            continue  # nearly the same as an idea we already have (e.g. two small price rises)
        valid.append(candidate)
    # At most one idea per area (price / menu or marketing / costs or hours), preferring areas the owner's
    # scenarios do not already use.
    used_types = {d["type"] for decs in raw_decisions.values() for d in decs}
    valid = choose_diverse(valid, used_types, MAX_IDEAS, MIN_IDEAS)
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


# AI coach jobs run on one background worker, one at a time: a local model can only do one thing at a
# time anyway, and the web request that starts a job returns immediately.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="coach")
_active: set[int] = set()          # run ids with an AI job queued or running (in this server process)
_lock = threading.Lock()


def _submit(fn: Callable, *args: Any) -> None:
    _executor.submit(fn, *args)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _assemble(db: Session, run: models.SimulationRun, facts: dict, raw: dict, parsed: dict, mode: str,
              model: Optional[str], fallback: bool, ai_status: str,
              ai_started_at: Optional[str] = None) -> dict:
    """The coach payload: the texts, plus ideas that the engine has validated and simulated."""
    ideas = _finalize_ideas(db, run, parsed.get("ideas"), raw)
    if len(ideas) < MIN_IDEAS:  # too few valid ideas: top up with the rule-based ones (also engine-tested)
        for extra in _finalize_ideas(db, run, template.build_coach(facts, raw)["ideas"], raw):
            if len(ideas) >= MAX_IDEAS:
                break
            if not is_repeat(ideas, extra) and not any(areas_of(extra) & areas_of(i) for i in ideas):
                ideas.append(extra)
    # The card is meant to be read in seconds: a short headline, at most two sentences per section, and a
    # warning line only when the engine's numbers show a real risk. The verdict, the tiles and the bars come
    # from fixed rules on the facts (summary), never from the AI.
    summary = build_summary(facts)
    headline = parsed["headline"].strip()
    if len(headline.split()) > MAX_HEADLINE_WORDS:
        headline = template._headline(facts)
    watch_out = [str(x).strip() for x in parsed["watch_out"] if str(x).strip()][:1]
    if not summary["has_risk"]:
        watch_out = []
    elif not watch_out:
        watch_out = template._watch_out(facts)
    return {
        "mode": mode, "model": model, "fallback": fallback,
        "headline": headline,
        "what_happens": limit_sentences(drop_repeated_opening(headline, parsed["what_happens"]), 2),
        "why": limit_sentences(parsed["why"], 2),
        "watch_out": watch_out,
        "summary": summary,
        "ideas": ideas,
        "generated_at": _now().isoformat(),
        "ai_status": ai_status,            # "none" | "pending" | "done" | "failed"
        "ai_started_at": ai_started_at,
    }


def _save(db: Session, run_id: int, payload: dict) -> None:
    row = db.query(models.CoachResult).filter_by(simulation_run_id=run_id).one_or_none()
    if row is not None:
        row.payload = payload
    else:
        db.add(models.CoachResult(simulation_run_id=run_id, payload=payload))
    try:
        db.commit()
    except IntegrityError:  # two requests raced; keep the first
        db.rollback()


def _public(payload: dict) -> dict:
    return dict(payload)


def _upgrade_old_payload(db: Session, run: models.SimulationRun, payload: dict) -> dict:
    """Old runs still get a card: the summary (verdict, tiles, bars) is rebuilt from the run's own numbers
    by the engine, and the saved texts are trimmed the way new ones are. Nothing is regenerated by the AI."""
    facts, _raw = engine_bridge.build_run_facts(db, run)
    summary = build_summary(facts)
    watch_out = [str(x).strip() for x in payload.get("watch_out", []) if str(x).strip()][:1]
    if not summary["has_risk"]:
        watch_out = []
    elif not watch_out:
        watch_out = template._watch_out(facts)
    upgraded = {**payload, "summary": summary, "watch_out": watch_out}
    _save(db, run.id, upgraded)
    return upgraded


def read_coach(db: Session, run: models.SimulationRun) -> Optional[dict]:
    """Current state of the coach for this run (used for polling). None if it was never started."""
    if not settings.coach_enabled_for(run.business):
        raise CoachDisabled()
    row = db.query(models.CoachResult).filter_by(simulation_run_id=run.id).one_or_none()
    if row is None:
        return None
    payload = row.payload
    if "tiles" not in payload.get("summary", {}):
        # Written before the card had its summary: keep the old text, add the summary from the run's data.
        payload = _upgrade_old_payload(db, run, payload)
    if payload.get("ai_status") == "pending" and run.id not in _active:
        # The server restarted while the AI was writing: keep the rule-based version.
        payload = {**payload, "ai_status": "failed", "fallback": True}
        _save(db, run.id, payload)
    return _public(payload)


def start_coach(db: Session, run: models.SimulationRun, regenerate: bool = False) -> dict:
    """Return the coach at once. With an AI provider this is the rule-based version, and a background
    job then replaces it with the AI version (poll read_coach). Never waits for the AI."""
    if not settings.coach_enabled_for(run.business):
        raise CoachDisabled()
    existing = read_coach(db, run)
    if existing is not None and (not regenerate or run.id in _active):
        return existing

    facts, raw = engine_bridge.build_run_facts(db, run)
    name = settings.coach_provider()
    provider = make_provider(name)
    rule_based = template.build_coach(facts, raw)
    if provider is None:  # template mode, or an AI provider that cannot work at all (no key)
        payload = _assemble(db, run, facts, raw, rule_based, "template", None, name != "template", "none")
        _fallback_row(db, run.id, "coach", facts, rule_based)
        _save(db, run.id, payload)
        return _public(payload)

    payload = _assemble(db, run, facts, raw, rule_based, "template", None, False, "pending", _now().isoformat())
    _save(db, run.id, payload)
    with _lock:
        _active.add(run.id)
    _submit(_ai_job, db.get_bind(), run.id)
    return _public(payload)


def _ai_job(bind: Any, run_id: int) -> None:
    """Background: ask the AI provider; on success replace the rule-based coach, otherwise keep it."""
    try:
        with Session(bind) as db:
            run = db.get(models.SimulationRun, run_id)
            facts, raw = engine_bridge.build_run_facts(db, run)
            provider = make_provider(settings.coach_provider())
            parsed = None
            if provider is not None:
                system, user = prompts.coach_prompt(facts)
                parsed = _generate(db, run, "coach", provider, facts, system, user, prompts.COACH_SCHEMA,
                                   _coach_texts, _idea_numbers, prompts.COACH_REPLY_SCHEMA)
            row = db.query(models.CoachResult).filter_by(simulation_run_id=run_id).one()
            if parsed is not None:
                _save(db, run_id, _assemble(db, run, facts, raw, parsed, provider.name, provider.model, False, "done"))
            else:
                _fallback_row(db, run_id, "coach", facts, template.build_coach(facts, raw))
                _save(db, run_id, {**row.payload, "ai_status": "failed", "fallback": True})
    except Exception:  # never leave a run stuck on "pending"
        logging.getLogger(__name__).exception("coach job failed for run %s", run_id)
        try:
            with Session(bind) as db:
                row = db.query(models.CoachResult).filter_by(simulation_run_id=run_id).one_or_none()
                if row is not None:
                    _save(db, run_id, {**row.payload, "ai_status": "failed", "fallback": True})
        except Exception:
            logging.getLogger(__name__).exception("could not mark coach job failed for run %s", run_id)
    finally:
        with _lock:
            _active.discard(run_id)


# ---------- "Ask the coach": instant answer first, AI improvement in the background ----------

# A separate worker from the coach card's, so a question never waits behind the coach's own AI job in our queue.
_ask_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ask")
_ask_active: set[int] = set()


def _submit_ask(fn: Callable, *args: Any) -> None:
    _ask_executor.submit(fn, *args)


def _ask_out(row: models.CoachAnswer) -> dict:
    return {"id": row.id, "question": row.question, "answer": row.answer, "mode": row.mode,
            "fallback": row.fallback, "ai_status": row.ai_status, "answered": row.answered,
            "suggestions": [] if row.answered else list(template.CHIP_QUESTIONS)}


def start_ask(db: Session, run: models.SimulationRun, question: str) -> dict:
    """Return at once with the rule-based answer (built only from the run's facts). With an AI provider, a
    background job then tries to replace it (poll read_ask). The three chip questions never need the AI."""
    if not settings.coach_enabled_for(run.business):
        raise CoachDisabled()
    facts, _raw = engine_bridge.build_run_facts(db, run)
    instant, understood = template.answer_with_match(facts, question)
    provider = make_provider(settings.coach_provider())
    wants_ai = provider is not None and not template.is_chip(question)
    row = models.CoachAnswer(simulation_run_id=run.id, question=question, answer=instant, mode="template",
                             answered=understood, fallback=False, ai_status="pending" if wants_ai else "none")
    db.add(row)
    db.commit()
    db.refresh(row)
    _log(db, run.id, "ask", "template", None, 1, "QUESTION: " + question, response=instant,
         grounding_result={"passed": True, "unmatched": []})
    if wants_ai:
        with _lock:
            _ask_active.add(row.id)
        _submit_ask(_ask_job, db.get_bind(), row.id)
    return _ask_out(row)


def _ask_job(bind: Any, ask_id: int) -> None:
    """Background: ask the AI (same grounding check as everything else); on any failure keep the instant answer."""
    try:
        with Session(bind) as db:
            row = db.get(models.CoachAnswer, ask_id)
            run = db.get(models.SimulationRun, row.simulation_run_id)
            facts, _raw = engine_bridge.build_run_facts(db, run)
            provider = make_provider(settings.coach_provider())
            parsed = None
            if provider is not None:
                system, user = prompts.ask_prompt(facts, row.question)
                parsed = _generate(db, run, "ask", provider, facts, system, user, prompts.ASK_SCHEMA,
                                   lambda p: [p["answer"]])
            if parsed is not None and str(parsed.get("answer", "")).strip():
                row.answer, row.mode, row.answered, row.ai_status = str(parsed["answer"]).strip(), provider.name, True, "done"
            else:
                row.ai_status, row.fallback = "failed", True
            db.commit()
    except Exception:  # never leave a question stuck on "pending"
        logging.getLogger(__name__).exception("ask job failed for %s", ask_id)
        try:
            with Session(bind) as db:
                row = db.get(models.CoachAnswer, ask_id)
                if row is not None and row.ai_status == "pending":
                    row.ai_status, row.fallback = "failed", True
                    db.commit()
        except Exception:
            logging.getLogger(__name__).exception("could not mark ask %s failed", ask_id)
    finally:
        with _lock:
            _ask_active.discard(ask_id)


def read_ask(db: Session, ask_id: int) -> Optional[dict]:
    """Current state of one question (for polling). A job lost to a server restart keeps the instant answer."""
    row = db.get(models.CoachAnswer, ask_id)
    if row is None:
        return None
    run = db.get(models.SimulationRun, row.simulation_run_id)
    if not settings.coach_enabled_for(run.business if run is not None else None):
        raise CoachDisabled()
    if row.ai_status == "pending" and ask_id not in _ask_active:
        row.ai_status, row.fallback = "failed", True
        db.commit()
    return _ask_out(row)
