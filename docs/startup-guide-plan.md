# "I don't have a business yet": start-up guide (plan)

Status: **approved 2026-10-10. Stage A built (data file, calculator, backend); Stage B (frontend) not built yet.** Decisions: US full / UK and China "bring your own numbers" / elsewhere checklist-only; vendor guides only if opened, named as selling to restaurants; every assumption shown; no blocked page used; country only; no AI on the plan page in v1; banner text "This is a starting picture. It assumes your business is open and running smoothly." Written 2026-10-10 after reading `CLAUDE.md`, the start page
(`pages/Start/StartPage.tsx`, `Landing.tsx`), `engine/btm_engine/quickstart.py`, `backend/app/routers/industries.py`
and `businesses.py`, and after doing the source research described in section 5 (every URL marked "read" was opened
and read on **2026-10-10**; the ones marked "blocked" refused an automated read and must be checked by a person).

What this adds: someone with no business yet answers nine short questions and gets (1) a rough start-up plan for a
café, restaurant or bakery with **ranges**, (2) a "where to find it" checklist, (3) a plain list of what first-year
owners usually struggle with, and (4) a button that turns the answers into a ready-made business in the simulator.

It is a **planning aid, not advice and not a forecast**, and the plan is built so that it says so on every screen.

---

## 0. The honest summary (read this first)

The research changed what is possible. Three facts shape the whole design:

1. **There is no official or audited source for start-up cost totals** in any country I looked at. Every start-up
   cost range I found is from a **business that sells something to restaurants** (a till/POS company, a
   company-formation service) or a lender. They disagree with each other by a factor of three or more. I can use them
   only as **wide, clearly labelled "published guides say" ranges**, never as facts.
2. **There are good official sources for the rules and for pay.** Wages (US Bureau of Labor Statistics, UK GOV.UK,
   China's National Bureau of Statistics), the food-business registration rules (GOV.UK / Food Standards Agency, China's
   State Administration for Market Regulation, the US Small Business Administration) and US restaurant cost shares
   (National Restaurant Association survey, 900+ operators). These are real numbers with real sources.
3. **Only the United States has enough sourced numbers for a full cost picture.** The UK and China have official
   facts and wages but no start-up cost totals and no cost shares I could source. So those two get a different mode
   ("bring your own numbers", section 4.6) instead of invented figures.

So the product is honest by construction: **sourced numbers where they exist, the person's own numbers where they
don't, and a plain "we can't do this, ask X" everywhere else.**

---

## 1. Where it fits in the app

**Entry point.** On the start page (`/`), directly under the hero button "Start your journey", a second, quieter
pill button: **"I don't have a business yet"**. It also appears as a slim card above the business-type picker (the
working form), so it is one click from either place. Returning visitors who have a business open still see the
"Continue with ..." pill first; the new button sits below it. No change to the top bar.

**Routes** (all inside `AppLayout`, so the Back button comes for free):

| Route | What it is |
|---|---|
| `/guide` | The nine questions, one per screen, inside one page (step kept in the page, with its own "Previous" button) |
| `/guide/plan/:id` | The plan page (summary, budget, checklist, struggles, try-it) |

**Back behaviour.** `lib/backTarget.ts` gets two lines: the parent of `/guide` is `/` (the start page) and the parent of
`/guide/plan/:id` is `/guide`. (Today everything else falls back to `/today`, which needs a business, so this must be
added.) With an earlier in-app page, "← Back" still does `navigate(-1)`. Inside the question screens, the page's own
"Previous" button moves one question back without leaving the page. Nothing else about Back changes.

**No business is needed to use the guide.** The top-bar links Today / Try a change / My journal behave as they do now
when no business is open (they lead to the start page). The guide never reads or writes any existing business.

**Print.** The plan page has "Print or save as PDF" (browser print, nothing sent anywhere), with the same
plain black-on-white print rule as the Share page (`@media print` stays last in `redesign.css`).

---

## 2. The questions (nine screens, plain language, existing start-form look)

Each screen: a big question, a short "why we ask" line, the answer (cards or one field), "Previous" / "Next". Number
fields use `NumberField` (can be empty while typing, validated only on Next, never forces a 0). Every question can be
answered "I'm not sure" where it makes sense; unsure answers lead to wider ranges or to "ask a local supplier".

| # | Question | Options / field | Used for |
|---|---|---|---|
| 1 | **What would you like to open?** | Café, Restaurant, Bakery (the three photo cards) | Which data rows and template |
| 2 | **Which country will you open in?** | United States, United Kingdom, China, "Somewhere else". Shows the currency (USD / GBP / CNY / the existing currency picker) | Which data set, currency, which official pointers. Only the country is asked, **not the city**: we have no city-level data, and it is one less personal detail |
| 3 | **How much money can you put in?** | Amount in the currency, or "I'm not sure yet" | Compared with the plan: "enough / tight / not enough" |
| 4 | **Will you rent, own, or start smaller?** | "Rent a ready-to-use shop" · "Rent an empty space and fit it out" · "I already own the place" · "Start with a stall, cart, kiosk or home kitchen first". If renting: "About how much rent a month? (leave empty if you don't know)" | Which line items apply (fit-out or not), rent |
| 5 | **How big?** | Tiny (stall / cart / kiosk / home kitchen) · Small (takeaway counter, up to about 20 seats) · Medium (about 20 to 50 seats) · Large (over 50 seats) | Which cost format row, seats in the simulator |
| 6 | **What will you serve?** | Menu: "A short, simple menu" / "A full menu with a kitchen". Alcohol: "Yes" / "No" / "Not sure" | Equipment and licence items, checklist wording |
| 7 | **How many people will work there?** | Number, "count yourself as one, and two part-timers as one" (the same rule as the simulator) | Wage bill, simulator staff |
| 8 | **On a normal day, how many customers do you hope for, and what will one spend?** | Two numbers, each with "I'm not sure". If unsure about customers, the plan shows the number you would need to break even | Sales, break-even |
| 9 | **When do you hope to open?** | "Within 3 months" · "In 3 to 6 months" · "In 6 to 12 months" · "Just exploring" | Checklist order and urgency wording only; never any cost |

