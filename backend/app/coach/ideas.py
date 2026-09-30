"""Idea hygiene: no two ideas that are nearly the same, no headline that repeats its first sentence."""
from __future__ import annotations

import re

CLEARLY_DIFFERENT_RATIO = 2.0   # same lever: sizes must differ by at least this factor


def _by_lever(idea: dict) -> list[dict]:
    return sorted(idea["decisions"], key=lambda d: (d["type"], d["start_month"]))


def near_duplicate(a: dict, b: dict) -> bool:
    """True when two ideas use the same levers at about the same size (e.g. +3% and +5% prices).
    Different levers, opposite directions, or sizes at least 2x apart count as different ideas."""
    da, db = _by_lever(a), _by_lever(b)
    if [d["type"] for d in da] != [d["type"] for d in db]:
        return False
    for x, y in zip(da, db):
        if set(x) != set(y):                       # e.g. one is a loan and the other is not
            return False
        vx, vy = float(x["value"]), float(y["value"])
        if vx * vy <= 0:                           # opposite direction (or zero)
            return False
        if max(abs(vx), abs(vy)) / min(abs(vx), abs(vy)) >= CLEARLY_DIFFERENT_RATIO:
            return False
    return True


def is_repeat(ideas: list[dict], candidate: dict) -> bool:
    return any(near_duplicate(candidate, other) for other in ideas)


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower()))


def sounds_alike(a: str, b: str, threshold: float = 0.7) -> bool:
    """Most of the shorter text's words also appear in the other."""
    wa, wb = _words(a), _words(b)
    if not wa or not wb:
        return False
    return len(wa & wb) / min(len(wa), len(wb)) >= threshold


def drop_repeated_opening(headline: str, what_happens: str) -> str:
    """If the first sentence of `what_happens` just says the headline again, leave it out."""
    sentences = re.split(r"(?<=[.!?])\s+", what_happens.strip())
    if len(sentences) > 1 and sounds_alike(headline, sentences[0]):
        return " ".join(sentences[1:])
    return what_happens


def limit_sentences(text: str, maximum: int = 2) -> str:
    """Keep at most `maximum` sentences (the coach is meant to be short)."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(sentences[:maximum])
