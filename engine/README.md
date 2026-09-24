# Business Time Machine: simulation engine (café template)

A standalone Python library that projects one café's customers, revenue, profit and cash month by month and compares decisions under uncertainty. It has no web dependencies, so it can be tested and validated on its own. That validation becomes a thesis chapter.

The LLM layer never computes numbers. It only produces `Decision` objects, and every number comes from this engine.

## Quick start (Windows, PowerShell)

```powershell
cd $HOME\projects\business-time-machine\engine
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m pytest            # 19 tests, all levels 1-3 of the validation plan
python examples\demo.py     # writes a chart and CSVs into examples\output
```

## Using it

```python
from btm_engine import CafeBaseline, CafeTemplate, Decision, run_scenarios

base = CafeBaseline(customers=900, avg_ticket=6.5, cash=25_000)   # the owner's numbers
tpl = CafeTemplate()                                              # industry assumptions

res = run_scenarios(base, tpl, {
    "Price +10% in March": [Decision("price", 3, 10, "percent")],
    "Hire 1 barista in June": [Decision("hiring", 6, 1, "fte")],
}, horizon=24, iterations=1000, seed=42)

res.scenarios["Price +10% in March"].summary   # KPIs and risk flags
res.scenarios["Price +10% in March"].bands     # p10 / p50 / p90 per metric per month
res.to_dict()                                  # JSON for the API and the database
```

## Files

| File | What it does |
| --- | --- |
| `btm_engine/params.py` | `CafeBaseline` (owner inputs) and `CafeTemplate` (industry assumptions and uncertainty ranges) |
| `btm_engine/decisions.py` | The six decision types, `build_timeline`, and `DECISIONS_JSON_SCHEMA` for the LLM's structured output |
| `btm_engine/model.py` | The monthly equations, vectorised over Monte Carlo runs, plus the steady-state calibration |
| `btm_engine/montecarlo.py` | Latin hypercube sampling, common random numbers, percentile bands, risk flags |
| `btm_engine/sensitivity.py` | One-at-a-time ±20% sensitivity analysis (tornado chart data) |
| `tests/test_engine.py` | Verification, extreme-condition and behaviour tests |
| `examples/demo.py` | Baseline and three scenarios, chart, summary CSV, deterministic CSV for the spreadsheet cross-check |

## Design choices worth defending

- **Steady-state calibration.** For each run, `n0` and `α` are set so the café with no decisions stays where the owner says it is today. Any change in a scenario comes from the decision, not from the model drifting on its own.
- **No double counting of price.** The literature elasticity ε (−0.81, Andreyeva et al. 2010) is split into a short-run share φ, which acts on visit frequency, and a long-run share, which acts through churn (η = −ε(1−φ)). New-customer acquisition does not depend on price. A test checks that the long-run elasticity of visits comes back to ≈ ε.
- **Common random numbers.** Every scenario runs on the same 1,000 draws, so "P(beats baseline)" compares like with like.
- **Reproducible runs.** `engine_version` and `seed` are part of every result.
- **Speed.** 1,000 runs × 24 months × 4 scenarios take about 0.1 s, so the API can run the engine inline. A task queue isn't needed for version 1.

## Known limitations (to calibrate next)

- Marketing response (α, γ) and word of mouth (β) are not yet sourced. In the demo, 1,200 a month on marketing beats the baseline in 100% of runs, which is probably too optimistic. These parameters need calibration against real data or owner interviews.
- Capacity is a hard cap (κ visits per FTE per month). Queues and lost sales at peak hours are not modelled.
- Seasonality defaults to flat. Pass `CafeTemplate(seasonality=(...12 values...))` to add it.
