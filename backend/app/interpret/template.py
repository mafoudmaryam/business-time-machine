"""The rule-based parser: regular expressions for the common ways an owner phrases a decision.

Free, instant, and the fallback whenever the AI fails. It only understands the patterns below; anything
it cannot read becomes a question or a "can't simulate that yet" message, never a guess.
"""
from __future__ import annotations

import difflib
import re
from typing import Optional

from .draft import Context, Draft, ParseResult
from .months import MONTH_WORDS, NUMBER_WORDS, number_of

MAX_TEXT = 1000

# ---------- small vocabulary helpers ----------

_FUZZY_WORDS = [
    "raise", "increase", "reduce", "lower", "decrease", "discount", "prices", "price", "pricing", "marketing",
    "advertising", "staff", "baker", "barista", "server", "waiter", "waitress", "employee", "worker", "chef",
    "cashier", "assistant", "someone", "open", "closed", "days", "month", "months", "menu", "invest", "equipment",
    "machine", "oven", "summer", "spring", "winter", "autumn", "percent", "weekend", "weekends", "instagram",
    "facebook", "hire", "hiring", "employ", "recruit", "double", "triple", "halve", "purchase", "renovation",
    "january", "february", "march", "april", "june", "july", "august", "september", "october", "november",
    "december", "week", "weeks", "year", "years", "next", "loan", "interest",
]
_FUZZY_SET = set(_FUZZY_WORDS)


def _fix_typos(text: str) -> str:
    """Repair small spelling slips ("raize prises 10%") by matching words to the ones the rules know."""
    def fix(match: re.Match) -> str:
        word = match.group(0)
        low = word.lower()
        if len(low) < 4 or low in _FUZZY_SET:
            return word
        close = difflib.get_close_matches(low, _FUZZY_WORDS, n=1, cutoff=0.8)
        return close[0] if close else word
    return re.sub(r"[A-Za-z]+", fix, text)


_PCT_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
              "ten": 10, "twelve": 12, "fifteen": 15, "twenty": 20, "twenty five": 25, "thirty": 30, "forty": 40,
              "fifty": 50}
_PCT = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|percent\b|per\s*cent\b|pct\b)")
_PCT_WORD = re.compile(r"\b(" + "|".join(sorted(_PCT_WORDS, key=len, reverse=True)) + r")\s*(?:percent|per\s*cent)\b")
_MONEY = re.compile(
    r"(?P<cur>[$€£¥])?\s*(?P<num>\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(?P<k>k\b|thousand\b|grand\b)?"
    r"\s*(?P<word>dollars?|euros?|pounds?|bucks|usd|eur|gbp)?", re.I)
_NOT_MONEY_AFTER = re.compile(r"\s*(%|percent|per\s*cent|months?|days?|weeks?|years?|hours?|staff|people|seats)\b", re.I)


def find_percent(text: str) -> Optional[float]:
    m = _PCT.search(text)
    if m:
        return float(m.group(1))
    m = _PCT_WORD.search(text)
    return float(_PCT_WORDS[m.group(1)]) if m else None


def find_money(text: str, allow_bare: bool = True) -> Optional[float]:
    """An amount of money: "$5,000", "5k", "8000 dollars", or (allow_bare) a plain number of 100 or more."""
    for m in _MONEY.finditer(text):
        if _NOT_MONEY_AFTER.match(text, m.end()):
            continue
        value = float(m.group("num").replace(",", ""))
        marked = bool(m.group("cur") or m.group("word") or m.group("k"))
        if m.group("k"):
            value *= 1000
        if marked or (allow_bare and value >= 100):
            return value
    return None


def singular(noun: str) -> str:
    if noun.endswith("sses") or noun.endswith("xes"):
        return noun[:-2]
    if noun.endswith("s") and not noun.endswith("ss") and noun != "staff":
        return noun[:-1]
    return noun


def _quote(original: str) -> str:
    return re.sub(r"^[\s,;.&]+|[\s,;.]+$", "", original)


# ---------- what is out of scope, and how to split a sentence ----------

