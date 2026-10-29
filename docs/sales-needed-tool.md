# How much do I need to sell?

The Tools route `/tools` is a standalone entered-cost calculator. It does not simulate demand or change a business, scenario, journal entry or saved plan. The only business metadata it loads is the name and currency. Inputs are blank and remain in component memory only; leaving the page or changing business/currency starts over.

## Calculation contract

`engine/btm_engine/sales_needed.py` owns all financial calculations. The backend bridge exposes it through read-only `POST /tools/sales_needed`, without a database dependency or an AI provider. JSON amounts and targets are decimal strings so large counts do not lose precision in JavaScript.

- Required non-negative amounts: `selling_price`, `cost_per_sale`, `monthly_costs`. Blank is not zero. Accept up to 12 digits before the decimal and six after, with a decimal point and optional correctly grouped thousands commas. Reject negative, non-finite, exponent and malformed amounts.
- Optional `opening_days`: blank, or a whole number from 1 to 31.
- Amounts use integer millionths. Contribution per sale = selling price − cost per sale. For positive contribution, monthly sales = ceiling(monthly costs / contribution). A count of zero is valid when monthly costs are explicitly zero.
- Daily average = the rounded monthly count / opening days, rounded upward to two decimals. Label it as an average target, not a whole-sale daily quota.
- With zero or negative contribution, return `no_margin` with no target, daily figure, revenue or chart share. The explanation distinguishes equal costs, a loss per sale and explicitly zero monthly costs. Never display infinity.
- The breakdown illustrates one sale: its per-sale costs and the amount left for monthly costs. Gross monthly income, shown only in details, is the rounded target × selling price; it is not profit.
- Currency formatting preserves entered/calculated precision through six decimals, including small contributions, and uses the selected currency's usual minimum decimals. Counts use exact integer formatting. No currency conversion occurs.

## Owner-facing limits

Break-even means “selling enough to cover these costs.” Every result keeps the single item, appointment, job or representative-sale assumption visible. Different products may have different prices and costs. Examples span several business activities. Costs are counted once; recurring pay should not also be included per sale. Owners must check omitted costs, tax basis, refunds, owner pay, debt payments and whether the sales target can be reached. Covering entered costs is not a guarantee of overall profitability.

The result can be edited without losing entries. A pending or failed request does not show an old result; business/currency changes abort old requests. A selected business offers an optional Try an idea link; guests can choose setup. No amounts are transferred or decisions confirmed.

## Verification

Engine tests cover exact decimal and large-count arithmetic, upward rounding, zero and non-positive contribution, and malformed/boundary inputs. Backend tests check the API contract, validation and absence of database access. Frontend tests cover currency precision, every guided step, editing, failure/retry, late responses, business changes, real navigation and automated accessibility. Desktop and a 390px iframe layout were reviewed against the running local API. The iframe is a temporary review aid and is not shipped. Existing simulator, saved data and PDF export are unchanged.
