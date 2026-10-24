# Marketing assumptions: first audit

Run date: 2026-10-24. Engine 0.1.0, source baseline b0d6027, Python 3.12. This is a diagnostic using made-up sample businesses. No owner data was used, no live campaign was tested, and these results do not establish real-world accuracy.

## The question

Why does the example cafe make higher marketing spending look so successful? We first measure the current behavior instead of selecting new default numbers without evidence.

## How to repeat it

From the project root (Python and NumPy required):

```powershell
python engine/scripts/audit_marketing.py > docs/analysis/marketing-audit-cafe.csv
```

The script runs locally without the backend, a database, network access or an AI provider. It prints CSV and does not overwrite files itself. The command above replaces the committed cafe results file. Other templates can be explored with `--industry restaurant` or `--industry bakery`; use a different output filename. `--iterations` changes the number of runs.

The committed [CSV](marketing-audit-cafe.csv) contains 108 rows: 6 monthly marketing budgets (200, 400, 800, 1,200, 2,000 and 4,000 dollars), 2 time spans (12 and 24 months), 3 seeds (7, 42, 2026), and 3 assumption cases. Each comparison uses 2,000 runs and pairs the changed and unchanged business on the same random draws. Seeds are kept separate, not pooled into an accuracy score. The unchanged budget is an accounting control.

The profit bands in this CSV are percentiles of the **paired total profit difference**. They are not the difference between two independently computed profit percentiles. A share of zero at the unchanged budget means no run was strictly better: all were ties.

## One example in plain language

The sample cafe currently spends $400 a month. Changing the total budget to $1,200 adds $800 a month, or $19,200 over 24 months. This decision means $1,200 total, not $1,200 on top of today's budget.

For seed 42 and 2,000 runs:

| Assumption case | Middle profit change over 24 months | Share of simulated runs beating that case's unchanged business |
| --- | ---: | ---: |
| Current defaults | +$35,104.40 | 100% |
| No extra customer response to marketing | -$19,200.00 | 0% |
| Starting demand already fills modeled capacity | -$5,592.09 | 9.45% |

These shares describe this simulation, not a measured chance of success for a real cafe. All three seeds give 100% in the default case; the at-capacity shares range from 9.2% to 11.2%.

The two stress cases are **separate hypothetical experiments**, not additional calibrated predictions:

- **No extra response:** set only `marketing_curvature` to `(0, 0)`. This makes awareness independent of marketing spending while preserving the starting steady state. More marketing then costs money without acquiring extra customers. This does not estimate how often real campaigns fail.
- **At capacity:** change only starting staff from 5 to `7900 / 1800` (about 4.389 full-time equivalents). Starting expected visits then equal modeled staff capacity. The fractional staff figure represents combined hours, not a claim about a real cafe. Both the changed and unchanged business use that same staffing level. Monthly demand still fluctuates, so this is not a hard limit of zero spare capacity in every future month. Lower staffing also changes labor costs, service dynamics and subsequent churn; it is a capacity stress case, not an isolated empirical estimate of capacity's causal effect.

## Where the optimism comes from

The code makes this chain:

1. More spending raises modeled awareness, with diminishing returns (`model.py`, awareness update).
2. More awareness creates more new regular customers (`new = season * (n0 * awareness + word_of_mouth * quality * customers)`).
3. Those regulars make repeat visits in later months, until capacity or churn limits growth.
4. Sales from those visits can exceed the additional marketing cost.

The current sampled marketing curvature is always positive (0.3 to 0.7). The Monte Carlo draws vary the strength of that mechanism but do not include a distinct ineffective-campaign state. The model has no competitor response, targeting quality, or campaign fatigue mechanism. Word of mouth and marketing response remain uncalibrated assumptions. Noise varies visits; it does not independently test whether the marketing mechanism is correct.

Because awareness is updated at month end, a marketing decision in month 1 first changes awareness available to acquisition in month 2, and the resulting customer stock first affects visits in month 3. Spending starts immediately. This lag should be checked against actual campaigns rather than silently changed.

This audit identifies sensitivity to assumptions. It does **not** prove the positive default outcome is impossible, nor establish a better numerical range.

## What changes now

- Add this repeatable diagnostic and save its raw results.
- Keep engine equations, default marketing ranges and app behavior unchanged pending evidence.
- Treat “100% of simulated runs” as conditional on model assumptions; do not describe it as certain business success.

## Next evidence to collect

With a willing cafe owner's permission, collect non-identifying monthly figures: marketing spend and campaign dates, visits, average spend per visit, opening days, staff hours/capacity, and ingredient and operating costs. Record concurrent price changes, holidays, promotions and closures. Historical before/after differences alone cannot establish the effect of marketing.

Then define a proposed parameter range using a training period, reserve later months to check it, and compare against a simple unchanged-business benchmark. Check profit errors and whether the displayed ranges contain outcomes, as well as whether the model reproduces campaign timing. A single cafe is a pilot, not validation for restaurants and bakeries. A zero-response assumption can remain a stress case until evidence supports how frequently it should occur.

## Verification

- Engine: 358 tests passed, including two audit controls (paired no-response accounting; repeatability without changing registered templates).
- The unchanged $400 budget produces zero paired profit difference in all three cases.
- With no extra response, each run loses exactly the extra marketing spend (within the CSV's two-decimal rounding).
- The cafe CSV was generated twice and compared byte for byte.
- No frontend or backend behavior changed; their suites were not re-run for this diagnostic.