_OUT_OF_SCOPE = re.compile(
    r"\b(second|third|another|new|extra)\s+(shop|store|location|branch|restaurant|caf[eé]|bakery|outlet)\b"
    r"|\bopen\s+a\s+(?:new\s+)?(shop|store|branch|location|restaurant|caf[eé]|bakery|outlet)\b"
    r"|\bfranchis\w*|\blogo\b|\brebrand\w*|\brename\b|\bwebsite\b|\bonline\s+(shop|store|ordering)\b|\bdelivery\b"
    r"|\bcatering\b|\bsell\s+(the|my)\s+(business|shop|caf[eé]|restaurant|bakery)\b|\bsupplier\w*|\bmerge\b"
    r"|\bacquire\b|\bmove\s+(to|premises)\b|\bnew\s+premises\b|\btakeaway\b|\bloyalty\s+(card|scheme|program)\b"
    r"|\bopen\s+(later|earlier)\b|\blonger\s+hours\b|\bextend\w*\s+(the\s+)?hours\b|\bevening\s+hours\b", re.I)

_SPLIT = re.compile(r"\s*(?:(?<!\d),|,(?!\d)|;|\.(?=\s)|\band\b|\bthen\b|\balso\b|\bplus\b|&|\bas well as\b)\s*", re.I)
_KEEP_TOGETHER = re.compile(
    r"\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun"
    r"|jul|aug|sept|sep|oct|nov|dec)\s+(?:and|to|through)\s+(?:january|february|march|april|may|june|july|august"
    r"|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b"
    r"|\b(?:hire|employ|recruit)\s+(?:a|an|one|two|three|\d+)\s+[a-z\- ]{2,25}?\s+and\s+(?:a|an|one|two|three|\d+)\s+[a-z]+\b"
    r"|\bboth\b|\bfull[- ]time and part[- ]time\b|\bbread and pastries\b", re.I)


_CONTINUATION = re.compile(
    r"(financed|financing|paid|paying|pay\b|with (a )?loan|on (a )?loan|on credit|over \d|over (one|two|three|four|five)\b|"
    r"at \d|using (a )?loan|by (a )?loan|for (about )?\d+ (months|years)|interest|no interest)", re.I)


def _clauses(text: str) -> list[str]:
    """Split "raise prices 10% in March and hire a baker" into its decisions, keeping the owner's own words."""
    masked = list(text)
    for m in _KEEP_TOGETHER.finditer(text):
        for i in range(m.start(), m.end()):
            if masked[i] in ",;&" or text[i:i + 3].lower() == "and":
                masked[i] = "\x00"
    masked_text = "".join(masked)
    # an "and" that is really part of a kept-together span is neutralised above; split on what is left
    parts, last = [], 0
    for m in _SPLIT.finditer(masked_text):
        parts.append(text[last:m.start()])
        last = m.end()
    parts.append(text[last:])
    merged: list[str] = []
    for part in (_quote(p) for p in parts):
        if not part:
            continue
        # "buy an oven for $8,000, financed over 24 months at 6%": the second bit belongs to the first
        if merged and _CONTINUATION.match(part):
            merged[-1] = f"{merged[-1]}, {part}"
        else:
            merged.append(part)
    return merged


# ---------- per-lever readers ----------

_UP = r"(?:rais\w*|increas\w*|up|hik\w*|lift\w*|bump\w*|higher|rise|risin\w*|grow\w*|boost\w*|more|expand\w*|add\w*|spend\w*|double|triple|start\w*)"
_DOWN = r"(?:cut\w*|lower\w*|reduc\w*|drop\w*|decreas\w*|discount\w*|slash\w*|down|cheaper|less|trim\w*|halv\w*|stop\w*)"
_VAGUE = re.compile(r"\b(a bit|a little|slightly|somewhat|some|a lot|significantly|substantially|much|bit)\b")


def _direction(text: str) -> int:
    up, down = re.search(rf"\b{_UP}\b", text), re.search(rf"\b{_DOWN}\b", text)
    if up and down:
        return 1 if up.start() < down.start() else -1
    return 1 if up else -1 if down else 0


def _read_price(c: str, quote: str) -> Draft:
    d = Draft("price", quote, unit="percent", when_text=c)
    direction = _direction(c)
    if re.search(r"\b\d+(?:\.\d+)?\s*(?:%|percent)\s+(?:off|cheaper|lower|less)\b|\bdiscount\b", c):
        direction = -1
    pct = find_percent(c)
    if pct is None:
        m = re.search(r"\bby\s+(\d+(?:\.\d+)?)\b", c)
        pct = float(m.group(1)) if m else None
    if pct is None:
        d.missing.append("amount")
        if find_money(c, allow_bare=False) is not None:
            d.ask = "Do you mean a percentage change to all your prices? By how much?"
        elif direction > 0:
            d.ask = "By how much do you want to raise prices?"
        elif direction < 0:
            d.ask = "By how much do you want to cut prices?"
        else:
            d.ask = "Do you want to raise or cut your prices, and by how much?"
    else:
        d.value = pct * (direction if direction else 1)
    return d


