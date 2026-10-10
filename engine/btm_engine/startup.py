"""The start-up guide: a rough plan for someone who does not have a business yet.

Plain arithmetic only: no randomness, no AI. Every number comes from `data/startup_ranges.json`, where each fact has a
named source, a web address and the date it was read, and each of our own choices is an "assumption" row that says why.
A fact whose source has not been read by a person (`status` is not "verified") is ignored here, so a number nobody has
checked can never reach a screen.

What it works out (all as low / middle / high; the middle is just the middle of the range, never a prediction):
    start-up cost   = the sum of the cost lines that apply to the person's answers (fit-out only if they will fit out, ...)
    running costs   = ingredients + people + rent and other fixed bills + marketing, a month
    break-even      = fixed costs / (average spend x (1 - ingredient share))   (the Small Business Administration's formula)
    suggested budget = start-up cost + contingency + a cash buffer of some months of running costs

Countries have three modes (see the data file): "full" (United States), "own_numbers" (United Kingdom, China: sourced pay
and rules, but the person types rent and ingredient share), and "checklist_only" (anywhere else: no numbers at all).
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
from dataclasses import replace
from functools import lru_cache
from importlib import resources
from typing import Any, Optional

from .explain import month_one_summary, round_display
from .quickstart import QuickStart, quick_baseline
from .templates import get_template

DATA_FILE = "startup_ranges.json"

BUSINESS_TYPES = ("cafe", "restaurant", "bakery")
PREMISES = ("ready", "fit_out", "own", "mobile")
SIZES = ("tiny", "small", "medium", "large")
MENUS = ("simple", "full")
ALCOHOL = ("yes", "no", "unsure")
TIMELINES = ("3m", "6m", "12m", "exploring")

UNITS = {"one_off", "per_month", "per_hour", "per_year", "percent_of_sales", "percent", "days", "months",
         "hours_per_month", "fraction", "text"}
GROUPS = {"startup_cost", "startup_total", "cross_check", "rent_guide", "wage", "cost_share", "cost_share_check",
          "rule", "statistic", "assumption"}
SOURCE_TYPES = {"government", "statistics_office", "trade_association", "vendor_guide"}
SOURCE_STATUS = {"verified", "needs_hand_check"}
MONEY_UNITS = {"one_off", "per_month", "per_hour", "per_year"}

_PLACEHOLDER = re.compile(r"\{\{([a-z0-9-]+)\}\}")
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class AnswerError(ValueError):
    """The answers make no sense. The message is plain words for the person."""


# ---------- the data file ----------

def _read_data() -> dict:
    path = resources.files("btm_engine").joinpath("data", DATA_FILE)
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_data() -> dict:
    """The reviewed data file. Raises ValueError listing every problem if it is not sound."""
    data = _read_data()
    problems = validate_data(data)
    if problems:
        raise ValueError("startup_ranges.json is not sound:\n- " + "\n- ".join(problems))
    return data


def data_version() -> str:
    return load_data()["version"]


def _is_date(value: Any) -> bool:
    if not isinstance(value, str) or not _ISO_DATE.match(value):
        return False
    try:
        dt.date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_data(data: dict, today: Optional[dt.date] = None) -> list[str]:
    """Every way the data file can be unsound, as plain sentences (an empty list means it is sound).

    The rules: every fact row with a number has a source with a name, an https address, a type, a status and the date it was
    read; every assumption row has a reason and no source; low <= high; units and currencies are known; checklist and
    struggle texts contain no digits (numbers only enter through {{row-id}} placeholders that point at real rows)."""
    today = today or dt.date.today()
    problems: list[str] = []
    sources = data.get("sources", {})
    rows = data.get("rows", [])

    for sid, s in sources.items():
        if not s.get("name"):
            problems.append(f"source {sid}: no name")
        if not str(s.get("url", "")).startswith("https://"):
            problems.append(f"source {sid}: the address must start with https://")
        if s.get("type") not in SOURCE_TYPES:
            problems.append(f"source {sid}: unknown type {s.get('type')!r}")
        if s.get("status") not in SOURCE_STATUS:
            problems.append(f"source {sid}: unknown status {s.get('status')!r}")
        if not _is_date(s.get("accessed")):
            problems.append(f"source {sid}: 'accessed' must be a date like 2026-10-10")
        elif dt.date.fromisoformat(s["accessed"]) > today:
            problems.append(f"source {sid}: 'accessed' is in the future")
        if s.get("published") is not None and not _is_date(s.get("published")):
            problems.append(f"source {sid}: 'published' must be a date or null")
        if s.get("type") == "vendor_guide" and not s.get("sells_to_restaurants"):
            problems.append(f"source {sid}: a vendor guide must say it sells to restaurants (sells_to_restaurants)")

    ids: set[str] = set()
    for r in rows:
        rid = r.get("id")
        if not rid or rid in ids:
            problems.append(f"row {rid!r}: missing or duplicate id")
        ids.add(rid)
        if r.get("group") not in GROUPS:
            problems.append(f"row {rid}: unknown group {r.get('group')!r}")
        if r.get("kind") not in ("fact", "assumption"):
            problems.append(f"row {rid}: kind must be fact or assumption")
        if r.get("unit") not in UNITS:
            problems.append(f"row {rid}: unknown unit {r.get('unit')!r}")
        if not r.get("label"):
            problems.append(f"row {rid}: no label")
        if not r.get("business_types") or not set(r["business_types"]) <= set(BUSINESS_TYPES):
            problems.append(f"row {rid}: business_types must be a non-empty list of cafe, restaurant, bakery")
        country = r.get("country")
        if country is not None and country not in data.get("countries", {}):
            problems.append(f"row {rid}: unknown country {country!r}")
        low, high = r.get("low"), r.get("high")
        has_numbers = low is not None or high is not None
        if has_numbers:
            if not (_is_number(low) and _is_number(high)):
                problems.append(f"row {rid}: low and high must both be numbers")
            elif low > high:
                problems.append(f"row {rid}: low is above high")
            elif low < 0:
                problems.append(f"row {rid}: negative number")
            if r.get("unit") in MONEY_UNITS and not re.fullmatch(r"[A-Z]{3}", str(r.get("currency") or "")):
                problems.append(f"row {rid}: a money row needs a three-letter currency")
            if r.get("median") is not None and not _is_number(r["median"]):
                problems.append(f"row {rid}: median must be a number")
        if r.get("kind") == "fact":
            if has_numbers or r.get("source_id"):
                sid = r.get("source_id")
                if sid not in sources:
                    problems.append(f"row {rid}: a fact with numbers needs a source from 'sources' (got {sid!r})")
            if has_numbers and not r.get("basis"):
                problems.append(f"row {rid}: say what the numbers are (basis: range, median, single_value, ...)")
        else:
            if not str(r.get("rationale", "")).strip():
                problems.append(f"row {rid}: an assumption needs a rationale")
            if r.get("source_id") or r.get("source_url"):
                problems.append(f"row {rid}: an assumption must not claim a source")

    # Texts: no digits except through placeholders that point at rows.
    def check_text(where: str, text: str) -> None:
        for ph in _PLACEHOLDER.findall(text):
            if ph not in ids:
                problems.append(f"{where}: placeholder {{{{{ph}}}}} is not a row")
        if re.search(r"\d", _PLACEHOLDER.sub("", text)):
            problems.append(f"{where}: contains a digit; numbers must come from a row through a placeholder")

    for item in data.get("checklist", []):
        iid = item.get("id")
        check_text(f"checklist {iid} title", item.get("title", ""))
        for t in item.get("do", []) + item.get("where_kinds", []) + list(item.get("cant", {}).values()):
            check_text(f"checklist {iid}", t)
        for rid in item.get("cost_rows", []):
            if rid not in ids:
                problems.append(f"checklist {iid}: cost row {rid!r} does not exist")
        for country, sids in item.get("where_sources", {}).items():
            for sid in sids:
                if sid not in sources:
                    problems.append(f"checklist {iid}: source {sid!r} does not exist")
    for s in data.get("struggles", []):
        for key in ("title", "what", "watch", "watch_generic"):
            check_text(f"struggle {s.get('id')} {key}", s.get(key, ""))
        for rid in s.get("rows", []):
            if rid not in ids:
                problems.append(f"struggle {s.get('id')}: row {rid!r} does not exist")
    for g in data.get("gaps", []):
        check_text(f"gap {g.get('id')}", g.get("text", ""))
    return problems


# ---------- answers ----------

def _num(raw: dict, key: str, label: str, *, minimum: float = 0, maximum: float, strict: bool = False, required: bool = False) -> Optional[float]:
    value = raw.get(key)
    if value is None or value == "":
        if required:
            raise AnswerError(f"Please tell us {label}.")
        return None
    if isinstance(value, bool) or not _is_number(value):
        raise AnswerError(f"{label[0].upper() + label[1:]} must be a number.")
    value = float(value)
    if (value <= minimum) if strict else (value < minimum):
        raise AnswerError(f"{label[0].upper() + label[1:]} is too small.")
    if value > maximum:
        raise AnswerError(f"{label[0].upper() + label[1:]} is too large.")
    return value


def _choice(raw: dict, key: str, options: tuple, label: str) -> str:
    value = raw.get(key)
    if value not in options:
        raise AnswerError(f"Please choose {label}.")
    return value


def parse_answers(raw: dict, data: Optional[dict] = None) -> dict:
    """Check the nine screens' answers and fill in the obvious. Raises AnswerError (plain words)."""
    data = data or load_data()
    if not isinstance(raw, dict):
        raise AnswerError("Please answer the questions.")
    country = raw.get("country")
    if country not in data["countries"]:
        raise AnswerError("Please choose a country.")
    currency = str(raw.get("currency") or data["countries"][country]["currency"]).upper()
    if not re.fullmatch(r"[A-Z]{3}", currency):
        raise AnswerError("The currency must be a three-letter code such as USD.")
    premises = _choice(raw, "premises", PREMISES, "whether you will rent, own or start smaller")
    size = _choice(raw, "size", SIZES, "how big it will be")
    notes: list[str] = []
    if premises == "mobile" and size != "tiny":
        size = "tiny"
        notes.append("You chose to start with a stall, cart, kiosk or home kitchen, so we used the smallest size.")
    answers = {
        "business_type": _choice(raw, "business_type", BUSINESS_TYPES, "what you would like to open"),
        "country": country,
        "currency": currency,
        "budget": _num(raw, "budget", "your budget", maximum=1e10),
        "premises": premises,
        "rent": _num(raw, "rent", "the monthly rent", maximum=1e8),
        "size": size,
        "menu": _choice(raw, "menu", MENUS, "a simple or a full menu"),
        "alcohol": _choice(raw, "alcohol", ALCOHOL, "whether you will sell alcohol"),
        "people": _num(raw, "people", "how many people will work there", minimum=0, maximum=500, strict=True, required=True),
        "customers_per_day": _num(raw, "customers_per_day", "the customers you hope for on a normal day", maximum=20_000, strict=True),
        "avg_spend": _num(raw, "avg_spend", "what one customer spends", maximum=100_000, strict=True),
        "ingredient_share": _num(raw, "ingredient_share", "the ingredient share of sales", maximum=99.9),
        "timeline": _choice(raw, "timeline", TIMELINES, "when you hope to open"),
    }
    answers["format"] = "tiny" if (size == "tiny" or premises == "mobile") else "shop"
    answers["notes"] = notes
    return answers


