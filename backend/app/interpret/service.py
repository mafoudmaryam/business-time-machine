"""Plain-language decision input.

    owner's words -> (AI copies the words into drafts | rules parse them) -> resolve (months, units, questions,
    sentences, engine validation) -> shown to the owner UNCONFIRMED.

With an AI provider the request returns at once as "pending" and a background job fills it in (poll GET);
if the AI fails or times out, the rule-based parser answers instead. Every call is logged in ai_interactions.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

from jsonschema import ValidationError, validate as jsonschema_validate
from sqlalchemy.orm import Session

from .. import engine_bridge, models, settings
from ..coach.providers import Provider, ProviderError, make_provider
from ..coach.service import _repair, parse_json
from . import ai, template
from .draft import Context
from .resolve import ENGINE_KEYS, resolve

MAX_ATTEMPTS = 2
MAX_TOKENS = 900
MAX_TEXT = ai.MAX_TEXT

LogFn = Callable[..., None]


class BadRequest(Exception):
    """The text is empty or too long."""


# ---------- context ----------

def _today() -> dt.date:
    return dt.date.today()


def context_for(business: models.Business, today: Optional[dt.date] = None) -> Context:
    tpl = engine_bridge.get_template(business.industry)
    base = business.baseline
    return Context(
        industry=business.industry, industry_name=tpl.display_name.lower(), staff_noun=tpl.staff_noun,
        customer_noun=tpl.customer_noun, currency=business.currency,
        marketing=base.marketing if base else 400.0, open_days=base.open_days if base else 28.0,
        today=today or _today(),
    )


def clean_text(text: str) -> str:
    text = (text or "").strip()
    if not text:
        raise BadRequest("Please describe what you would like to change.")
    if len(text) > MAX_TEXT:
        raise BadRequest(f"That is a bit long. Please keep it under {MAX_TEXT} characters.")
    return text


# ---------- the two ways to read the text ----------

def run_rules(text: str, answers: list[dict], ctx: Context) -> dict[str, Any]:
    parsed = template.parse(text, ctx)
    for a in answers:
        try:
            index, slot = str(a.get("id", "")).split(":", 1)
            draft = parsed.drafts[int(index)]
        except (ValueError, IndexError):
            continue
        template.apply_answer(draft, slot, str(a.get("answer", "")), ctx)
    return resolve(parsed, ctx, text)


def run_ai(text: str, answers: list[dict], ctx: Context, provider: Provider, log: Optional[LogFn] = None
           ) -> Optional[dict[str, Any]]:
    """Ask the provider; accept only a reply that fits the schema. None means "use the rules instead"."""
    system, user = ai.build_prompts(text, answers, ctx)
    note = ""
    for attempt in range(1, MAX_ATTEMPTS + 1):
        prompt_text = system + "\n\n" + user + note
        try:
            reply = provider.complete(system, user + note, ai.INTERPRET_SCHEMA, max_tokens=MAX_TOKENS)
        except ProviderError as exc:
            if log:
                log(provider=provider.name, model=provider.model, attempt=attempt, prompt=prompt_text,
                    error=str(exc), validation={"passed": False, "errors": [str(exc)]})
            return None                      # the AI is down or too slow: do not retry
        try:
            parsed = _repair(parse_json(reply.text))
            jsonschema_validate(parsed, ai.INTERPRET_SCHEMA)
        except (ValueError, ValidationError) as exc:
            if log:
                log(provider=provider.name, model=reply.model, attempt=attempt, prompt=prompt_text,
                    response=reply.text, tokens=(reply.prompt_tokens, reply.completion_tokens),
                    duration_ms=reply.duration_ms, error=f"invalid reply: {exc}",
                    validation={"passed": False, "errors": [f"invalid reply: {exc}"]})
            note = "\n\nYour previous reply was not valid JSON in the requested format. Reply with the JSON object only."
            continue
        drafts = ai.drafts_from_ai(parsed, ctx, text, answers)
        result = resolve(drafts, ctx, text)
        asked = len(parsed.get("decisions", []))
        kept = len(result["decisions"]) + len(result["questions"])
        if log:
            log(provider=provider.name, model=reply.model, attempt=attempt, prompt=prompt_text,
                response=reply.text, tokens=(reply.prompt_tokens, reply.completion_tokens),
                duration_ms=reply.duration_ms,
                validation={"passed": True, "ai_decisions": asked, "kept_decisions": len(result["decisions"]),
                            "questions": len(result["questions"]), "dropped": max(0, asked - kept)})
        result["_model"] = reply.model
        return result
    return None


def interpret_now(text: str, answers: list[dict], ctx: Context, provider: Optional[Provider],
                  log: Optional[LogFn] = None) -> dict[str, Any]:
    """The whole thing, synchronously (used by the background job, the tests and the eval script)."""
    text = clean_text(text)
    if provider is not None:
        result = run_ai(text, answers, ctx, provider, log)
        if result is not None:
            result.update(provider=provider.name, model=result.pop("_model", provider.model), fallback=False)
            return result
    result = run_rules(text, answers, ctx)
    result.update(provider="template", model=None, fallback=provider is not None)
    return result


# ---------- storing, logging, polling ----------

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="interpret")
_active: set[int] = set()
_lock = threading.Lock()


def _submit(fn: Callable, *args: Any) -> None:
    _executor.submit(fn, *args)


def _logger(db: Session, business_id: int, interpretation_id: int, text: str) -> LogFn:
    def log(provider: str, attempt: int, prompt: str, model: Optional[str] = None, response: Optional[str] = None,
            tokens: tuple = (None, None), duration_ms: Optional[int] = None, error: Optional[str] = None,
            validation: Optional[dict] = None) -> None:
        db.add(models.AiInteraction(
            kind="interpret", business_id=business_id, interpretation_id=interpretation_id, input_text=text,
            provider=provider, model=model, attempt=attempt, prompt=prompt, response=response,
            prompt_tokens=tokens[0], completion_tokens=tokens[1], duration_ms=duration_ms, error=error,
            grounding=validation))
        db.commit()
    return log


def _finish(db: Session, row: models.Interpretation, result: dict[str, Any], started: float) -> None:
    import time
    row.provider, row.model, row.fallback = result.pop("provider"), result.pop("model"), result.pop("fallback")
    row.result, row.status = result, "done"
    if row.provider == "template":            # the rules answered: log that too, so every result has a row
        db.add(models.AiInteraction(
            kind="interpret", business_id=row.business_id, interpretation_id=row.id, input_text=row.text,
            provider="template", attempt=1, prompt=row.text, response=json.dumps(result, ensure_ascii=False),
            duration_ms=int((time.monotonic() - started) * 1000), grounding={"passed": True, "fallback": row.fallback}))
    db.commit()


def public(row: models.Interpretation) -> dict[str, Any]:
    base = {"id": row.id, "business_id": row.business_id, "text": row.text, "status": row.status,
            "provider": row.provider, "fallback": row.fallback}
    result = row.result or {}
    return {**base, "decisions": result.get("decisions", []), "questions": result.get("questions", []),
            "out_of_scope": result.get("out_of_scope"), "notes": result.get("notes", []),
            "month_one": result.get("month_one", "")}


def start(db: Session, business: models.Business, text: str, answers: list[dict],
          today: Optional[dt.date] = None) -> dict[str, Any]:
    import time
    text = clean_text(text)
    ctx = context_for(business, today)
    provider = make_provider(settings.coach_provider())
    row = models.Interpretation(business_id=business.id, text=text, answers=answers, status="pending",
                                provider=settings.coach_provider() if provider else "template")
    db.add(row)
    db.commit()
    db.refresh(row)
    if provider is None:                     # rule-based: instant
        started = time.monotonic()
        result = interpret_now(text, answers, ctx, None)
        _finish(db, row, result, started)
        return public(row)
    with _lock:
        _active.add(row.id)
    _submit(_job, db.get_bind(), row.id, today)
    return public(row)


def _job(bind: Any, interpretation_id: int, today: Optional[dt.date]) -> None:
    import time
    try:
        with Session(bind) as db:
            row = db.get(models.Interpretation, interpretation_id)
            ctx = context_for(db.get(models.Business, row.business_id), today)
            provider = make_provider(settings.coach_provider())
            started = time.monotonic()
            result = interpret_now(row.text, row.answers or [], ctx, provider,
                                   _logger(db, row.business_id, row.id, row.text))
            _finish(db, row, result, started)
    except Exception:  # never leave a request stuck on "pending"
        logging.getLogger(__name__).exception("interpret job failed for %s", interpretation_id)
        try:
            with Session(bind) as db:
                row = db.get(models.Interpretation, interpretation_id)
                ctx = context_for(db.get(models.Business, row.business_id), today)
                _finish(db, row, {**run_rules(row.text, row.answers or [], ctx), "provider": "template",
                                  "model": None, "fallback": True}, 0.0)
        except Exception:
            logging.getLogger(__name__).exception("could not fall back for %s", interpretation_id)
    finally:
        with _lock:
            _active.discard(interpretation_id)


def read(db: Session, row: models.Interpretation, today: Optional[dt.date] = None) -> dict[str, Any]:
    """Current state (for polling). A job lost to a server restart is answered by the rules right here."""
    if row.status == "pending" and row.id not in _active:
        import time
        ctx = context_for(db.get(models.Business, row.business_id), today)
        result = run_rules(row.text, row.answers or [], ctx)
        _finish(db, row, {**result, "provider": "template", "model": None, "fallback": True}, time.monotonic())
    return public(row)


# ---------- what the owner finally did with it (thesis metric) ----------

def _key(d: dict) -> tuple:
    extras = tuple((k, round(float(d[k]), 4)) for k in ENGINE_KEYS if d.get(k) not in (None, 0, 0.0))
    return (d["type"], int(d["start_month"]), round(float(d["value"]), 4), d.get("unit", ""), extras)


def log_outcome(db: Session, row: models.Interpretation, final: list[dict], scenario_id: Optional[int]) -> dict:
    """Compare the AI's decisions with the ones the owner ended up with: unchanged, edited, removed, or
    added by hand. Stored as an ai_interactions row of kind "interpret_outcome"."""
    shown = list((row.result or {}).get("decisions", []))
    left = list(final)
    unchanged, edited, removed, detail = 0, 0, 0, []
    unmatched: list[dict] = []
    for d in shown:
        match = next((f for f in left if _key(f) == _key(d)), None)
        if match is not None:
            left.remove(match)
            unchanged += 1
            detail.append({"type": d["type"], "outcome": "unchanged"})
        else:
            unmatched.append(d)
    for d in unmatched:
        match = next((f for f in left if f["type"] == d["type"]), None)
        if match is not None:
            left.remove(match)
            edited += 1
            detail.append({"type": d["type"], "outcome": "edited", "was": _key(d)[1:4], "now": _key(match)[1:4]})
        else:
            removed += 1
            detail.append({"type": d["type"], "outcome": "removed"})
    added = len(left)
    summary = {"ai_decisions": len(shown), "unchanged": unchanged, "edited": edited, "removed": removed,
               "added_by_hand": added, "final_decisions": len(final),
               "confirmed": sum(1 for f in final if f.get("confirmed")), "scenario_id": scenario_id}
    db.add(models.AiInteraction(
        kind="interpret_outcome", business_id=row.business_id, interpretation_id=row.id, input_text=row.text,
        provider=row.provider, model=row.model, attempt=1, prompt="",
        response=json.dumps({"summary": summary, "detail": detail, "final": final}, ensure_ascii=False),
        grounding={"passed": True}))
    db.commit()
    return summary