Notes: question 8 is the only place we ask for numbers we cannot source, and that is deliberate: **sales are the
owner's own guess, shown as theirs.** Nothing is pre-filled with an invented "typical" figure.

---

## 3. Data model

### 3.1 The data file (the single place numbers come from)

`engine/btm_engine/data/startup_ranges.json` (inside the engine package so it ships with it and the engine stays
standalone; you suggested `engine/data/`, this is the same file one level down so `importlib.resources` can find it;
`pyproject.toml` needs a package-data line, to be confirmed at build time).

Every row:

```json
{
  "id": "cafe-us-buildout",
  "group": "startup_cost",            // startup_cost | wage | cost_share | fee | rule | contingency | pointer
  "kind": "fact",                      // fact (needs a source) | assumption (our named choice, shown to the user)
  "country": "US",
  "business_types": ["cafe"],
  "applies_when": {"premises": ["fit_out"]},   // optional: which answers switch this row on
  "label": "Build-out / renovations",
  "low": 30000, "high": 150000,        // numbers only when sourced; otherwise the row has no numbers
  "unit": "one_off",                   // one_off | per_month | per_hour | percent_of_sales | per_year
  "currency": "USD",
  "source_name": "KORONA POS, 'How Much Does It Cost to Open a Coffee Shop in 2026?'",
  "source_type": "vendor_guide",       // government | statistics_office | trade_association | vendor_guide
  "source_url": "https://koronapos.com/blog/how-much-does-it-cost-to-open-a-coffee-shop/",
  "published": "2026-02-02",
  "accessed": "2026-10-10",
  "status": "verified",                // verified (read by a person or by me) | needs_hand_check
  "confidence": "B",                   // A official/association survey, B published vendor guide, C none
  "note": "Written by a POS vendor; treat as a planning range, not a standard."
}
```

Validated by a test (section 8): every `fact` row with a number has `source_name`, an `https` `source_url`, `accessed`
(a real past date), `source_type`, `confidence`, `low <= high`, a known `unit`/`currency`; every `assumption` row has a
`rationale` and no `source_url`; **rows with `status: needs_hand_check` are ignored by the calculator** (so a number
nobody has read cannot reach a user).

A second small file, `link_status.json`, records `last_checked` and the result for every URL, written by the link-check
script (section 3.4). The data file itself is never edited by a script.

### 3.2 Database

**One new table, `startup_plans`** (Alembic migration, tested up/down/up on a copy, like the journal migration):

| Column | Meaning |
|---|---|
| `id` | |
| `answers` (JSON) | the nine answers (categories and numbers only; **no free text anywhere**) |
| `country`, `business_type`, `currency` | copied out for listing |
| `data_version` | version of `startup_ranges.json` used, so an old plan can say "worked out with data dated ..." |
| `engine_version` | for reproducibility (golden rule 4) |
| `business_id` (nullable, FK) | set when "Try it in the simulator" is used |
| `created_at`, `deleted_at` | soft delete with Undo, like everything else |

The **plan itself is not stored**: it is recomputed on demand from `answers` + the data version in a few
milliseconds (plain arithmetic), so a number can never go stale or disagree with the data file. If the data file
changes later, the page says "Worked out with data dated 2026-10-10; newer data exists. Recalculate?" (a button).

`app/purge.py` and `lookup.py` learn the new table (a deleted plan is a 404; purge removes old deleted ones).
`businesses.setup_source` gets a fourth allowed value, `guide`.

### 3.3 "Try it in the simulator": answers to business fields

It uses the **existing** start flow: the frontend calls `POST /industries/{id}/quick_baseline` with the four
quick answers, then `createQuickBusiness` (no new business endpoint). The mapping, all by plain code on the backend
(`POST /guide/plans/{id}/simulator_answers` returns the ready values; the frontend never does the math):

| Simulator field | Comes from |
|---|---|
| customers per day | answer 8 (or, if "not sure", the **break-even** number, labelled as such) |
| average spend | answer 8 (if "not sure": the plan asks for a number before this button works; we never invent one) |
| monthly rent | answer 4 (if empty: asks) |
| people who work there | answer 7 |
| `wage_per_fte` | **override**: sourced median hourly wage x 173.33 hours (see 4.2), instead of the template's US-dollar 3,000 |
| `cogs_ratio` | **override** (US only): the sourced National Restaurant Association median |
| `cash` | **override**: budget minus the "likely" start-up cost, never below 0, with a warning if the budget does not cover it |
| `seats` | the size answer's mid-point (the person's own choice) |
| everything else | the industry template, exactly as today |

`assumed_fields` is rewritten for the overridden fields so "What we assumed" says where each came from
("median pay for cooks, US Bureau of Labor Statistics, May 2025 ..."). `setup_source = "guide"`. The business is
named "My future café (plan)" (editable) and flagged `is_sample = false`.

**The honesty caveat that must be on screen.** The simulator shows a business **as if it were already trading at
a normal level**. It does not model a slow opening, building up regulars, or the start-up spending. So on Today for a
`guide` business there is one quiet banner: *"This shows your future business as if it were already open and trading
normally. A real opening is usually slower. It is a way to try changes on paper, not a forecast of your first months."*

---

## 4. The calculator (plain words, then a worked example)