# ---------- helpers on the data ----------

KIND_TEXT = {
    "vendor_guide": "from a company that sells to shops, restaurants and new businesses",
    "government": "from a government source",
    "statistics_office": "from a national statistics office",
    "trade_association": "from a restaurant trade association's survey",
}


@lru_cache(maxsize=1)
def _link_status() -> dict:
    """What scripts/check_links.py last found for each address (optional: the file may not exist yet)."""
    path = resources.files("btm_engine").joinpath("data", "link_status.json")
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("results", {})
    except (FileNotFoundError, ValueError):
        return {}


def _source_out(data: dict, sid: str) -> dict:
    s = data["sources"][sid]
    out = {"id": sid, **{k: s.get(k) for k in ("name", "type", "url", "published", "accessed", "status", "note", "sells_to_restaurants", "data_period", "effective_from")}}
    out["kind_text"] = KIND_TEXT[s["type"]]
    checked = _link_status().get(s["url"])
    out["last_checked"] = checked["checked"] if checked else None
    out["link_result"] = checked["result"] if checked else None
    return out


def _row_ok(data: dict, row: dict) -> bool:
    """Facts count only when their source has been read by a person; assumptions always count."""
    if row["kind"] == "assumption":
        return True
    sid = row.get("source_id")
    return sid in data["sources"] and data["sources"][sid]["status"] == "verified"


