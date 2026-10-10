"""Money in the coach's words is always in the business's own currency (a CNY café once read "$168,000")."""
import pytest

from app.coach import consistency, currency, prompts, today
from app.engine_bridge import format_money


def facts_for(code: str, practice: bool = False, **t) -> dict:
    today_block = {"sales_a_month": 168000, "costs_a_month": 84300, "profit_a_month": 83700, "profit_a_month_bad_case": 70000,
                   "profit_a_month_good_case": 95000, "profit_year_most_likely": 1010000, "cash_now": 170000,
                   "months_of_bills_covered": 2, "lowest_cash_month": 1, "lowest_cash_amount": 160000,
                   "cash_runs_out_of_10": 0, "profit_bad_case_year": 900000}
    today_block.update(t)
    business = {"industry": "Café", "customers_word": "regulars", "staff_word": "barista", "months": 12, "currency": code}
    if practice:
        business["practice"] = True
    return {"business": business, "today": today_block}


@pytest.mark.parametrize("code, shown", [("CNY", "CN¥168,000"), ("GBP", "£168,000"), ("USD", "$168,000"), ("JPY", "¥168,000"),
                                         ("CHF", "CHF 168,000"), ("KRW", "₩168,000")])
def test_the_rule_based_today_note_uses_the_business_currency(code, shown):
    note = today.build_note(facts_for(code))
    assert shown in note
    assert currency.foreign_currency([note], code) is None          # the rule-based text passes its own check


def test_zero_decimal_currencies_are_written_as_whole_amounts():
    assert format_money(168000.4, "JPY") == "¥168,000" and format_money(1234567, "KRW") == "₩1,234,567"
    assert format_money(-4500, "CHF") == "-CHF 4,500"


@pytest.mark.parametrize("code, text, bad", [
    ("CNY", "You would keep about $83,700 a month.", "$"),
    ("CNY", "You would keep about 83,700 USD a month.", "USD"),
    ("CNY", "About ¥83,700 a month.", "¥"),                     # the app writes CN¥
    ("GBP", "About $5,000.", "$"),
    ("USD", "About £5,000 a month.", "£"),
    ("USD", "About CA$5,000 a month.", "CA$"),
    ("JPY", "About CN¥5,000.", "CN¥"),
    ("CHF", "About EUR 5,000.", "EUR"),
])
def test_an_amount_in_another_currency_is_caught(code, text, bad):
    reason = currency.foreign_currency([text], code)
    assert reason is not None and bad in reason


@pytest.mark.parametrize("code, text", [
    ("CNY", "You would keep about CN¥83,700 a month, and CN¥1,010,000 in a year."),
    ("GBP", "About £5,000 a month."),
    ("USD", "About $5,000 a month and 5 of 10 futures."),
    ("JPY", "About ¥500,000."),
    ("CHF", "About CHF 5,000."),
    ("CNY", "No money amounts here, only 12 months and 3 baristas."),
])
def test_amounts_in_the_right_currency_pass(code, text):
    assert currency.foreign_currency([text], code) is None


def test_the_prompt_keeps_the_currency_symbol_and_shows_the_businesses_own_example():
    facts = facts_for("CNY")
    system, user = prompts.today_prompt(facts)
    assert "CN¥168,000" in user and "CN¥1,010,000" in user          # the symbol is not stripped any more
    assert "for example CN¥27,900" in system and "$27,900" not in system
    for code, mark in (("GBP", "£"), ("EUR", "€"), ("INR", "₹")):
        assert mark + "168,000" in prompts.today_prompt(facts_for(code))[1]


# ---------- practice business (made from the start-up guide) ----------

def test_a_practice_business_note_says_so_and_does_not_praise_or_mention_regulars():
    note = today.build_note(facts_for("CNY", practice=True))
    assert note.startswith("This is a practice business built from your rough plan")
    assert "would take in" in note and "would keep" in note
    lowered = note.lower()
    for word in ("doing well", "on track", "regulars", "good year", "great"):
        assert word not in lowered
    assert len([s for s in note.split(". ") if s]) <= 4
    assert consistency.check([note], facts_for("CNY", practice=True)) is None


def test_the_normal_note_is_unchanged():
    note = today.build_note(facts_for("USD"))
    assert note.startswith("In a typical month you take in about $168,000") and "practice" not in note


@pytest.mark.parametrize("text", [
    "Your practice café is doing well and looks on track for a good year.",
    "Your regulars should keep coming back.",
    "Great news, this looks healthy.",
])
def test_an_ai_note_that_praises_a_practice_business_is_rejected(text):
    assert consistency.check([text], facts_for("CNY", practice=True)) is not None
    assert consistency.check([text.replace("regulars", "customers")], facts_for("CNY")) is None or "regulars" not in text


def test_the_practice_instruction_is_only_in_the_prompt_of_a_practice_business():
    assert "PRACTICE BUSINESS" in prompts.today_prompt(facts_for("CNY", practice=True))[0]
    assert "PRACTICE BUSINESS" not in prompts.today_prompt(facts_for("CNY"))[0]
