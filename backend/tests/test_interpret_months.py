"""Calendar words -> simulation months. Month 1 is NEXT calendar month; these rules are the contract."""
from __future__ import annotations

import datetime as dt

import pytest

from app.interpret.months import (calendar_of, month_label, month_one_note, parse_when, sim_month_of, when_label)

TODAY = dt.date(2026, 9, 30)      # month 1 = October 2026


def test_month_one_is_next_calendar_month():
    assert calendar_of(1, TODAY) == (2026, 10)
    assert month_label(1, TODAY) == "October 2026"
    assert month_one_note(TODAY) == "Month 1 is October 2026, the month after this one."


def test_month_one_across_the_new_year():
    assert month_label(1, dt.date(2026, 12, 15)) == "January 2027"
    assert month_label(1, dt.date(2027, 1, 31)) == "February 2027"
    assert month_label(13, dt.date(2026, 12, 15)) == "January 2028"


@pytest.mark.parametrize("word,expected", [("march", 6), ("october", 1), ("september", 12), ("december", 3)])
def test_a_month_name_is_the_next_time_it_comes_round(word, expected):
    assert parse_when(f"in {word}", TODAY).start == expected


def test_the_current_month_means_next_year_not_a_month_already_half_over():
    assert parse_when("in September", TODAY).start == 12          # today is 30 Sep: the next September is 12 months away
    assert sim_month_of(9, TODAY) == 12


@pytest.mark.parametrize("phrase,start", [
    ("next month", 1), ("right away", 1), ("immediately", 1), ("now", 1), ("asap", 1),
    ("in 3 months", 3), ("in six months", 6), ("in a month", 1), ("in 2 years", 24), ("in a year", 12),
])
def test_relative_starts(phrase, start):
    assert parse_when(f"raise prices {phrase}", TODAY).start == start


def test_this_month_and_weeks_start_in_month_one_with_a_note():
    assert parse_when("this month", TODAY).start == 1 and parse_when("this month", TODAY).notes
    w = parse_when("in two weeks", TODAY)
    assert w.start == 1 and "whole months" in w.notes[0]


def test_summer_for_the_summer_is_june_to_august_and_stops():
    w = parse_when("hire a baker for the summer", TODAY)
    assert (w.start, w.end_after) == (9, 12)                    # June 2027 is month 9; back to normal in month 12 (Sept)
    assert when_label(9, 12, TODAY) == "June → August 2027 (months 9–11)"
    assert any("June to August" in n for n in w.notes)          # the summer definition is always shown


@pytest.mark.parametrize("phrase,start,end_after", [
    ("during the summer", 9, 12), ("over the summer", 9, 12), ("just for summer", 9, 12),
    ("for the winter", 3, 6), ("for the spring", 6, 9), ("for the autumn", 12, 15), ("for the fall", 12, 15),
])
def test_seasons_that_stop(phrase, start, end_after):
    w = parse_when(phrase, TODAY)
    assert (w.start, w.end_after) == (start, end_after)


def test_in_the_summer_only_starts_and_says_so():
    w = parse_when("raise prices in the summer", TODAY)
    assert w.start == 9 and w.end_after is None
    assert any("for the summer" in n for n in w.notes)


def test_this_summer_while_summer_is_under_way_begins_next_month_and_stops_after_august():
    july = dt.date(2026, 7, 10)                                   # month 1 = August
    w = parse_when("for this summer", july)
    assert (w.start, w.end_after) == (1, 2)


@pytest.mark.parametrize("phrase,start,end_after", [
    ("from June to August", 9, 12), ("June-August", 9, 12), ("between June and August", 9, 12),
    ("from november to february", 2, 6),
])
def test_ranges(phrase, start, end_after):
    w = parse_when(phrase, TODAY)
    assert (w.start, w.end_after) == (start, end_after)


def test_for_n_months_and_until():
    w = parse_when("for 3 months starting in June", TODAY)
    assert (w.start, w.end_after) == (9, 12)
    w = parse_when("from next month until December", TODAY)
    assert (w.start, w.end_after) == (1, 4)                       # Oct, Nov, Dec -> back to normal in month 4


def test_may_is_a_month_only_after_a_timing_word():
    assert parse_when("in May", TODAY).start == 8
    assert parse_when("we may hire someone", TODAY).start is None


def test_no_timing_means_none_not_a_guess():
    assert parse_when("hire a baker", TODAY).start is None
    assert parse_when("", TODAY).start is None


def test_next_year_is_too_vague():
    w = parse_when("next year", TODAY)
    assert w.start is None and "Which month" in w.problem


def test_too_far_ahead_is_a_problem_not_a_clamp():
    w = parse_when("in 4 years", TODAY)
    assert w.start is None and "36 months" in w.problem


def test_labels_across_a_year_boundary():
    assert when_label(3, 6, TODAY) == "December 2026 → February 2027 (months 3–5)"
    assert when_label(6, None, TODAY) == "March 2027 (month 6)"
    assert when_label(5, 6, TODAY) == "February 2027 (month 5)"          # a one-month change is not a range