def _applies(row: dict, ctx: dict) -> bool:
    return all(ctx.get(key) in allowed for key, allowed in row.get("applies_when", {}).items())


def _usable(data: dict, a: dict, *groups: str, use_context: bool = True) -> list[dict]:
    out = []
    for row in data["rows"]:
        if row["group"] not in groups or not _row_ok(data, row):
            continue
        if row.get("country") not in (None, a["country"]) or a["business_type"] not in row["business_types"]:
            continue
        if use_context and not _applies(row, a):
            continue
        out.append(row)
    return out


def _row_by_id(data: dict, rid: str) -> dict:
    return next(r for r in data["rows"] if r["id"] == rid)


def _value(data: dict, rid: str) -> tuple[float, float]:
    r = _row_by_id(data, rid)
    return float(r["low"]), float(r["high"])


def _line(data: dict, row: dict) -> dict:
    out = {"id": row["id"], "label": row["label"], "low": row["low"], "high": row["high"], "unit": row["unit"],
           "currency": row.get("currency"), "basis": row.get("basis"), "note": row.get("note"), "median": row.get("median")}
    out["source"] = _source_out(data, row["source_id"]) if row.get("source_id") else None
    return out


def _num_text(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def _fill(data: dict, a: dict, text: str) -> Optional[str]:
    """Put row values into {{row-id}} placeholders. None if a row is not usable for this country (so the caller can fall back)."""
    def one(m: re.Match) -> str:
        row = _row_by_id(data, m.group(1))
        if row.get("country") not in (None, a["country"]) or not _row_ok(data, row):
            raise KeyError(m.group(1))
        low, high = row["low"], row["high"]
        return _num_text(low) if low == high else f"{_num_text(low)} to {_num_text(high)}"
    try:
        return _PLACEHOLDER.sub(one, text)
    except KeyError:
        return None


def _mid(low: float, high: float) -> float:
    return (low + high) / 2


def _r(x: float) -> float:
    return round(x, 2)


def _marketing_share(business_type: str) -> float:
    """The industry template's marketing as a share of its own sales (the same rule the four-question start uses)."""
    t0 = get_template(business_type).default_baseline
    regular_visits = t0.customers * t0.visits_per_regular
    sales = (regular_visits + t0.walk_in_visits) * t0.avg_ticket
    return t0.marketing / sales


# ---------- the plan ----------

def build_plan(raw_answers: dict, data: Optional[dict] = None) -> dict:
    """Everything the plan page shows, from the answers and the data file. Pure and repeatable."""
    data = data or load_data()
    a = parse_answers(raw_answers, data)
    country = data["countries"][a["country"]]
    mode = country["mode"]
    plan: dict[str, Any] = {
        "data_version": data["version"], "answers": {k: v for k, v in a.items() if k != "notes"},
        "country": {"id": a["country"], "name": country["name"], "mode": mode}, "currency": a["currency"],
        "business_type": a["business_type"], "format": a["format"], "mode": mode, "warnings": list(a["notes"]),
    }
    used_sources: dict[str, dict] = {}

    def note_source(sid: Optional[str]) -> None:
        if sid:
            used_sources[sid] = _source_out(data, sid)

    assumptions: list[dict] = []

    def use_assumption(rid: str) -> tuple[float, float]:
        row = _row_by_id(data, rid)
        if row["kind"] != "assumption":
            raise ValueError(f"{rid} is not an assumption")
        entry = {"id": rid, "label": row["label"], "low": row["low"], "high": row["high"], "unit": row["unit"], "rationale": row["rationale"]}
        if all(e["id"] != rid for e in assumptions):
            assumptions.append(entry)
        return (row["low"], row["high"])

    startup = _startup(data, a, mode, note_source)
    plan["startup"] = startup

    if mode == "checklist_only":
        plan["running"] = {"available": False, "reason": "We have no sourced figures for your country, so we show the checklist only."}
        plan["break_even"] = {"available": False, "reason": plan["running"]["reason"]}
        plan["buffer"] = {"available": False}
        plan["budget"] = {"available": False, "verdict": "unknown",
                          "text": "We can't compare your budget with a plan for your country: we have no sourced figures."}
    else:
        running = _running(data, a, use_assumption, note_source)
        plan["running"] = running
        plan["break_even"] = _break_even(data, a, running, use_assumption, note_source)
        plan["buffer"], plan["budget"] = _buffer_and_budget(data, a, startup, running, use_assumption)
        if a["country"] == "US" and running.get("available"):
            use_assumption("segment-mapping")

    plan["checklist"] = _checklist(data, a, note_source)
    plan["struggles"] = _struggles(data, a, note_source)
    plan["gaps"] = _gaps(data, a, startup, plan["running"])
    plan["assumptions"] = assumptions
    plan["sources"] = list(used_sources.values())
    plan["facts_used"] = _facts_used(plan)
    plan["selling_note"] = ("Some of the published guides behind these numbers are written by companies that sell to "
                            "restaurants and new businesses. We say so next to each one.")
    return plan


def _facts_used(plan: dict) -> list[dict]:
    """Every sourced fact the plan shows, once each, so the page can list them with their sources and dates."""
    found: dict[str, dict] = {}

    def walk(node) -> None:
        if isinstance(node, dict):
            if {"id", "label", "low", "high", "unit"} <= node.keys() and node.get("source"):
                found.setdefault(node["id"], {k: node.get(k) for k in ("id", "label", "low", "high", "median", "unit", "currency", "basis", "note", "source")})
            for key, value in node.items():
                if key != "source":
                    walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)
    for key in ("startup", "running", "break_even", "checklist", "struggles"):
        walk(plan.get(key))
    return list(found.values())


