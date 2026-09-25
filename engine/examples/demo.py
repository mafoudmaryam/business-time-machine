"""Demo: compare a baseline café with three decisions over 24 months.

Run from the engine folder:
    python examples/demo.py

Writes into examples/output/:
    scenarios.png          p10-p90 bands for revenue, profit, cash and customers
    summary.csv            the key numbers per scenario (table view of the chart)
    baseline_deterministic.csv   month-by-month central run, to rebuild in a spreadsheet
    results.json           full result, as the API would store it
"""
import csv
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from btm_engine import (Decision, METRICS, get_template, one_at_a_time,
                        run_deterministic, run_scenarios)

OUT = Path(__file__).parent / "output"
OUT.mkdir(exist_ok=True)

tpl = get_template("cafe")
base = tpl.default_baseline

scenarios = {
    "Price +10% (m3)": [Decision("price", 3, 10, "percent")],
    "Hire 1 barista (m6)": [Decision("hiring", 6, 1, "fte")],
    "Marketing 1,200/mo": [Decision("marketing", 1, 1200, "per_month")],
}

t0 = time.perf_counter()
res = run_scenarios(base, tpl, scenarios, horizon=24, iterations=1000, seed=42)
elapsed = time.perf_counter() - t0
print(f"1,000 runs x 24 months x {len(res.scenarios)} scenarios in {elapsed:.2f} s\n")

# ---- summary table (console + CSV) ----
cols = ["total_profit_p10", "total_profit_p50", "total_profit_p90", "end_cash_p50",
        "prob_cash_negative", "end_customers_p50", "prob_beats_baseline_profit"]
print(f"{'scenario':<22}" + "".join(f"{c:>28}" for c in cols))
with open(OUT / "summary.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["scenario"] + cols)
    for name, s in res.scenarios.items():
        vals = [s.summary.get(c, "") for c in cols]
        w.writerow([name] + vals)
        print(f"{name:<22}" + "".join(f"{v:>28,.2f}" if v != "" else f"{'-':>28}" for v in vals))

# ---- deterministic baseline for spreadsheet verification ----
det = run_deterministic(base, tpl, [], horizon=24)
with open(OUT / "baseline_deterministic.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["month"] + list(METRICS))
    for t in range(24):
        w.writerow([t + 1] + [round(float(det[m][t]), 4) for m in METRICS])

(OUT / "results.json").write_text(json.dumps(res.to_dict(), indent=1))

# ---- sensitivity (tornado data) ----
print("\nWhat matters most for 24-month profit under 'Price +10%' (±20% on each input):")
for r in one_at_a_time(base, tpl, scenarios["Price +10% (m3)"], horizon=24)[:5]:
    print(f"  {r['parameter']:<26} swing {r['swing']:>12,.0f}")

# ---- chart: 2x2 small multiples, median line + p10-p90 band ----
COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]   # validated categorical slots 1-4
panels = [("revenue", "Revenue per month"), ("profit", "Profit per month"),
          ("cash", "Cash balance"), ("customers", "Regular customers")]
months = np.arange(1, 25)
fig, axes = plt.subplots(2, 2, figsize=(12, 7.5), sharex=True)
for ax, (metric, title) in zip(axes.flat, panels):
    for color, (name, s) in zip(COLORS, res.scenarios.items()):
        b = s.bands[metric]
        ax.fill_between(months, b["p10"], b["p90"], color=color, alpha=0.12, linewidth=0)
        ax.plot(months, b["p50"], color=color, linewidth=2, label=name)
    ax.set_title(title, loc="left", fontsize=11, color="#222")
    ax.grid(axis="y", color="#e6e6e3", linewidth=0.8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color("#bbb")
    ax.tick_params(colors="#555", labelsize=9)
    ax.yaxis.set_major_formatter(matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:,.0f}"))
for ax in axes[1]:
    ax.set_xlabel("Month", color="#555")
handles, labels = axes[0, 0].get_legend_handles_labels()
fig.legend(handles, labels, loc="upper center", ncol=4, frameon=False, fontsize=10)
fig.text(0.5, 0.005, "Lines: median (p50) of 1,000 runs. Shaded: p10–p90 range. Same random draws for every scenario.",
         ha="center", fontsize=9, color="#555")
fig.tight_layout(rect=(0, 0.02, 1, 0.94))
fig.savefig(OUT / "scenarios.png", dpi=150)
print(f"\nSaved chart and tables to {OUT}")