_STAFF = (r"(?:staff|baker|bakers|barista|baristas|server|servers|waiter|waiters|waitress|waitresses|cook|cooks|chef|chefs|"
          r"cashier|cashiers|employee|employees|worker|workers|assistant|assistants|helper|helpers|dishwasher|dishwashers|"
          r"someone|somebody|people|person|hand|hands|team member|team members|member of staff|kitchen help|driver|drivers|"
          r"pastry chef|sous chef|line cook|barmaid|bartender|bartenders|host|hostess)")
_HIRE = r"(?:hire|hiring|employ\w*|recruit\w*|take on|taking on|bring on|bringing on|onboard\w*|get|need|add|adding|another)"
_FIRE = r"(?:fire|firing|let go|lay off|laying off|laid off|dismiss\w*|downsiz\w*|cut|reduce|lose|release)"


def _read_hiring(c: str, quote: str, ctx: Context) -> Optional[Draft]:
    hire, fire = re.search(rf"\b{_HIRE}\b", c), re.search(rf"\b{_FIRE}\b", c)
    noun_m = re.search(rf"\b({_STAFF})\b", c)
    if not noun_m or not (hire or fire):
        return None
    # "buy a dishwasher" is equipment, and "cut staff hours" is not a headcount change: leave both to other readers
    if re.search(r"\b(buy|purchase|invest|install)\b", c) and not re.search(r"\b(hire|employ|recruit|take on)\b", c):
        return None
    sign = -1 if fire and (not hire or fire.start() < hire.start()) and not re.search(r"\b(hire|employ|recruit)\b", c) else 1
    count = 1.0
    m = re.search(rf"\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|couple|few)\s+(?:of\s+)?(?:more\s+|extra\s+|new\s+|additional\s+)?"
                  rf"(?:part[- ]?time\s+|full[- ]?time\s+|half[- ]?time\s+)?(?:[a-z\-]+\s+){{0,2}}?{_STAFF}\b", c)
    if m:
        got = m.group(1)
        count = float(got) if re.fullmatch(r"\d+(?:\.\d+)?", got) else float(number_of(got) or 1)
    part = bool(re.search(r"\b(part[- ]?time|half[- ]?time)\b", c))
    value = sign * count * (0.5 if part else 1.0)
    noun = noun_m.group(1)
    if noun in ("someone", "somebody", "people", "person", "hand", "hands", "staff", "employee", "employees", "worker",
                "workers", "helper", "helpers", "assistant", "assistants", "member of staff", "team member", "team members"):
        noun = ctx.staff_noun
    d = Draft("hiring", quote, value=value, unit="fte", when_text=c, noun=singular(noun))
    if part:
        d.extras["part_time"] = True
    return d


_MARKETING = (r"(?:marketing|advertis\w*|adverts?|ads?|promotion\w*|instagram|facebook|tiktok|social media|flyers?|leaflets?|"
              r"google ads|billboards?|influencers?|campaigns?|newsletters?|radio|posters?)")


def _read_marketing(c: str, quote: str, ctx: Context) -> Optional[Draft]:
    if not re.search(rf"\b{_MARKETING}\b", c) or re.search(r"\bhire\b", c):
        return None
    d = Draft("marketing", quote, when_text=c)
    if re.search(r"\b(stop|cancel|scrap|end)\w*\s+(all\s+|our\s+|the\s+|my\s+)?(marketing|advertis\w*|ads)\b", c):
        d.unit, d.value = "per_month", 0.0
        return d
    direction = _direction(c)
    if re.search(r"\bdouble\b", c):
        d.unit, d.value = "percent", 100.0
        return d
    if re.search(r"\btriple\b", c):
        d.unit, d.value = "percent", 200.0
        return d
    if re.search(r"\b(halv\w*|half)\b", c):
        d.unit, d.value = "percent", -50.0
        return d
    pct = find_percent(c)
    if pct is not None:
        d.unit, d.value = "percent", pct * (direction if direction else 1)
        return d
    money = find_money(c)
    if money is not None:
        d.unit = "per_month"
        total = re.search(r"\b(to|up to|budget of|budget to|total of|in total|altogether|a total)\b", c) and not re.search(r"\b(spend|spending)\b.*\bon\b", c)
        d.meaning = "total" if total else "extra"
        d.value = money if d.meaning == "total" else ctx.marketing + money
        d.extras["extra_amount"] = money
        return d
    d.missing.append("amount")
    d.ask = ("By how much do you want to cut marketing? Say a percentage, or an amount per month." if direction < 0
             else "How much more do you want to spend on marketing? Say a percentage, or an amount per month.")
    return d