def _startup(data: dict, a: dict, mode: str, note_source) -> dict:
    out: dict[str, Any] = {"available": False, "lines": [], "notes": []}
    if mode == "checklist_only":
        out["reason"] = "We have no sourced figures for your country."
        return out
    rows = _usable(data, a, "startup_cost", "startup_total")
    if not rows:
        out["reason"] = ("We couldn't find a reliable published figure for start-up costs in your case. "
                         "Ask two or three local suppliers and agents for quotes; the checklist shows what to ask for.")
        return out
    lines = [_line(data, r) for r in rows]
    for line in lines:
        note_source(line["source"]["id"] if line["source"] else None)
    low = sum(l["low"] for l in lines)
    high = sum(l["high"] for l in lines)
    out.update(available=True, lines=lines, low=_r(low), high=_r(high), middle=_r(_mid(low, high)),
               sources_count=len({l["source"]["id"] for l in lines}))
    out["one_guide_only"] = out["sources_count"] == 1
    out["label"] = "Published guides say"
    out["why_wide"] = "This range is wide because published guides disagree, and costs depend a lot on your city and choices."
    if out["one_guide_only"]:
        out["why_wide"] += " These figures come from one published guide."
    cross = _usable(data, a, "cross_check")
    if cross:
        out["cross_check"] = _line(data, cross[0])
        note_source(out["cross_check"]["source"]["id"])
    if a["premises"] == "ready":
        out["notes"].append("Building work is left out because you chose a ready-to-use place. Some work may still be needed.")
    elif a["premises"] == "own":
        out["notes"].append("Building work and a rent deposit are left out because you own the place. Some work may still be needed.")
    if a["format"] == "tiny":
        out["notes"].append("For a stall, cart, kiosk or home kitchen the guides give one total, not separate lines.")
    if a["alcohol"] in ("yes", "unsure"):
        out["notes"].append("Alcohol licences are not included: what they cost depends on your state or council.")
    return out


