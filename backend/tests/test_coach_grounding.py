from app.coach.grounding import allowed_numbers, extract_numbers, unmatched_numbers

FACTS = {
    "business": {"months": 24, "currency": "EUR"},
    "scenarios": [{"name": "Raise prices 10%", "profit_change": 4180, "futures": {"beats_change_nothing_of_10": 7},
                   "decisions": ["Raise prices by 10% from month 3"]}],
}


def test_extract_numbers_handles_separators_and_suffixes():
    assert extract_numbers("You could make 4,200 EUR more, about 4.2k, or 2 years, 7 of 10, 10%.") == [
        4200, 4.2 * 1000, 2, 7, 10, 10]
    assert extract_numbers("Version v2 and q3 are not numbers") == []
    assert extract_numbers("a loss of -1,500") == [1500]


def test_facts_numbers_and_always_fine_numbers_pass():
    allowed = allowed_numbers(FACTS)
    text = "In 7 of 10 futures you gain about 4,200 EUR over 24 months (2 years) with a 10% rise from month 3."
    assert unmatched_numbers([text], allowed) == []


def test_rounding_is_allowed_but_invented_numbers_are_not():
    allowed = allowed_numbers(FACTS)
    assert unmatched_numbers(["about 4,000 EUR"], allowed) == []       # 4180 rounded down
    assert unmatched_numbers(["about 4k"], allowed) == []
    assert unmatched_numbers(["you gain 9,999 EUR"], allowed) == [9999]
    assert unmatched_numbers(["8 of 10 futures"], allowed) == [8]


def test_extra_numbers_from_idea_decisions_are_allowed():
    assert unmatched_numbers(["Hire 37 staff"], allowed_numbers(FACTS)) == [37]
    assert unmatched_numbers(["Hire 37 staff"], allowed_numbers(FACTS, [37])) == []
