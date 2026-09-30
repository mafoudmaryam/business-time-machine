"""Calendar words -> simulation months. Plain rules, no AI.

    Simulation month 1 = NEXT calendar month.   (Today is 30 Sep 2026 -> month 1 is October 2026.)

"March" always means the next March that is at least one month away, so it never lands in the current
month (already half over) or in the past. A month name is therefore always in months 1-12.
Seasons are northern-hemisphere: spring Mar-May, summer Jun-Aug, autumn Sep-Nov, winter Dec-Feb.

Every function takes `today` so the tests are not tied to the real date.
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from typing import Optional

MAX_MONTH = 36   # the longest simulation the app offers

MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
              "October", "November", "December"]
MONTH_WORDS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3, "april": 4, "apr": 4, "may": 5,
    "june": 6, "jun": 6, "july": 7, "jul": 7, "august": 8, "aug": 8, "september": 9, "sept": 9, "sep": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}
SEASONS = {"spring": (3, 5), "summer": (6, 8), "autumn": (9, 11), "fall": (9, 11), "winter": (12, 2)}
SEASON_HINT = "Summer means June to August, spring March to May, autumn September to November, winter December to February."

NUMBER_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
                "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "couple": 2, "few": 3}

_MON = r"(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)"
_SEASON = r"(?:spring|summer|autumn|fall|winter)"
_NUM = r"(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few)"
_SPAN_JOIN = r"(?:to|through|thru|until|till|and|-|–|—)"


def number_of(word: str) -> Optional[int]:
    word = word.strip().lower()
    return int(word) if word.isdigit() else NUMBER_WORDS.get(word)


def calendar_of(sim_month: int, today: dt.date) -> tuple[int, int]:
    """(year, calendar month 1-12) of a simulation month."""
    idx = today.year * 12 + (today.month - 1) + sim_month
    year, month0 = divmod(idx, 12)
    return year, month0 + 1


def sim_month_of(calendar_month: int, today: dt.date) -> int:
    """The simulation month (1-12) of the next occurrence of a calendar month."""
    first = today.month % 12 + 1
    return (calendar_month - first) % 12 + 1


def month_label(sim_month: int, today: dt.date) -> str:
    year, month = calendar_of(sim_month, today)
    return f"{MONTH_FULL[month - 1]} {year}"


def when_label(start: int, end_after: Optional[int], today: dt.date) -> str:
    """"March 2027 (month 6)", or for a change that stops: "June → August 2027 (months 9–11)"."""
    if end_after is None or end_after <= start:
        return f"{month_label(start, today)} (month {start})"
    last = end_after - 1
    if last == start:
        return f"{month_label(start, today)} (month {start})"
    y1, m1 = calendar_of(start, today)
    y2, m2 = calendar_of(last, today)
    first = MONTH_FULL[m1 - 1] + ("" if y1 == y2 else f" {y1}")
    span = f"months {start}–{last}"
    return f"{first} → {MONTH_FULL[m2 - 1]} {y2} ({span})"


def month_one_note(today: dt.date) -> str:
    return f"Month 1 is {month_label(1, today)}, the month after this one."


@dataclass
class When:
    start: Optional[int] = None       # simulation month the change begins; None = the owner did not say
    end_after: Optional[int] = None   # first month AFTER it stops (where the reversing decision goes); None = it stays
    notes: list[str] = field(default_factory=list)
    problem: Optional[str] = None     # something was said but cannot be used (e.g. "next year")


def _month_num(word: str) -> int:
    return MONTH_WORDS[word.lower()]


def _mask_may(text: str) -> str:
    """"may" is a month only after a timing word ("in may", "until may"), never the verb ("we may hire")."""
    return re.sub(r"\bmay\b(?<!\bin may)(?<!\bfrom may)(?<!\buntil may)(?<!\btill may)(?<!\bto may)(?<!\bthrough may)"
                  r"(?<!\bby may)(?<!\bbetween may)(?<!\bof may)(?<!\bstarting may)(?<!\band may)", "MAYVERB", text)


def parse_when(phrase: str, today: dt.date) -> When:
    """Read the timing words in `phrase` (a clause, or the timing phrases an AI copied out)."""
    t = _mask_may(phrase.lower())
    w = When()

    def stop_after(k_last: int) -> None:
        w.end_after = k_last + 1

    # 1. a range: "from June to August", "June-August", "between June and August"
    m = re.search(rf"\b({_MON})\s*{_SPAN_JOIN}\s*({_MON})\b", t)
    if m:
        w.start = sim_month_of(_month_num(m.group(1)), today)
        stop_after(w.start + (_month_num(m.group(2)) - _month_num(m.group(1))) % 12)
        return _check(w)

    # 2. a season
    m = re.search(rf"\b(for|during|over|throughout|through|just|only|in|from|starting|start|of)?\s*(?:the\s+)?"
                  rf"(this\s+|next\s+)?({_SEASON})\b", t)
    if m:
        lead = (m.group(1) or "").strip()
        which = (m.group(2) or "").strip()
        first, last = SEASONS[m.group(3)]
        length = (last - first) % 12 + 1
        w.start = sim_month_of(first, today)
        if which == "this" and _in_season(today.month, first, last) and today.month != last:
            w.start = 1                       # the season is already under way: begin next month
            stop_after(sim_month_of(last, today))
        elif lead in ("for", "during", "over", "throughout", "through", "just", "only"):
            stop_after(w.start + length - 1)
        else:
            w.notes.append(f"{m.group(3).capitalize()} is taken as {MONTH_FULL[first - 1]}. "
                           f"The change then stays in place; say “for the {m.group(3)}” if it should stop after "
                           f"{MONTH_FULL[last - 1]}.")
        w.notes.append(SEASON_HINT)
        return _check(w)

    # 3. a start
    if re.search(r"\b(now|right away|straight away|immediately|asap|at once|today|from the start|straightaway)\b", t):
        w.start = 1
        w.notes.append("Month 1 is next month, the first month the simulation covers.")
    elif re.search(r"\bnext month\b", t):
        w.start = 1
    elif re.search(r"\bthis month\b", t):
        w.start = 1
        w.notes.append("This month is already under way, so this starts in month 1 (next month).")
    elif (m := re.search(rf"\bin\s+{_NUM}\s+(month|months)\b", t)):
        w.start = number_of(m.group(1))
    elif (m := re.search(rf"\b(?:in|within|after)\s+{_NUM}\s+(week|weeks|day|days)\b", t)):
        w.start = 1
        w.notes.append("The simulation works in whole months, so a start within weeks is month 1 (next month).")
    elif (m := re.search(rf"\bin\s+{_NUM}\s+(year|years)\b", t)):
        w.start = 12 * (number_of(m.group(1)) or 0)
    elif re.search(r"\bnext year\b", t):
        w.problem = "“next year” is too vague. Which month next year?"
    elif (m := re.search(rf"\b({_MON})\b", t)):
        w.start = sim_month_of(_month_num(m.group(1)), today)

    # 4. how long it lasts
    if w.start is not None:
        m = re.search(rf"\bfor\s+(?:about\s+|just\s+|only\s+)?{_NUM}\s+(month|months)\b", t)
        if m and number_of(m.group(1)):
            stop_after(w.start + number_of(m.group(1)) - 1)
        else:
            m = re.search(rf"\b(?:until|till|through|thru)\s+({_MON})\b", t)
            if m:
                stop_after(w.start + (_month_num(m.group(1)) - _calendar_of(w.start, today)) % 12)
    return _check(w)


def _calendar_of(sim_month: int, today: dt.date) -> int:
    return calendar_of(sim_month, today)[1]


def _in_season(month: int, first: int, last: int) -> bool:
    return first <= month <= last if first <= last else month >= first or month <= last


def _check(w: When) -> When:
    if w.start is not None and not 1 <= w.start <= MAX_MONTH:
        w.problem = f"Month {w.start} is outside the {MAX_MONTH} months the simulator covers."
        w.start = None
    if w.end_after is not None and w.start is not None and w.end_after > MAX_MONTH + 1:
        w.end_after = None     # it stops after the simulation ends anyway
    return w