def _wage_per_person(data: dict, a: dict, use_assumption, note_source) -> Optional[dict]:
    rows = _usable(data, a, "wage")
    if not rows:
        return None
    row = rows[0]
    note_source(row["source_id"])
    if row["unit"] == "per_hour":
        hours, _ = use_assumption("hours-per-month")
        low, high = row["low"] * hours, row["high"] * hours
    else:  # per year
        low, high = row["low"] / 12, row["high"] / 12
    return {"row": _line(data, row), "low": low, "high": high}


def _running(data: dict, a: dict, use_assumption, note_source) -> dict:
    out: dict[str, Any] = {"available": False, "lines": [], "needs": [], "notes": []}
    days, _ = use_assumption("days-open")
    other_share, _ = use_assumption("other-fixed-share")
    sales = a["customers_per_day"] * days * a["avg_spend"] if a["customers_per_day"] and a["avg_spend"] else None
    out["sales"] = _r(sales) if sales is not None else None

    wage = _wage_per_person(data, a, use_assumption, note_source)
    if wage is None:
        out["needs"].append("pay")
    # rent: the person's own figure first; nothing if they own the place or start with a stall or cart; else the published guide
    if a["rent"] is not None:
        rent_low = rent_high = a["rent"]
        out["rent_from"] = "you"
    elif a["premises"] in ("own", "mobile"):
        rent_low = rent_high = 0.0
        out["rent_from"] = "none"
        out["notes"].append("We used no rent because you own the place or start with a stall, cart or home kitchen. If you pay a mortgage, enter it as rent.")
    else:
        guide = _usable(data, a, "rent_guide")
        if guide:
            rent_low, rent_high = float(guide[0]["low"]), float(guide[0]["high"])
            out["rent_from"] = "guide"
            out["rent_guide"] = _line(data, guide[0])
            note_source(guide[0]["source_id"])
        else:
            rent_low = rent_high = None
            out["needs"].append("rent")
    # ingredient share
    if a["ingredient_share"] is not None:
        share = a["ingredient_share"]
        out["ingredient_from"] = "you"
    else:
        shares = _usable(data, a, "cost_share")
        if shares:
            share = shares[0]["low"]
            out["ingredient_from"] = "published"
            out["ingredient_row"] = _line(data, shares[0])
            note_source(shares[0]["source_id"])
        else:
            share = None
            out["needs"].append("ingredient_share")
    out["ingredient_share"] = share

    if wage is None or rent_low is None:
        out["reason"] = "We still need a few numbers from you: " + ", ".join(
            {"pay": "pay (we have no sourced figure for your country)", "rent": "your monthly rent", "ingredient_share": "your ingredient share of sales"}[n]
            for n in out["needs"]) + "."
        return out
    people = a["people"]
    people_low, people_high = people * wage["low"], people * wage["high"]
    fixed_other_low, fixed_other_high = rent_low * other_share, rent_high * other_share
    marketing_share = _marketing_share(a["business_type"])
    use_assumption("marketing-share")
    marketing = marketing_share * sales if sales is not None else 0.0
    ingredients = sales * share / 100 if (sales is not None and share is not None) else None

    def trio(low, high):
        return {"low": _r(low), "middle": _r(_mid(low, high)), "high": _r(high)}

    lines = [
        {"key": "people", "label": "People", **trio(people_low, people_high),
         "how": f"{_num_text(people)} people x the pay below x the hours in a month", "pay": wage["row"], "per_person": trio(wage["low"], wage["high"])},
        {"key": "rent_and_other", "label": "Rent and other fixed bills", **trio(rent_low * (1 + other_share), rent_high * (1 + other_share)),
         "how": "rent, plus one third of it for utilities, insurance and other bills"},
    ]
    if ingredients is not None:
        lines.insert(0, {"key": "ingredients", "label": "Ingredients", **trio(ingredients, ingredients),
                         "how": "sales x the ingredient share"})
    if sales is not None:
        lines.append({"key": "marketing", "label": "Marketing", **trio(marketing, marketing),
                      "how": "sales x the marketing share the simulator uses", "share": round(marketing_share, 5)})
    else:
        out["notes"].append("Tell us your customers and what they spend to see ingredients and marketing; the figures below are fixed costs only.")
    total_low = sum(l["low"] for l in lines)
    total_high = sum(l["high"] for l in lines)
    out.update(available=True, lines=lines, low=_r(total_low), high=_r(total_high), middle=_r(_mid(total_low, total_high)),
               partial=sales is None or ingredients is None, fixed_low=_r(people_low + rent_low * (1 + other_share) + marketing),
               fixed_high=_r(people_high + rent_high * (1 + other_share) + marketing), people=people)
    out["people"] = people
    out["per_person_monthly"] = trio(wage["low"], wage["high"])
    # Sanity check against the published pay share of sales
    if sales:
        checks = _usable(data, a, "cost_share_check")
        share_low, share_high = 100 * people_low / sales, 100 * people_high / sales
        out["labour_check"] = {"share_of_sales": [round(share_low, 1), round(share_high, 1)]}
        if checks:
            c = checks[0]
            note_source(c["source_id"])
            out["labour_check"]["published"] = _line(data, c)
    return out