def _read_hours(c: str, quote: str, ctx: Context) -> Optional[Draft]:
    if not re.search(r"\b(open|opening|closed?|closing|trading|days? a week|days? per week|days? a month)\b", c):
        return None
    if re.search(r"\b(hire|price|prices|marketing)\b", c):
        return None
    d = Draft("hours", quote, unit="days", when_text=c)
    m = re.search(r"\b(\d+|one|two|three|four|five|six|seven)\s+days?\s*(?:a|per|each|every|/)\s*(week|month)\b", c)
    if not m:
        m = re.search(r"\bopen\w*\s+(?:for\s+)?(\d+|one|two|three|four|five|six|seven)\s+days?\b", c)
    if m:
        n = float(number_of(m.group(1)) or 0)
        per = m.group(2) if m.lastindex and m.lastindex >= 2 else "week" if n <= 7 else "month"
        d.value = round(n * 52 / 12) if per == "week" else n
        if per == "week":
            d.extras["per_week"] = n
    else:
        d.missing.append("amount")
        d.ask = "How many days a month do you want to be open?"
    return d


_EQUIPMENT = (r"(?:oven|ovens|machine|machines|grinder|equipment|fridge|freezer|refrigerator|mixer|kitchen|renovation|refurb\w*|"
              r"furniture|terminal|van|fit[- ]?out|patio|extension|building work|espresso|coffee machine|dishwasher|toaster|"
              r"display|counter|espresso machine|proofer|slicer|till|pos)")
_INVEST = r"(?:buy|bought|purchase|purchasing|invest\w*|install\w*|renovat\w*|refurbish\w*|upgrade|lease|finance|financ\w*|spend|get|order)"


def _read_investment(c: str, quote: str) -> Optional[Draft]:
    if not (re.search(rf"\b{_INVEST}\b", c) and re.search(rf"\b{_EQUIPMENT}\b", c)) and not re.search(r"\binvest\w*\b", c):
        return None
    d = Draft("investment", quote, unit="amount", when_text=c)
    money = find_money(re.sub(r"\b\d+(?:\.\d+)?\s*(?:%|percent)[^,]*", " ", c))
    if money is None:
        d.missing.append("amount")
        d.ask = "How much will it cost?"
    else:
        d.value = money
    if re.search(r"\b(loan|financ\w*|borrow\w*|credit|instal+ments?|pay it off|pay back|paid back|repay\w*)\b", c):
        m = re.search(r"\b(?:over|across|within|in)\s+(\d+|one|two|three|four|five)\s+(year|years|month|months)\b", c)
        if m:
            n = number_of(m.group(1)) or 0
            d.extras["loan_months"] = n * 12 if m.group(2).startswith("year") else n
        else:
            d.missing.append("loan_months")
        rate = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:%|percent)\s*(?:a year|per year|annual|interest|apr)?", c)
        if rate:
            d.extras["annual_rate"] = float(rate.group(1)) / 100
        elif "interest-free" in c or "no interest" in c or "0% interest" in c or "interest free" in c:
            d.extras["annual_rate"] = 0.0
        else:
            d.missing.append("rate")
    cap = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:%|percent)\s+(?:more\s+)?(?:capacity|faster|output)", c)
    if cap:
        d.extras["capacity_pct"] = float(cap.group(1))
    return d


