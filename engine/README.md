# Business Time Machine: simulation engine (small food-service businesses)

A standalone Python library that projects a small food-service business's customers, revenue, profit and cash month by month and compares decisions under uncertainty. Three industries ship today -- café, restaurant, bakery -- sharing one model with per-industry defaults and wording. It has no web dependencies, so it can be tested and validated on its own. That validation becomes a thesis chapter.

The LLM layer never computes numbers. It only produces `Decision` objects, and every number comes from this engine.

## Quick start (Windows, PowerShell)

```powershell
cd $HOME\projects\business-time-machine\engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m pytest            # 29 tests: levels 1-3 of the validation plan, plus per-template checks
python examples\demo.py     # writes a chart and CSVs into examples\output
```

## Using it

```python
from btm_engine import Decision, get_template, run_scenarios

tpl = get_template("bakery")        # or "cafe" / "restaurant" -- industry assumptions
base = tpl.default_baseline         # that industry's typical starting numbers
# base = replace(base, customers=650, avg_ticket=6.0)   # or the owner's own numbers

res = run_scenarios(base, tpl, {
    "Price +10% in March": [Decision("price", 3, 10, "percent")],
    "Hire 1 baker in June": [Decision("hiring", 6, 1, "fte")],
}, horizon=24, iterations=1000, seed=42)

res.scenarios["Price +10% in March"].summary   # KPIs and risk flags
res.scenarios["Price +10% in March"].bands     # p10 / p50 / p90 per metric per month
res.to_dict()                                  # JSON for the API and the database
```

## Industries

`btm_engine/templates/` holds one module per industry, each defining a single
`TEMPLATE = IndustryTemplate(...)`. `get_template(id)` and `list_industries()`
(in `btm_engine/templates/__init__.py`) are the registry the backend and any new
industry module plug into -- adding a fourth industry is one new module plus one
line in that registry.

| Industry | `id` | Customer noun | Capacity label | Notes |
| --- | --- | --- | --- | --- |
| Café | `cafe` | regulars | visits per staff member per month | Original, literature-sourced template; unchanged by multi-industry support |
| Restaurant | `restaurant` | guests | covers per staff member per month | Defaults given as "typical small restaurant" figures; walk-ins raised from a given 900 to 1,400 so the baseline clears a plausible margin (see `templates/restaurant.py`) |
| Bakery | `bakery` | customers | units of baking output per staff member per month | Adds non-zero `waste_rate`; fixed costs raised from a given 9,000 to 12,000 for the same reason (see `templates/bakery.py`) |

Every restaurant/bakery number that isn't café's literature-sourced figure is a
plain assumption, marked inline in its template module -- most are reused from
café's uncertainty ranges pending real calibration.

## Files

| File | What it does |
| --- | --- |
| `btm_engine/params.py` | `BusinessBaseline` (owner inputs) and `IndustryTemplate` (industry wording, defaults, and uncertainty ranges) |
| `btm_engine/templates/` | One `IndustryTemplate` per industry (`cafe.py`, `restaurant.py`, `bakery.py`) plus the `get_template`/`list_industries` registry |
| `btm_engine/decisions.py` | The six decision types, `build_timeline`, and `DECISIONS_JSON_SCHEMA` for the LLM's structured output |
| `btm_engine/model.py` | The monthly equations, vectorised over Monte Carlo runs, plus the steady-state calibration |
| `btm_engine/montecarlo.py` | Latin hypercube sampling, common random numbers, percentile bands, risk flags |
| `btm_engine/sensitivity.py` | One-at-a-time ±20% sensitivity analysis (tornado chart data) |
| `tests/test_engine.py` | Verification, extreme-condition and behaviour tests (café) |
| `tests/test_templates.py` | Per-industry checks: steady-state margin, price direction, long-run elasticity, waste |
| `examples/demo.py` | Baseline and three scenarios, chart, summary CSV, deterministic CSV for the spreadsheet cross-check |

## Design choices worth defending

- **Steady-state calibration.** For each run, `n0` and `α` are set so the business with no decisions stays where the owner says it is today. Any change in a scenario comes from the decision, not from the model drifting on its own -- checked per industry in `tests/test_templates.py`.
- **No double counting of price.** The literature elasticity ε (−0.81, Andreyeva et al. 2010) is split into a short-run share φ, which acts on visit frequency, and a long-run share, which acts through churn (η = −ε(1−φ)). New-customer acquisition does not depend on price. A test checks that the long-run elasticity of visits comes back to ≈ ε.
- **Common random numbers.** Every scenario runs on the same 1,000 draws, so "P(beats baseline)" compares like with like.
- **Reproducible runs.** `engine_version` and `seed` are part of every result.
- **Speed.** 1,000 runs × 24 months × 4 scenarios take about 0.1 s, so the API can run the engine inline. A task queue isn't needed for version 1.

## Known limitations (to calibrate next)

- Marketing response (α, γ) and word of mouth (β) are not yet sourced, and are currently reused unchanged across all three industries. In the café demo, 1,200 a month on marketing beats the baseline in 100% of runs, which is probably too optimistic. These parameters need calibration against real data or owner interviews, per industry.
- Restaurant and bakery defaults are typical-small-business estimates, not sourced data -- see the TODO comments in `templates/restaurant.py` and `templates/bakery.py`. Bakery's `waste_rate` in particular is a guess pending real numbers.
- Capacity is a hard cap (κ visits/covers/output units per staff member per month). Queues and lost sales at peak hours are not modelled.
- Seasonality defaults to flat. Pass `IndustryTemplate(seasonality=(...12 values...))` to add it.