def _break_even(data: dict, a: dict, running: dict, use_assumption, note_source) -> dict:
    out: dict[str, Any] = {"available": False}
    if not running.get("available"):
        out["reason"] = running.get("reason", "We need a few more numbers first.")
        return out
    if a["avg_spend"] is None:
        out["reason"] = "Tell us what one customer spends and we will work out how many customers you need."
        out["needs"] = ["avg_spend"]
        return out
    share = running.get("ingredient_share")
    if share is None:
        out["reason"] = "Tell us your ingredient share of sales to work out break-even."
        out["needs"] = ["ingredient_share"]
        return out
    per_customer = a["avg_spend"] * (1 - share / 100)
    if per_customer <= 0:
        out["reason"] = "With these numbers each customer costs more in ingredients than they pay, so there is no break-even point."
        return out
    days, _ = use_assumption("days-open")
    cushion_low, _ = _value(data, "breakeven-cushion")
    cushion_row = _row_by_id(data, "breakeven-cushion")
    note_source(cushion_row["source_id"])
    out["cushion_row"] = _line(data, cushion_row)
    fixed_low, fixed_high = running["fixed_low"], running["fixed_high"]
    month_low, month_high = fixed_low / per_customer, fixed_high / per_customer
    day_low, day_high = month_low / days, month_high / days
    factor = 1 + cushion_low / 100
    out.update(
        available=True, each_customer_adds=_r(per_customer), fixed_costs={"low": fixed_low, "high": fixed_high},
        customers_per_month={"low": _r(month_low), "middle": _r(_mid(month_low, month_high)), "high": _r(month_high)},
        per_day={"low": _r(day_low), "middle": _r(_mid(day_low, day_high)), "high": _r(day_high)},
        per_day_with_cushion={"low": _r(day_low * factor), "middle": _r(_mid(day_low, day_high) * factor), "high": _r(day_high * factor)},
        cushion_percent=cushion_low, days_open=days,
    )
    hoped = a["customers_per_day"]
    out["hoped_per_day"] = hoped
    if hoped:
        c = out["per_day_with_cushion"]
        if hoped >= c["high"]:
            verdict, text = "above_all", "You hoped for more customers than even the high estimate needs."
        elif hoped >= c["middle"]:
            verdict, text = "above_middle", "You hoped for more customers than the middle estimate needs."
        elif hoped >= c["low"]:
            verdict, text = "above_low", "You hoped for more customers than the low estimate needs, but fewer than the middle one: small changes matter."
        else:
            verdict, text = "below_all", "You hoped for fewer customers than even the low estimate needs, so on these numbers the costs would not be covered."
        out["verdict"], out["verdict_text"] = verdict, text
    return out