def _read_menu(c: str, quote: str) -> Optional[Draft]:
    if not re.search(r"\b(menu|dish|dishes|item|items|special|specials|pastries|pastry|dessert|desserts|cake|cakes|"
                     r"sandwich|sandwiches|upsell\w*|upgrade\w*|drinks?|cocktails?|bread|breads|range)\b", c):
        return None
    if not re.search(r"\b(add\w*|introduc\w*|launch\w*|new|expand\w*|chang\w*|revamp\w*|redo|upsell\w*|premium|offer\w*|sell\w*|extend\w*)\b", c):
        return None
    d = Draft("menu", quote, unit="percent", when_text=c)
    pct = find_percent(c)
    if pct is None:
        d.missing.append("amount")
        d.ask = "By roughly how much do you think this will raise what the average customer spends (in %)?"
    else:
        d.value = pct * (-1 if _direction(c) < 0 and not re.search(r"\b(add|introduc|launch|new)\w*\b", c) else 1)
    return d


# ---------- the parser ----------

def parse(text: str, ctx: Context) -> ParseResult:
    result = ParseResult()
    for original in _clauses(text[:MAX_TEXT]):
        c = _fix_typos(original).lower()
        if _OUT_OF_SCOPE.search(c):
            result.out_of_scope.append(original)
            continue
        draft: Optional[Draft] = None
        if re.search(r"\b(pric\w*|discount\w*)\b", c) and not re.search(rf"\b{_MARKETING}\b", c) and not re.search(r"\b(hire|employ|recruit)\b", c):
            draft = _read_price(c, original)
        if draft is None:
            draft = _read_hiring(c, original, ctx)
        if draft is None:
            draft = _read_marketing(c, original, ctx)
        if draft is None:
            draft = _read_hours(c, original, ctx)
        if draft is None:
            draft = _read_investment(c, original)
        if draft is None:
            draft = _read_menu(c, original)
        if draft is None:
            result.not_understood.append(original)
        else:
            result.drafts.append(draft)
    return result


# ---------- answers to questions ----------

def _first_number(text: str) -> Optional[float]:
    m = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    if m:
        return float(m.group(0))
    for word, value in NUMBER_WORDS.items():
        if re.search(rf"\b{word}\b", text.lower()) and word not in ("a", "an"):
            return float(value)
    return None


def apply_answer(draft: Draft, slot: str, answer: str, ctx: Context) -> None:
    """Fill one missing piece from the owner's short answer ("10%", "in June", "part-time")."""
    a = answer.strip()
    low = _fix_typos(a).lower()
    if slot == "when":
        draft.when_text = f"{draft.when_text} {low}"
    elif slot == "permanent":
        if re.search(r"\b(yes|keep|stay|stays|permanent\w*|forever|on going|ongoing|continue)\b", low):
            draft.permanent = True
    elif slot == "rate":
        n = find_percent(low)
        n = n if n is not None else _first_number(low)
        if n is not None:
            draft.extras["annual_rate"] = n / 100
            _clear(draft, "rate")
    elif slot == "loan_months":
        n = _first_number(low)
        if n is not None:
            draft.extras["loan_months"] = int(n * 12) if re.search(r"\byears?\b", low) else int(n)
            _clear(draft, "loan_months")
    elif slot == "amount":
        _apply_amount(draft, low, ctx)


def _clear(draft: Draft, slot: str) -> None:
    if slot in draft.missing:
        draft.missing.remove(slot)


def _apply_amount(draft: Draft, low: str, ctx: Context) -> None:
    sign = 1
    if draft.type in ("price", "menu", "marketing") and re.search(rf"\b{_DOWN}\b", low):
        sign = -1
    if draft.type in ("price", "menu"):
        n = find_percent(low)
        n = n if n is not None else _first_number(low)
        if n is not None:
            draft.value = n * sign if n > 0 else n
    elif draft.type == "marketing":
        pct, money = find_percent(low), find_money(low)
        if pct is not None:
            draft.unit, draft.value = "percent", pct * sign
        elif money is not None or _first_number(low) is not None:
            amount = money if money is not None else _first_number(low)
            draft.unit, draft.meaning = "per_month", "extra"
            draft.value = ctx.marketing + amount
            draft.extras["extra_amount"] = amount
    elif draft.type == "hours":
        n = _first_number(low)
        if n is not None:
            if re.search(r"\bweek\b", low):
                draft.extras["per_week"] = n
                n = round(n * 52 / 12)
            draft.value = n
    elif draft.type == "investment":
        money = find_money(low)
        money = money if money is not None else _first_number(low)
        if money is not None:
            draft.value = money
    if draft.value is not None:
        _clear(draft, "amount")