All arithmetic is in a new pure engine module, `engine/btm_engine/startup.py`: no randomness, no AI, no web code. It
reads rows from the data file; the backend only calls it (through `engine_bridge.py`, the only engine import point).

### 4.1 Start-up cost range

For the chosen country, business type and answers 4 to 6, take every `startup_cost` row whose `applies_when`
matches (for example *build-out* only if the person chose "rent an empty space and fit it out"; *alcohol licence* only
if they said yes to alcohol).

- **Low** = sum of the rows' `low`. **High** = sum of the rows' `high`.
- **Middle** = (low + high) / 2, shown as "the middle of the range, not a prediction". There is **no "likely"
  claim** beyond that: when sources disagree by this much, "likely" would be invented precision.
- Rows with only one source are tagged "one guide only" in the table.
- If a country has no start-up rows: the section says "We couldn't find a reliable published figure for <country>.
  Ask two or three local suppliers and agents; the checklist below tells you which." and no total is shown.
- The person sees **every line** (label, low to high, source), never just a total.

### 4.2 Monthly running costs

Four lines, each with low / middle / high:

1. **Ingredients** = sales x ingredient share. US: the National Restaurant Association medians (full service 32.0%,
   limited service 32.4% of sales, 2024 data). No sourced share exists for other countries, so there the person
   enters their own (default empty).
2. **People** = people x hourly wage x 173.33 hours a month (40 hours x 52 weeks / 12; this is an **assumption row**,
   shown). Wages: US BLS medians (cooks $17.62, food and beverage serving workers $15.24, May 2025), UK the legal
   National Living Wage (£12.71 from 1 April 2026, a **minimum**, not typical pay, said on screen), China the
   National Bureau of Statistics 2024 average for accommodation and catering (54,042 yuan a year for private urban
   units, 60,240 for non-private; divided by 12). Employer taxes and benefits are **not included** (no source), said
   on screen. As a sanity check the page shows people cost as a share of sales next to the NRA medians (limited
   service 31.7%, full service 36.5%, and the profitable-versus-loss-making spread).
3. **Rent and other fixed bills** = the person's rent + one third of it for utilities, insurance and other bills
   (the same rough rule the simulator already uses and discloses; an **assumption row**). In the US, if the person
   did not know their rent, the vendor-guide monthly rent range (cafés $2,000 to $12,000 a month, one guide) is shown
   as a "guides say" range and flagged.
4. **Marketing** = the simulator template's marketing share of sales (an existing, disclosed assumption).

Low uses the low end of each row, high uses the high end. Where a source gives only a median (no spread) the range
is **not widened silently**: it is shown as that one number, tagged "median, no published spread".

### 4.3 Break-even

The Small Business Administration's own formula (read on its page): *Fixed costs / (Price - Variable costs)*, plus "a
little extra, say 10%". In our words, per month:

```
fixed costs        = people + rent and other fixed bills + marketing
each customer adds = average spend x (1 - ingredient share)
customers needed   = fixed costs / each customer adds           (a month)
per day            = customers needed / days open a month        (28, the simulator's value)
with a 10% cushion = per day x 1.10
```

Shown as "about N customers a day (N with a 10% cushion)", and compared with the person's own hope from question 8
("you hoped for 120; you would need about 112 to cover your costs: close, so small changes matter").
People are treated as a fixed cost (you pay them whether it is busy or not), which is also how the simulator works.

### 4.4 Buffer and suggested starting budget

```
contingency   = 10% to 20% of the start-up cost       (10%: SBA; 20%: SCORE guide, see section 5, hand-check)
cash buffer   = 3 to 6 months of running costs        (our assumption row, shown; ask an accountant)
suggested     = start-up cost + contingency + cash buffer          (low / middle / high)
```

Compared with the person's budget (question 3): **"Enough"** if budget >= the suggested middle, **"Tight"** if between
the suggested low and middle, **"Not enough yet"** below the low, **"Not sure"** if they did not answer. Wording is
always about the plan ("your plan"), never "you will".

### 4.5 Worked example (real numbers from the real data and the real engine)

Setting: United States, a small sit-in **café** renting an empty space to fit out, a simple menu, no alcohol, **3
people**, **120 customers a day** hoped for at **$7** each, rent **$4,000** a month. (Rows used: KORONA café line items;
BLS pay; NRA food share. I ran the engine's own monthly summary on these inputs to check the arithmetic.)

| Step | Working | Result |
|---|---|---|
| Sales | 120 x 28 days x $7 | **$23,520** a month |
| Ingredients | 32.4% of sales (NRA, limited service) | $7,620 |
| People | 3 x $15.24 an hour x 173.33 hours | $7,925 |
| Rent and other bills | $4,000 + one third | $5,333 |
| Marketing | simulator template share | $183 |
| **Running costs** | | **$21,062** a month |
| **Left over** | $23,520 - $21,062 | **$2,458** a month (about 10% of sales) |
| People as a share of sales | 7,925 / 23,520 | 33.7% (the NRA limited-service range is 30.0% to 34.1%) |
| Break-even | fixed 13,441 / ($7 x 0.676) = 2,840 customers a month | **about 101 a day, 112 with the 10% cushion** |
| Start-up cost (guide lines, fit-out case) | build-out 30,000 to 150,000; equipment 15,000 to 40,000; licences 500 to 5,000; first stock 5,000 to 15,000; marketing and branding 2,000 to 10,000; till 1,000 to 5,000; hiring and training 10,000 to 25,000 | **$63,500 to $250,000** (middle $156,750) |
| Contingency 10% to 20% | on the low / high | +$6,350 / +$50,000 |
| Cash buffer 3 to 6 months | 3 x 21,062 / 6 x 21,062 | $63,186 / $126,372 |
| **Suggested starting budget** | | **about $133,000 to $426,000** |

That range is wide on purpose. The page says why: *"Published guides disagree a lot, and the two biggest unknowns,
building work and rent, depend on your street."* (The same guide states $80,000 to $275,000 for a whole seated shop,
so the bottom-up sum is consistent with it.)