def _buffer_and_budget(data: dict, a: dict, startup: dict, running: dict, use_assumption) -> tuple[dict, dict]:
    months_low, months_high = use_assumption("buffer-months")
    cont_low, cont_high = use_assumption("contingency")
    buffer: dict[str, Any] = {"available": False}
    if running.get("available"):
        buffer = {"available": True, "months": [months_low, months_high],
                  "low": _r(months_low * running["low"]), "high": _r(months_high * running["high"]),
                  "partial": running.get("partial", False)}
        buffer["middle"] = _r(_mid(buffer["low"], buffer["high"]))
    budget: dict[str, Any] = {"available": False, "verdict": "unknown"}
    if startup.get("available") and buffer["available"]:
        contingency_low = startup["low"] * cont_low / 100
        contingency_high = startup["high"] * cont_high / 100
        low = startup["low"] + contingency_low + buffer["low"]
        high = startup["high"] + contingency_high + buffer["high"]
        middle = _mid(low, high)
        budget.update(available=True, contingency={"low": _r(contingency_low), "high": _r(contingency_high), "percent": [cont_low, cont_high]},
                      suggested_low=_r(low), suggested_middle=_r(middle), suggested_high=_r(high))
        b = a["budget"]
        if b is None:
            budget["text"] = "You did not tell us your budget, so we can't compare it with this plan."
        elif b >= middle:
            budget.update(verdict="enough", text="Your budget looks enough for the middle of this plan.")
        elif b >= low:
            budget.update(verdict="tight", text="Your budget looks tight: it covers the low end of this plan but not the middle.")
        else:
            budget.update(verdict="not_enough", text="Your budget is below the low end of this plan. You could start smaller (a stall, kiosk or home kitchen), or save for longer.")
    else:
        budget["text"] = "We can't compare your budget with a full plan: some numbers are missing (see above)."
    return buffer, budget


_URGENT = ("licences", "premises")


def _checklist(data: dict, a: dict, note_source) -> list[dict]:
    items = []
    for item in data["checklist"]:
        costs = []
        for rid in item["cost_rows"]:
            row = _row_by_id(data, rid)
            if (_row_ok(data, row) and row.get("country") in (None, a["country"]) and a["business_type"] in row["business_types"]
                    and _applies(row, a)):
                note_source(row.get("source_id"))
                costs.append(_line(data, row))
        sources = []
        for sid in item["where_sources"].get(a["country"], []):
            if data["sources"][sid]["status"] == "verified":
                sources.append(_source_out(data, sid))
                note_source(sid)
        cant = item.get("cant", {}).get(a["country"]) or item.get("cant_all")
        items.append({"id": item["id"], "title": item["title"], "do": item["do"], "costs": costs, "where_kinds": item["where_kinds"],
                      "where_sources": sources, "cant": _fill(data, a, cant) if cant else None})
    if a["timeline"] in ("3m", "6m"):
        items.sort(key=lambda i: (0 if i["id"] in _URGENT else 1))
        for i in items:
            if i["id"] in _URGENT:
                i["urgent"] = "Start here: this can take time, and you may not be able to open without it."
    return items


def _struggles(data: dict, a: dict, note_source) -> list[dict]:
    out = []
    for s in data["struggles"]:
        if a["business_type"] not in s["types"] or ("countries" in s and a["country"] not in s["countries"]):
            continue
        watch = _fill(data, a, s["watch"])
        if watch is None:
            watch = s.get("watch_generic") or ""
        else:
            for rid in s.get("rows", []):
                row = _row_by_id(data, rid)
                if row.get("source_id"):
                    note_source(row["source_id"])
        if not watch:
            continue
        out.append({"id": s["id"], "title": s["title"], "what": s["what"], "watch": watch})
    return out


