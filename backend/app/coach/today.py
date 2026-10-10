"""The coach speaks first: a short opening note on the Today page.

    facts (engine, nothing changed) -> rule-based note at once -> AI note in the background
                                    -> same grounding check + claim check as the coach card -> else the rules stay

The note is 2-4 plain sentences. Every number comes from `facts["today"]`. The rule-based note is
the reliable one; an AI note only replaces it if every number exists in the facts and its risk claims agree.
Every AI call is logged in `ai_interactions` (kind "today").
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import engine_bridge, models, settings
from . import prompts
from .ideas import limit_sentences
from .providers import make_provider
from .service import CoachDisabled, _fallback_row, _generate, _lock, _now, _submit
from ..engine_bridge import format_money

MAX_SENTENCES = 4
_active: set[int] = set()          # run ids with an AI job queued or running (in this server process)


def _money(x: float, currency: str) -> str:
    return format_money(abs(x), currency)


def _keep(x: float, currency: str) -> str:
    return f"keep about {_money(x, currency)}" if x >= 0 else f"lose about {_money(x, currency)}"


def build_note(facts: dict) -> str:
    """Two to four friendly sentences from the facts alone (no AI)."""
    t = facts["today"]
    cur = facts["business"]["currency"]
    m = lambda x: _money(x, cur)           # noqa: E731

    practice = bool(facts["business"].get("practice"))
    if practice:
        # Made from the start-up guide: it does not exist yet. Calm wording, no praise, nothing about regulars.
        verb = "keep" if t["profit_a_month"] >= 0 else "lose"
        intro = "This is a practice business built from your rough plan, so nothing here has happened yet."
        first = (f"In a typical month it would take in about {m(t['sales_a_month'])} and spend about "
                 f"{m(t['costs_a_month'])}, so it would {verb} about {m(t['profit_a_month'])}.")
    elif t["profit_a_month"] >= 0:
        first = (f"In a typical month you take in about {m(t['sales_a_month'])} and spend about "
                 f"{m(t['costs_a_month'])}, so you keep about {m(t['profit_a_month'])}.")
    else:
        first = (f"In a typical month you take in about {m(t['sales_a_month'])} and spend about "
                 f"{m(t['costs_a_month'])}, so you lose about {m(t['profit_a_month'])}.")

    n = t["cash_runs_out_of_10"]
    covered = t["months_of_bills_covered"]
    if n >= 1:
        second = f"Your cash could run out in {n} of 10 futures, so keep an eye on it."
    elif t["lowest_cash_amount"] < 0:
        second = "Your cash could get very low at some point, so keep an eye on it."
    elif covered >= 1:
        months = "1 month" if covered == 1 else f"{covered} months"
        second = f"The {m(t['cash_now'])} you have in the bank would cover about {months} of bills."
    else:
        second = f"You have {m(t['cash_now'])} in the bank."

    third = (f"A bad month could mean you {_keep(t['profit_a_month_bad_case'], cur)}, and a good one you "
             f"{_keep(t['profit_a_month_good_case'], cur)}.")
    if practice:
        return " ".join([intro, first, second, third])
    fourth = "Pick “Try a change” to see what a decision would do before you commit to it."
    return " ".join([first, second, third, fourth])


# ---------- the stored note ----------

def _save(db: Session, run_id: int, payload: dict) -> None:
    row = db.query(models.TodayNote).filter_by(simulation_run_id=run_id).one_or_none()
    if row is not None:
        row.payload = payload
    else:
        db.add(models.TodayNote(simulation_run_id=run_id, payload=payload))
    try:
        db.commit()
    except IntegrityError:           # two requests raced; keep the first
        db.rollback()


def read_note(db: Session, run: models.SimulationRun) -> Optional[dict]:
    """The current note (for polling). None if it was never started. Raises CoachDisabled when the coach is off."""
    if not settings.coach_enabled_for(run.business):
        raise CoachDisabled()
    row = db.query(models.TodayNote).filter_by(simulation_run_id=run.id).one_or_none()
    if row is None:
        return None
    payload = row.payload
    if payload.get("ai_status") == "pending" and run.id not in _active:
        db.refresh(row)           # the job may have finished a moment after this row was read; never overwrite its note
        payload = row.payload
        if payload.get("ai_status") == "pending":
            payload = {**payload, "ai_status": "failed", "fallback": True}     # the server restarted mid-job
            _save(db, run.id, payload)
    return dict(payload)


def start_note(db: Session, run: models.SimulationRun, facts: dict) -> dict:
    """Return the note at once. With an AI provider it is the rule-based note, and a background job may then
    replace it (poll `read_note`). Never waits for the AI."""
    existing = read_note(db, run)
    if existing is not None:
        return existing

    name = settings.coach_provider()
    provider = make_provider(name)
    rule_based = build_note(facts)
    base = {"mode": "template", "model": None, "text": rule_based, "generated_at": _now().isoformat()}
    if provider is None:             # template mode, or an AI provider that cannot work at all (no key)
        payload = {**base, "fallback": name != "template", "ai_status": "none", "ai_started_at": None}
        _fallback_row(db, run.id, "today", facts, {"note": rule_based})
        _save(db, run.id, payload)
        return payload

    payload = {**base, "fallback": False, "ai_status": "pending", "ai_started_at": _now().isoformat()}
    _save(db, run.id, payload)
    with _lock:
        _active.add(run.id)
    _submit(_ai_job, db.get_bind(), run.id)
    return payload


def _clean(note: str) -> str:
    return limit_sentences(" ".join(str(note).split()), MAX_SENTENCES)


def _ai_job(bind: Any, run_id: int) -> None:
    """Background: ask the AI provider; on success replace the rule-based note, otherwise keep it."""
    try:
        with Session(bind) as db:
            run = db.get(models.SimulationRun, run_id)
            facts = engine_bridge.build_today_run_facts(db, run)
            provider = make_provider(settings.coach_provider())
            parsed = None
            if provider is not None:
                system, user = prompts.today_prompt(facts)
                parsed = _generate(db, run, "today", provider, facts, system, user, prompts.TODAY_SCHEMA,
                                   lambda p: [p["note"]])
            row = db.query(models.TodayNote).filter_by(simulation_run_id=run_id).one()
            if parsed is not None and _clean(parsed["note"]):
                _save(db, run_id, {**row.payload, "mode": provider.name, "model": provider.model,
                                   "text": _clean(parsed["note"]), "fallback": False, "ai_status": "done",
                                   "generated_at": _now().isoformat()})
            else:
                _fallback_row(db, run_id, "today", facts, {"note": build_note(facts)})
                _save(db, run_id, {**row.payload, "ai_status": "failed", "fallback": True})
    except Exception:                # never leave a note stuck on "pending"
        logging.getLogger(__name__).exception("today note job failed for run %s", run_id)
        try:
            with Session(bind) as db:
                row = db.query(models.TodayNote).filter_by(simulation_run_id=run_id).one_or_none()
                if row is not None:
                    _save(db, run_id, {**row.payload, "ai_status": "failed", "fallback": True})
        except Exception:
            logging.getLogger(__name__).exception("could not mark today note %s failed", run_id)
    finally:
        with _lock:
            _active.discard(run_id)
