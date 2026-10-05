"""The journal's arithmetic: a real month against the expected range."""
from __future__ import annotations

import pytest

from btm_engine.journal import accuracy_summary, compare_month, months_between


class TestCompareMonth:
    def test_inside_the_range(self):
        c = compare_month(5900, 4800, 6000, 7300)
        assert c["position"] == "inside"
        assert c["difference"] == -100
        assert c["percent_difference"] == pytest.approx(-100 / 6000 * 100)
        assert (c["expected_low"], c["expected"], c["expected_high"], c["actual"]) == (4800, 6000, 7300, 5900)

    def test_the_edges_count_as_inside(self):
        assert compare_month(4800, 4800, 6000, 7300)["position"] == "inside"
        assert compare_month(7300, 4800, 6000, 7300)["position"] == "inside"

    def test_just_outside_is_below_or_above(self):
        assert compare_month(4799.99, 4800, 6000, 7300)["position"] == "below"
        assert compare_month(7300.01, 4800, 6000, 7300)["position"] == "above"

    def test_the_difference_is_real_minus_most_likely(self):
        assert compare_month(7000, 4800, 6000, 7300)["difference"] == 1000
        assert compare_month(5000, 4800, 6000, 7300)["difference"] == -1000

    def test_a_loss_is_compared_like_anything_else(self):
        c = compare_month(-500, -2000, -300, 900)
        assert c["position"] == "inside" and c["difference"] == -200
        assert c["percent_difference"] == pytest.approx(-200 / 300 * 100)      # relative to the size of the expected figure

    def test_no_percent_when_the_expected_figure_is_zero(self):
        assert compare_month(10, -5, 0, 5)["percent_difference"] is None

    def test_a_zero_width_range_still_works(self):
        assert compare_month(5, 5, 5, 5)["position"] == "inside"
        assert compare_month(6, 5, 5, 5)["position"] == "above"

    @pytest.mark.parametrize("bad", [float("nan"), float("inf"), None, "7", True])
    def test_nonsense_is_refused(self, bad):
        with pytest.raises(ValueError):
            compare_month(bad, 1, 2, 3)
        with pytest.raises(ValueError):
            compare_month(1, bad, 2, 3)

    def test_a_range_out_of_order_is_refused(self):
        with pytest.raises(ValueError):
            compare_month(1, 5, 3, 9)
        with pytest.raises(ValueError):
            compare_month(1, 1, 9, 3)

    def test_nothing_is_changed_in_what_it_is_given(self):
        args = (5900, 4800, 6000, 7300)
        compare_month(*args)
        assert args == (5900, 4800, 6000, 7300)


class TestAccuracySummary:
    def rows(self, *figures):
        return [compare_month(a, 4800, 6000, 7300) for a in figures]

    def test_counts_where_months_landed(self):
        s = accuracy_summary(self.rows(5900, 7000, 4000, 9000, 6100))
        assert (s["months"], s["inside"], s["below"], s["above"]) == (5, 3, 1, 1)

    def test_average_difference_is_signed(self):
        s = accuracy_summary(self.rows(6500, 6300))          # +500 and +300
        assert s["mean_difference"] == 400

    def test_average_size_of_the_miss_ignores_the_sign(self):
        s = accuracy_summary(self.rows(5400, 6600))          # -10% and +10%
        assert s["mean_abs_percent_difference"] == pytest.approx(10)

    def test_nothing_to_summarise(self):
        s = accuracy_summary([])
        assert s["months"] == 0 and s["mean_difference"] is None and s["mean_abs_percent_difference"] is None

    def test_months_with_no_percent_do_not_break_the_average(self):
        mixed = [compare_month(10, -5, 0, 5), compare_month(5400, 4800, 6000, 7300)]
        s = accuracy_summary(mixed)
        assert s["mean_abs_percent_difference"] == pytest.approx(10)
        assert accuracy_summary([compare_month(10, -5, 0, 5)])["mean_abs_percent_difference"] is None


class TestMonthsBetween:
    @pytest.mark.parametrize("a,b,expected", [
        ((2026, 10), (2026, 10), 0), ((2026, 10), (2026, 11), 1), ((2026, 10), (2027, 10), 12),
        ((2026, 12), (2027, 1), 1), ((2026, 10), (2026, 9), -1), ((2026, 1), (2026, 12), 11),
    ])
    def test_it_counts_calendar_months(self, a, b, expected):
        assert months_between(*a, *b) == expected