### 4.6 "Bring your own numbers" mode (UK, China, anywhere else)

Where the data file has no start-up or cost-share rows for a country, the calculator does **only the arithmetic**: the
person types rent, their ingredient share (a guess is fine, with a hint "ask a supplier what the ingredients for your
best-seller cost"), their average spend and customers; we add sourced pay and the sourced official facts, and apply the
same formulas (people, break-even, buffer in months of *their* running costs). Start-up total shows "ask local
suppliers" with the checklist. Nothing is invented; the numbers on screen are visibly the person's.

---

## 5. The research (done now): sources, draft data table, and what I could not find

### 5.1 Method and rules I applied

- Each URL below was opened and its content read on **2026-10-10**, unless marked **blocked** (the site refuses automated
  reading with "403 Forbidden"; the figure appeared only in a search-engine summary, so it is **not** trusted yet) or
  **pending** (found, not yet read).
- "Source type" matters: **A** = government, statistics office or a trade association's own survey; **B** = a
  published guide written by a company that sells to this industry (disclosed, wide ranges, cross-checked); **C** =
  nothing reliable found, so **no number**.
- I did not use any figure from a page I could not open. I did not invent a supplier, a URL or a statistic.

### 5.2 Countries I can source properly

| Country | What we can ship | What we cannot |
|---|---|---|
| **United States** (default; USD) | Wages (BLS), cost shares (NRA), checklist rules (SBA, FDA Food Code), start-up cost ranges from published vendor guides (café and bakery read; **restaurant not yet readable**, see below) | Rent (the guides give one range; local), insurance, utilities, alcohol-permit costs (vary by state) |
| **United Kingdom** (GBP) | Registration rule (free, 28 days before trading), pay floor, sole-trader vs company, alcohol-licence fee bands once re-checked | Start-up cost totals, cost shares (only vendor/lender blogs, all blocked or unreadable), rent |
| **China** (CNY) | The licensing rule (SAMR Order No. 78), average pay for accommodation and catering (NBS) | Start-up costs, rent, cost shares: the Chinese industry reports I found were either paywalled or of unclear origin ("public data compiled by a research website"), so I did not use them |
| **Anywhere else** | The checklist and the question flow, with "we have no sourced figures for your country" | All numbers |

Because you are in China and also want a sensible English default: the app's existing defaults are US-based, so the
**English default is the United States**; the **UK** is the second English-speaking option (facts and pay only);
**China is supported in "bring your own numbers" mode** with Chinese official names (and English glosses) for the
licence pointers. Adding Canada, Australia, Ireland or Singapore later is one block of rows each, if sourced.

### 5.3 Draft data table (first draft, ready to become `startup_ranges.json`)

Accessed date for every row: **2026-10-10**. "Read" = I opened it and quoted the numbers myself.

**Pay and cost shares (type A, official)**

| ID | Value | Unit | Country | Source | URL | Status |
|---|---|---|---|---|---|---|
| wage-us-cook | median **$17.62** (restaurant cooks $17.98; short-order $17.25; fast-food cooks $14.85) | per hour, May 2025 | US | US Bureau of Labor Statistics, Occupational Outlook Handbook: Cooks | https://www.bls.gov/ooh/food-preparation-and-serving/cooks.htm | read |
| wage-us-serving | median **$15.24** (annual $31,710; fast-food and counter workers $15.00) | per hour, May 2025 | US | BLS OOH: Food and Beverage Serving and Related Workers | https://www.bls.gov/ooh/food-preparation-and-serving/food-and-beverage-serving-and-related-workers.htm | read |
| wage-uk-nlw | **£12.71** (21+), £10.85 (18 to 20), £8.00 (under 18 and apprentices); from 1 April 2026 | per hour; **legal minimum** | UK | GOV.UK, National Minimum Wage and National Living Wage rates | https://www.gov.uk/national-minimum-wage-rates | read |
| wage-cn-private | **54,042** yuan a year, private urban units, accommodation and catering, 2024 (published 2025-05-16) | per year | CN | National Bureau of Statistics of China, 2024 average wage release, table 5 | https://www.stats.gov.cn/sj/zxfb/202505/t20250516_1959826.html | read |
| wage-cn-nonprivate | **60,240** yuan a year, non-private urban units, same industry, 2024 | per year | CN | same release, table 2 | same URL | read |
| share-us-food | median food and non-alcohol drink cost: **32.0%** full service, **32.4%** limited service (2024; 900+ operators; "not intended to represent standards or goals") | % of sales | US | National Restaurant Association, Restaurant Operations Data Abstract 2025, reported in its Economic Insights article of 2025-09-10 | https://restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/restaurant-operators-kept-food-cost-ratios-in-check-in-2024/ | read |
| share-us-labor | median pay and benefits: **36.5%** full service (profitable 34.2%, loss-making 42.9%); **31.7%** limited service (profitable 30.0%, loss-making 34.1%) | % of sales | US | NRA, Economic Insights article of 2025-10-08 | https://restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/elevated-labor-costs-had-a-significant-impact-on-restaurant-profitability-in-2024/ | read |
| share-us-food-volume | full service food cost 31.0% (sales of $2 million or more) and 33.7% (under $2 million) | % of sales | US | NRA, "higher volume restaurants reported lower food cost ratios in 2024" | https://restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/higher-volume-restaurants-reported-lower-food-cost-ratios-in-2024/ | pending (seen in a search summary only) |

**Start-up cost lines (type B, vendor guides; wide, labelled)**

| ID | Value | Unit | Country, type | Source | URL | Status |
|---|---|---|---|---|---|---|
| cafe-us-buildout | **$30,000 to $150,000** | one-off | US, café | KORONA POS, "How Much Does It Cost to Open a Coffee Shop in 2026?" (published 2026-02-02; vendor guide) | https://koronapos.com/blog/how-much-does-it-cost-to-open-a-coffee-shop/ | read |
| cafe-us-equipment | **$15,000 to $40,000** (espresso machine, grinders) | one-off | US, café | same | same | read |
| cafe-us-licences | **$500 to $5,000** | one-off | US, café | same | same | read |
| cafe-us-stock | **$5,000 to $15,000** | one-off | US, café | same | same | read |
| cafe-us-marketing | **$2,000 to $10,000** | one-off | US, café | same | same | read |
| cafe-us-pos | **$1,000 to $5,000** | one-off | US, café | same | same | read |
| cafe-us-hiring | **$10,000 to $25,000** (staff hiring and training) | one-off | US, café | same | same | read |
| cafe-us-rent | **$2,000 to $12,000** a month | per month | US, café | same | same | read |
| cafe-us-formats | seated shop $80,000 to $275,000; kiosk $50,000 to $100,000; cart or truck $25,000 to $85,000; overall "$60,000 to $400,000" | one-off | US, café | same | same | read (used only as a cross-check and for the "tiny" format) |
| bakery-us-storefront | permits $1,500 to $3,500; insurance $2,000; rent deposit $5,000 and $2,500 a month; construction $5,000 to $25,000+; equipment $20,000; first stock $5,500; staff $8,000 to $13,000; branding $4,000; advertising and website $9,000; **total $62,500 to $77,500** | one-off (rent monthly) | US, bakery with a shop | ZenBusiness Editorial Team, "Costs to start a bakery" (last updated 2026-09-02; company-formation service) | https://www.zenbusiness.com/cost-open-bakery | read; **single guide**, several single-value lines; its FAQ gives a lower permit range ($200 to $1,000) than its table, which we will show as a disagreement |
| bakery-us-home | **$15,500 to $23,500** (home), commercial unit **$71,700 to $102,700** | one-off | US, bakery | same | same | read |
| restaurant-us-total | "about $75,000 to $275,000", wider "$95,000 to over $2 million" | one-off | US, restaurant | Toast, KaTom, TheRestaurantHQ (all vendors) | https://pos.toasttab.com/blog/on-the-line/how-much-does-it-cost-to-open-a-restaurant ; https://www.katom.com/learning-center/cost-to-open-restaurant.html | **blocked**: both refused automated reading; figures seen only in a search summary. **Will not ship until a person reads them.** |
| cafe-us-toast, bakery-us-others | cross-check totals for café and bakery | | US | Toast café guide; Homebase; others | https://pos.toasttab.com/blog/on-the-line/how-much-does-it-cost-to-open-a-cafe | **blocked** (same) |

**Rules, fees and official facts (type A)**

| ID | Fact (as read) | Country | Source | URL | Status |
|---|---|---|---|---|---|
| rule-us-sba-startup | Costs are one-time or monthly; some (permits, licences) have published prices, others (salaries) must be estimated; **break-even = Fixed costs / (Price - Variable costs)**; "throw a little extra, say 10%" into the break-even analysis; the page gives **no dollar figures** | US | SBA, "Calculate your startup costs" | https://www.sba.gov/business-guide/plan-your-business/calculate-your-startup-costs | read |
| rule-us-sba-licences | Most small businesses need federal and state licences and permits; restaurants are regulated at state and local level; alcohol sales fall under federal alcohol permits and local alcohol boards; an EIN is free and "do not apply for an EIN on websites that charge a fee" | US | SBA, "Apply for licenses and permits" | https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits | read |
| rule-us-fda | The FDA Food Code is a **model** that states, tribes and local bodies adopt into their own rules; it is not itself the law that applies to you | US | FDA, Food Code | https://www.fda.gov/food/retail-food-protection/fda-food-code | read |
| help-us-sba | Free or low-cost counselling and mentoring through SBA partners (SBDCs, SCORE, Women's Business Centers, Veterans Business Outreach Centers) with a local search tool | US | SBA, local assistance | https://www.sba.gov/local-assistance | read |
| rule-uk-register | Register **at least 28 days before trading**; free; "can't be refused"; applies to **England, Northern Ireland and Wales** (not Scotland, which has its own body, Food Standards Scotland) | UK | GOV.UK, Starting a food business (the old food.gov.uk address redirects here) | https://www.gov.uk/guidance/starting-a-food-business | read (the Scotland sentence is the page's own scope line; the Food Standards Scotland name, and the idea that each premises registers with its own local council, come from council pages seen in search and need a hand check before use) |
| rule-uk-structure | Most register as a sole trader or a limited company; the choice affects tax and personal liability | UK | GOV.UK, Set up a business | https://www.gov.uk/set-up-business | read |
| fee-uk-alcohol | Premises-licence application fees by rateable-value band: **£100 (band A) to £635 (band E)**, up to **£1,905** for large premises mainly serving alcohol on site; annual **£70 to £1,050** | UK | GOV.UK, Alcohol licensing: main fee levels | https://www.gov.uk/government/publications/alcohol-licensing-fee-levels/main-fee-levels | **pending**: seen in a search summary which warned the table is old; read it and re-check before use |
| rule-cn-licence | 《食品经营许可和备案管理办法》 (State Administration for Market Regulation Order No. 78, signed 2023-06-15, **in force 2023-12-01**): food sales and **catering need a food business licence (食品经营许可)**; selling **only prepackaged food** needs a filing (备案) instead | CN | State Council Gazette 2023 no. 21 | https://www.gov.cn/gongbao/2023/issue_10606/202307/content_6894763.html | read |
| stat-us-survival | For private-sector US establishments **born in 2022, 74.4% to 78.6% (by region) were still open one year later**; all industries, **not food service** | US | US Bureau of Labor Statistics, The Economics Daily, 2024-03-04 | https://www.bls.gov/opub/ted/2024/1-year-survival-rates-for-new-business-establishments-by-year-and-location.htm | read; optional single sentence in "Struggles", clearly marked "all industries" |

**Assumption rows (our named choices; shown on screen; not facts)**

| ID | Choice | Why |
|---|---|---|
| hours-per-month | 173.33 (40 hours x 52 weeks / 12) | Turns an hourly wage into a monthly bill; the person can change the staff hours later in the simulator |
| other-fixed-share | one third of rent | The simulator's existing, disclosed rule |
| days-open | 28 a month | The simulator's value |
| contingency | 10% to 20% | 10% is the SBA's break-even cushion (read). The 20% comes from a SCORE restaurant guide (https://www.score.org/sites/default/files/d7_migration/01/SCORE%20CoE%20Deluxe-eGuide-12%20Steps%20to%20Starting%20a%20%20Restaurant7-17-16.pdf) that returned "410 Gone": **find the live copy or label the 20% as ours** |
| buffer-months | 3 to 6 months of running costs | A common rule of thumb in vendor guides, not a standard. Labelled "our assumption, ask an accountant" |

### 5.4 Numbers I could NOT find a reliable source for (so they will not appear)

- Start-up cost **totals or lines for the UK and China** (only vendor or lender blogs, mostly blocked; Chinese industry
  reports with unclear provenance or behind a paywall).
- **Restaurant start-up costs in the US** until a person reads the Toast/KaTom pages (or finds a better one).
- **Rent** in any city (the person types their own; the US guides give one wide range).
- **Insurance, utilities, bookkeeping and accounting fees, equipment-leasing rates, delivery-app commissions.**
- **Typical customers a day** and **typical spend** by size: not sourced anywhere, so the person's own guess is used.
- **Food waste share, seasonality, how long a new place takes to build up regulars.** The simulator has flat
  seasonality and no ramp-up; the page says so instead of inventing a curve.
- **Alcohol permit costs in the US** (state by state), the UK **Scotland** process, **China** rent and shop-fit costs.
- Any **named supplier** I could open: Webstaurant, Nisbets, Restaurant Depot, Start Up Loans and SCORE's mentor page all
  returned "403" to an automated read, so I cannot yet vouch for them as links. See 5.5.

### 5.5 "Where to find it": what is ready, and the rule for names

For each checklist item the page gives **kinds of places first** ("new and used restaurant-equipment dealers; restaurant
auctions; leasing companies") and then **named official or well-known pages only when I have read the page**:

| Item | Named, read and ready | Kinds of places (no names yet) |
|---|---|---|
| Licences and permits | US: SBA licences page, FDA Food Code page, your city or county health department; UK: GOV.UK starting a food business, your local council's licensing team; China: the SAMR Order No. 78 text, your local Administration for Market Regulation (市场监督管理局) and city government service portal (政务服务网) | |
| Money and advice | US: SBA local assistance (SBDC, SCORE) | UK: ask a bank or a government-backed start-up loan scheme (named page blocked, to verify); China: your local small-business service centre |
| Business structure and tax | US: SBA (EIN is free); UK: GOV.UK set up a business | China: your local tax office |
| Pay and hiring | BLS, GOV.UK pay rates, NBS release | local labour or employment office |
| Equipment, suppliers, premises | | equipment dealers (new, used, auction, leasing), cash-and-carry wholesalers, local producers, commercial property agents and listing sites. Named sites are added **only after the link check and a person's look**. |

Every named link carries: *"We are not affiliated with these sites, receive nothing from them, and do not endorse
them. Links can change; last checked <date>."* No affiliate links, no paid placements, ever.

### 5.6 Link-check script (not in CI by default)

`engine/scripts/check_links.py` (standard library only): reads every `source_url` in the data file and every link in the
pointer rows; for each it requests the page with a normal browser identification and records **200 / redirect (and
where to) / 404 or 410 / 403 or 429 ("blocked for robots: a person must open it") / timeout** in `link_status.json`
with the date; prints a table; exits non-zero on 404/410/timeouts only. Run by hand before each release, and the plan
page shows each link's "last checked" date. A test (offline) only checks that every URL in the data file is `https`
and is present in `link_status.json` with a date.

---

## 6. Page designs (in words)

Uses the approved tokens only: cream page, white 28px cards, pill buttons, green for the main button, **amber for the
one highlight ("Try it in the simulator")**, charcoal text, Nunito headings, Inter text, gentle fade-up, hover lift,
all switched off under reduced motion. Amber is never a text colour. A caution is charcoal words inside an amber
outline (never red).

**Question screens (`/guide`).** One card per question, the same look as the start form: a short green heading,
a one-line "why we ask", photo cards for type and size (reusing the industry photos), big pill options for the rest.
"Previous" (secondary) and "Next" (green). A thin progress line ("Question 3 of 9"), not a number race. The last screen
ends with **"Show my rough plan"** (amber). A reminder line sits under every screen: *"A rough estimate, not advice."*

**Plan page (`/guide/plan/:id`), top to bottom, each section a card:**

1. **Header and disclaimer.** "Your rough start-up plan: a small café in the United States". Directly under it, an
   amber-outlined note: *"A rough estimate, not advice. Real costs depend on your city and your choices. Where
   published guides disagree, we show the whole range."* A small line: "Worked out with data dated 2026-10-10."
2. **Summary.** Three big tiles in the style of the Try page: *Start-up cost* (range), *Running costs a month*, *You
   would need about N customers a day to break even*, plus one sentence about the budget: "Your budget looks **tight**
   for this plan" (charcoal text in an amber outline) or "looks enough" (sage). No celebrating.
3. **Budget.** A table (stacked cards on a phone) with every line: item, low to high, "published guides", a small
   "one guide only" tag where relevant, and a "Source" link per line (with its last-checked date). Below it the
   running-costs table and the break-even working in four plain steps, so a person can follow the sum.
4. **Checklist: first year.** Nine expandable cards: premises; licences and permits; equipment; suppliers; menu and
   pricing; staff; marketing; bookkeeping and tax; insurance. Each card: **What to do** (2 to 3 short lines), **Typical
   cost** (range with source, or "ask a local supplier"), **Where to find it** (kinds of places, named official pages),
   and, where we cannot help, the **"We can't do this"** box (section 7). Ordered by the answer to question 9 (items
   with waiting times first for people opening soon; the UK's 28-day registration rule is stated).
5. **What you will probably struggle with.** Six cards for the business type: cash flow, rent, food waste, staffing,
   pricing, slow months. Each: what happens in plain words, what to watch, and a link to the part of the plan that
   covers it. Numbers only where sourced (for example people cost as a share of sales, with the profitable and
   loss-making spread from the NRA survey; one optional sentence of the BLS one-year survival figure, marked "all
   industries"). No scare language.
6. **Try it in the simulator.** The amber button *"Try it in the simulator"*, a short plain explanation of what will
   happen ("We'll set up a practice business from your answers so you can slide a price and see 12 months. It shows your
   place as if it were already trading normally."), and the missing-number prompts if question 8 was unsure.
7. **Footer actions.** "Print or save as PDF", "Change my answers" (back into the screens, keeping them), "Delete this
   plan" (soft delete with Undo, the existing flow), and the standing line: *"Scenarios, not forecasts. Not legal, tax or
   financial advice."*

**Mobile (390px).** One column; tables become stacked "line cards" (item on top, range under it, source link under that);
checklist cards collapse by default with 44px headers; the amber button is full width and sticky at the bottom of the
Try section only; no horizontal scroll; tap targets 44px; the question screens are one card each with the buttons
at the bottom.

**Print.** Plain black on white, no photos, each section avoids page breaks, links printed as text with their URL
in brackets so the page is usable on paper, the disclaimer repeated in the footer.

---

## 7. Wording samples

**Standing disclaimer (top of the plan and in the footer):**
> A rough estimate, not advice. Real costs depend on your city and your choices. This is a planning aid, not legal, tax or
> financial advice. We are not affiliated with the sites we link to, and links can change.

**How to read a range:**
> Published guides disagree a lot, so we show the whole range. The middle is just the middle of the range, not a
> prediction. The two biggest unknowns are building work and rent, and both depend on your street.

**Where we only have the person's numbers:**
> We couldn't find a reliable published figure for start-up costs in the United Kingdom. Rather than guess, we left it
> out. Ask two or three local suppliers and agents for quotes; the checklist shows what to ask for.

**"We can't do this" pointers:**
> **Licences.** We can't tell you which licences you need or what they cost. That depends on your city and what you sell.
> In the United States, start with the Small Business Administration's licences page, then your city or county health
> department. [links, last checked ...]
>
> **UK.** We can't register your business for you. Registering a food business with your local council is free and
> the official page says to do it at least 28 days before you start trading. [GOV.UK link, last checked ...]
>
> **China.** 我们无法替你办理证照。 In English: *We can't handle licences for you. The rule is set out in the State
> Administration for Market Regulation's Order No. 78; ask your local Administration for Market Regulation (市场监督管理局)
> which documents your city wants.*
>
> **Tax and accounts.** We can't give tax advice. Ask a qualified local accountant or your tax office.

**Legal-fact guard.** A sentence about what the law requires appears only if it is read from an official page and quoted
in the data file; everything else is "ask your local council / office".

**The simulator banner (Today, for a guide business):**
> This shows your future business as if it were already open and trading normally. A real opening is usually slower. It
> is a way to try changes on paper, not a forecast of your first months.

**Budget verdicts:** "Your budget looks enough for the middle of this plan." / "Your budget looks tight: it covers
the low end of this plan but not the middle." / "Your budget is below the low end of this plan. You could start smaller
(a stall, kiosk or home kitchen), or save longer."

---

## 8. Test plan

**Engine (`engine/tests/test_startup.py`, `test_startup_data.py`):**
- Calculator: totals equal the sum of the rows that apply; low <= middle <= high; the worked example in 4.5 reproduces
  to the dollar; rent 0 (own premises); 1 person and 500 people; 0 customers rejected; ingredient share of 0% and 100%
  (break-even impossible: message, no divide-by-zero); sales so low that costs exceed any plausible break-even;
  a business type or country with no rows (empty result, no crash); alcohol yes/no switches rows; `needs_hand_check`
  rows are ignored; every number is finite and non-negative; the same answers always give the same plan.
- **Data file:** every number has `source_name`, https `source_url`, `source_type`, `accessed` (a real date not in the
  future), `confidence`, `low <= high`, known `unit` and `currency`; `assumption` rows have a rationale and no URL; no
  duplicate ids; every checklist item has at least one "where to find it" entry or the "ask locally" text; the data file
  can be read through the package (not only from the repo root).
- Golden-rule test: no module in `startup.py` imports anything AI-related; the backend plan endpoints are tested to start
  no AI job and write no `ai_interactions` row.

**Backend:** plan endpoints (create, read, recalculate, soft delete, restore, purge); answers validated (422 with plain
text); the simulator mapping returns exactly the fields `quick_baseline` expects and the cash override never goes below
0; `setup_source = guide` accepted; the `guide` business works with Today, How and Share (`how.py` treats it like a quick
business); migration up/down/up on a copy of the real database; no new outbound requests.

**Frontend:** each question screen (empty field allowed while typing, validation only on Next, "not sure" paths,
Previous keeps answers); the plan page for the US (full numbers), the UK (no totals, own-numbers mode) and "somewhere
else"; the disclaimer present on every guide screen; links open in a new tab with `rel="noopener noreferrer"`; Back
behaviour (`backTarget`); the Try button creates the business through the existing start flow; vitest-axe on every new
page; contrast tests for any new token pair (none expected); 44px targets; reduced motion; a print-CSS test like the
Share page's; no number on screen that is not from the engine response (a test renders the page from a fixture and
checks every currency amount appears in the fixture).

**Link and content checks (manual, before release):** run `check_links.py`; a person opens every `needs_hand_check` page
and either confirms the figure (flipping it to `verified`, with the date) or deletes the row.

**Risks and how they are handled**

| Risk | Handling |
|---|---|
| The ranges are mostly vendor marketing | Tier B label on every line, wide ranges, line-by-line view, "one guide only" tags, the disclaimer; strict rule that unreadable pages cannot ship |
| A figure goes out of date | Dates on every row and on the plan; "newer data exists" prompt; link-check script |
| A person reads "likely" as a promise | No "likely" label; "middle of the range"; verbs about the plan, never about them; amber (not red, not celebratory) verdicts |
| Wrong licence advice | Pointers and quoted official rules only; "we can't do this" boxes; no statement of legal requirement unless quoted from the official page |
| The simulator's "already trading" assumption misleads | A banner on Today for guide businesses and a sentence on the plan page before the button |
| Vendor or supplier endorsement | Named links only if read and verified; "not affiliated" line; no affiliate links |
| China data is thin | "Bring your own numbers" mode; official rule and pay only; Chinese names with English glosses |
| Scope creep | Section 9 |

---

## 9. Out of scope (stated plainly)

No payments, no accounts or logins, no marketplace of coaches, consultants or suppliers, no lead-generation, no
affiliate links, no real-time prices, no legal, tax or financial advice, no business-plan document generator beyond this
page, no cost data we cannot source, no AI-written numbers, no cities or states, no other countries until sourced, no
Chinese-language interface (only the Chinese official names beside English), no sending of answers anywhere (everything
stays in the local database; the only network use is the person clicking an outside link).

**AI.** The plan page works with **no AI at all** (rule-based text from templates, like the Today coach's fallback). I
recommend **no AI on this page in version 1**. If you want it later: it may only reword the "struggles" intro or the
summary sentence from a facts JSON, through the existing grounding and claim checks, with the template text as the
fallback, and every number it mentions must exist in the facts.

---

## 10. Steps and commits (suggested)

About **seven commits**, each ending with all tests green and a pause for your review:

1. **Data file, schema and checks** (`startup_ranges.json` with only the rows marked "read", the loader, the data-file
   tests, `check_links.py`, `link_status.json`).
2. **Calculator** (`startup.py`, tests including the worked example, "bring your own numbers" mode).
3. **Backend** (migration `startup_plans`, endpoints, bridge, simulator-answers mapping, soft delete and purge, tests).
4. **Question flow** (start-page entry, `/guide`, Back targets, nine screens, tests, axe).
5. **Plan page** (the sections, tables, checklist, struggles, print CSS, banner on Today for guide businesses, tests).
6. **Content pass** (a person reads the `needs_hand_check` pages with you, flips or removes rows, adds the verified
   restaurant rows, runs the link check, "last checked" dates on screen).
7. **Docs** (README tour screenshot, CHANGELOG, `CLAUDE.md`, this plan marked "built").

Rough size: 7 to 9 working sessions, with the biggest uncertainty in step 6 (how many blocked pages turn out readable).

---

## 11. Questions for you (these are truly your decisions)

1. **Countries.** I propose **US (full)**, **UK (facts + pay + own numbers)**, **China (rule + pay + own numbers)**, and
   "somewhere else" (checklist only). Do you agree? Do you want Canada, Australia or Ireland researched next?
2. **Vendor-written guides.** The only start-up cost data is from POS and company-formation vendors. Is it acceptable to
   show them as clearly labelled "published guides say" ranges? The alternative is **no start-up totals at all** (the
   plan would show only running costs, break-even and the checklist). My recommendation: show them, wide and labelled.
3. **Assumption rows.** Are you comfortable with the shown, named assumptions (173.33 hours a month; one third of rent for
   other bills; 3 to 6 months of buffer; 10% to 20% contingency)? They are disclosed on screen and can be changed in the
   simulator, but they are our choices, not sources.
4. **UK and China "bring your own numbers" mode.** Is it right that in those countries the person must type rent,
   ingredient share and spend, and we only do the arithmetic and add sourced pay and rules?
5. **Blocked pages.** Toast, KaTom and several supplier sites refuse automated reading. Do you want me to read them in the
   browser extension during step 6 (when it is connected), or will you check them by hand?
6. **City.** I propose to ask **country only** (no city) for privacy and because we have no city data. Do you want an
   optional city field only for wording the page title?
7. **No AI on the plan page in v1.** Agreed?
8. **Where it appears.** Is a second button under "Start your journey" plus a slim card above the form the right amount of
   prominence, or should the guide be a top-bar item as well?
9. **Chinese text.** For China pointers, OK to show the Chinese official names beside English glosses even though the
   rest of the app is English-only?
10. **The "already trading" simulator.** Are you happy with the banner approach, or would you rather the guide business
    start with a visible "opening months" note on every Try page?

I will not build anything until you answer these and approve the plan.
