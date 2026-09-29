from app.coach.ideas import drop_repeated_opening, near_duplicate, sounds_alike
from app.coach.money import facts_for_prompt


def idea(*decisions):
    return {"decisions": list(decisions)}


def d(type_, value, month=2, **extra):
    return {"type": type_, "start_month": month, "value": value, "unit": "percent", **extra}


def test_similar_sizes_of_the_same_lever_are_near_duplicates():
    assert near_duplicate(idea(d("price", 3)), idea(d("price", 5)))
    assert near_duplicate(idea(d("price", 5)), idea(d("price", 5, month=6)))


def test_clearly_different_sizes_or_directions_or_levers_are_not():
    assert not near_duplicate(idea(d("price", 3)), idea(d("price", 10)))
    assert not near_duplicate(idea(d("price", 5)), idea(d("price", -5)))
    assert not near_duplicate(idea(d("price", 5)), idea(d("marketing", 5)))
    assert not near_duplicate(idea(d("investment", 5000)), idea(d("investment", 5000, loan_months=24)))


def test_sounds_alike_and_trimming():
    assert sounds_alike("Raising prices looks like a good move.", "Raising prices looks like a good move for you.")
    assert not sounds_alike("Raising prices looks like a good move.", "You could make about $5,000 more profit.")
    assert drop_repeated_opening("A good move.", "A good move. Then numbers.") == "Then numbers."
    assert drop_repeated_opening("A good move.", "A good move.") == "A good move."     # nothing else to show


def test_facts_for_prompt_formats_money_only():
    facts = {"business": {"currency": "EUR", "months": 24, "cash_today": 25000},
             "scenarios": [{"name": "X", "profit_change": 27900, "regulars_change_count": -26,
                            "drivers": [{"key": "price", "amount": -1234}],
                            "futures": {"profit_bad_case": 100000, "cash_runs_out_of_10": 2}}]}
    out = facts_for_prompt(facts)
    assert "currency" not in out["business"]
    assert out["business"]["cash_today"] == "\u20ac25,000" and out["business"]["months"] == 24
    s = out["scenarios"][0]
    assert s["profit_change"] == "\u20ac27,900" and s["drivers"][0]["amount"] == "-\u20ac1,234"
    assert s["futures"]["profit_bad_case"] == "\u20ac100,000" and s["futures"]["cash_runs_out_of_10"] == 2
    assert s["regulars_change_count"] == -26                     # a count of people, not money
    assert facts["scenarios"][0]["profit_change"] == 27900       # the original is untouched