def _gaps(data: dict, a: dict, startup: dict, running: dict) -> list[dict]:
    gaps = {g["id"]: g["text"] for g in data["gaps"]}
    chosen = []
    if not startup.get("available"):
        chosen.append("gap-us-restaurant-startup" if a["country"] == "US" else "gap-uk-cn-startup")
    if a["country"] != "US":
        chosen += ["gap-rent", "gap-cost-shares"]
    chosen += ["gap-alcohol", "gap-misc"]
    return [{"id": g, "text": gaps[g]} for g in dict.fromkeys(chosen)]


# ---------- "Try it in the simulator" ----------

def simulator_inputs(plan: dict) -> dict:
    """The practice business a plan would set up: the four quick answers plus a few overrides, or what is still missing."""
    a = plan["answers"]
    running, be, startup = plan["running"], plan["break_even"], plan["startup"]
    missing: list[str] = []
    notes: list[str] = []
    if a["avg_spend"] is None:
        missing.append("avg_spend")
    customers = a["customers_per_day"]
    from_break_even = False
    if customers is None:
        if be.get("available"):
            customers = max(1.0, math.ceil(be["per_day_with_cushion"]["middle"]))
            from_break_even = True
            notes.append("You were not sure how many customers to expect, so the practice business uses the number you would need to break even.")
        else:
            missing.append("customers_per_day")
    rent = a["rent"]
    if rent is None:
        if running.get("rent_from") == "guide":
            rent = _mid(running["rent_guide"]["low"], running["rent_guide"]["high"])
            notes.append("You did not give a rent, so the practice business uses the middle of the published guide's range.")
        elif running.get("rent_from") == "none":
            rent = 0.0
        else:
            missing.append("rent")
    out: dict[str, Any] = {"ready": not missing, "missing": missing, "notes": notes, "from_break_even": from_break_even,
                           "customers_per_day": customers, "avg_spend": a["avg_spend"], "monthly_rent": rent, "staff": a["people"],
                           "wage_per_fte": None, "cogs_ratio": None, "cash": None, "rules": {}}
    if running.get("per_person_monthly"):
        out["wage_per_fte"] = running["per_person_monthly"]["middle"]
        row = running["lines"][next(i for i, l in enumerate(running["lines"]) if l["key"] == "people")]["pay"]
        out["rules"]["wage_per_fte"] = f"median pay from {row['source']['name']} (data read {row['source']['accessed']}), as a monthly cost per full-time person; employer taxes and benefits are not included"
    if running.get("ingredient_share") is not None:
        out["cogs_ratio"] = running["ingredient_share"] / 100
        if running.get("ingredient_from") == "published":
            out["rules"]["cogs_ratio"] = f"published median ingredient share of sales from {running['ingredient_row']['source']['name']}"
        else:
            out["rules"]["cogs_ratio"] = "your own estimate of the ingredient share of sales"
    if a["budget"] is not None and startup.get("available"):
        out["cash"] = max(0.0, a["budget"] - startup["middle"])
        out["rules"]["cash"] = "your budget minus the middle of the start-up cost range (never below zero)"
        if a["budget"] < startup["middle"]:
            notes.append("Your budget does not cover the middle of the start-up cost range, so the practice business starts with no cash in the bank.")
    return out


def guide_quick_start(industry: str, inputs: dict) -> QuickStart:
    """A full baseline for the practice business: the four-question start, with the guide's pay, ingredient share and cash on top.
    Raises ValueError (plain reason) if something is missing."""
    if not inputs.get("ready"):
        raise ValueError("Some numbers are still missing: " + ", ".join(inputs.get("missing", [])))
    tpl = get_template(industry)
    q = quick_baseline(tpl, inputs["customers_per_day"], inputs["avg_spend"], inputs["monthly_rent"], inputs["staff"])
    draft = q.baseline
    changes: dict[str, float] = {}
    if inputs.get("wage_per_fte") is not None:
        changes["wage_per_fte"] = round(inputs["wage_per_fte"], 2)
    if inputs.get("cogs_ratio") is not None:
        changes["cogs_ratio"] = round(inputs["cogs_ratio"], 4)
    draft = replace(draft, **changes)
    if inputs.get("cash") is not None:
        draft = replace(draft, cash=round_display(inputs["cash"]) if inputs["cash"] > 0 else 0.0)
    else:
        draft = replace(draft, cash=0.0)
        draft = replace(draft, cash=round_display(2.0 * month_one_summary(draft, tpl)["costs"]))
    draft.validate()
    assumed = []
    for entry in q.assumed:
        rule = inputs.get("rules", {}).get(entry["field"])
        assumed.append({"field": entry["field"], "rule": rule or entry["rule"]})
    return QuickStart(baseline=draft, assumed=assumed, warnings=list(q.warnings) + list(inputs.get("notes", [])))
