# Beginner journey redesign: plan (awaiting approval)

Status: **approved 2026-10-03. Phases 1 to 4 are all built, and so is the new look (see section 14 at the end). This file is the ORIGINAL plan, kept for the reasoning; where the built app differs, `CLAUDE.md` and the README are right.** Written 2026-10-03 after reading `CLAUDE.md`, the engine
(`params.py`, `decisions.py`, `explain.py`), the backend (`models.py`, `schemas.py`, routers,
`engine_bridge.py`) and the frontend routes/components. Where a request does not match the code,
it is called out under "Corrections" so you can decide before anything is built.

## 0. Corrections to the brief (verified in the code)

1. **There is no live-preview endpoint yet.** `POST /industries/{id}/preview` only returns month 1 of
   the *unchanged* business (`preview_starting_month`). It takes no decision. The slider needs a **new**
   endpoint, `POST /businesses/{id}/preview_change`.
2. **A separate "fast low-sample run" is not needed.** Measured on this laptop: a 12-month run with
   one scenario plus baseline takes about 5-13 ms at 200 to 1,000 iterations. So the preview uses the
   normal 1,000 iterations and the same seed as the final run. Bonus: the preview number is then
   *exactly* the number the saved run shows (no "it said 9,800 while dragging and 9,650 after").
3. **Seasonality is flat in all three templates** (`seasonality = (1.0,) * 12`; no template sets it).
   A "busiest/quietest month" tile would show nothing true. See question Q2.
4. **Golden rule 2 needs a small, explicit amendment.** It says the user confirms parameters
   "before any simulation runs". A live slider simulates while the person drags. See section 3.
5. **The Today page has no run to explain yet.** The coach, `build_facts` and `coach_results` all work
   on a `simulation_run` that contains at least one scenario compared with the baseline. Today needs a
   baseline-only run plus a baseline-only facts builder and note (new engine function, new template text,
   same grounding and claim checks).
6. **Nothing identifies a person.** There are no accounts (JWT is only "planned"), and `localStorage`
   is not used anywhere yet. "Remember the tour", "remember my business" and the journal all hang off
   either `localStorage` (convenience only) or a participant code (study, later). See section 8.

## 1. What stays, what is reused, replaced or hidden

| Existing | Fate |
|---|---|
| Engine, all decision types, Monte Carlo, `explain.py` | **Kept.** Two additions only: `quickstart.py` and `build_today_facts` |
| Safety rules: confirm every step, grounding, claim check, `confirmed_via`, `ai_interactions` | **Kept**, extended (new `confirmed_via` value, new log kinds) |
| Café-house look (tokens in `index.css`, fonts, photos) | **Replaced** by the "direction B" look (`frontend/src/theme.css`, 2026-10); the industry photos stay |
| `CoachCard`, `AskCoach`, `coach/summary.py` tiles | **Reused**. `CoachCard` gets a `showAsk` prop; Ask moves behind an "Ask a question" link (dialog) |
| `DescribeBox`, `DecisionList`, `decisionSummary`, `interpretView` | **Reused** inside "say it in your own words" and the confirm step |
| `NumberField`, `InfoTip`, `friendlyError`, `riskAlert`, `format.ts`, `images.ts` | **Reused** |
| `NavBar.tsx` | **Replaced** by a new `AppNav` (Today / Try a change / My journal / Advanced) |
| Setup wizard (`/setup`), Scenario builder (`/scenarios`), Compare (`/compare`), Run history (`/history`) | **Hidden under "Advanced", routes unchanged** (no broken links, existing tests keep passing) |
| `docs/redesign-plan.md` (header/nav, hero bands, scenario cards, recipe sidebar, 3-column setup) | **Superseded.** Its header/nav is replaced by `AppNav`; the rest is dropped. I will mark it "superseded" |

New routes as planned: `/start`, `/today`, `/try`, `/try/:type`, `/watch/:runId`, `/journal`, `/plan/:runId/print`. **As built:** `/` and `/start` (start), `/today`, `/try`, `/timeline` (the 12-month view), `/how`, `/journal`, `/share`, plus the old `/setup`, `/scenarios`, `/compare`, `/history` under "Advanced".
`/` redirects to `/today` if a business is remembered, otherwise to `/start`.

## 2. PHASE 1: simple start, and the coach speaks first

### 2.1 Start screen (`/start`)
Step 1: three photo cards (café / restaurant / bakery; reuse `IndustryPicker` look). Step 2: four
plain questions (`NumberField`, empty while typing, validated only on Next, with `InfoTip`):
customers on a normal day, average spend per customer, monthly rent, number of staff.
Step 3: "What we assumed" note, then "Looks right, show me". Under it, a small link "Use a sample
business instead". A currency choice sits in the assumptions note (USD default), not in the questions.

### 2.2 Conversion rules (new pure function, `engine/btm_engine/quickstart.py`, tested)
`quick_baseline(template, daily_customers D, avg_spend P, monthly_rent R, staff S) -> (BusinessBaseline, assumed_fields)`.
Let `t0` be the industry's `default_baseline`, `days = t0.open_days` (28 in all three).

| Model input | Rule | Source of the rule |
|---|---|---|
| visits per month `V` | `D x days` | arithmetic |
| regulars share `r` | `t0.customers x t0.visits_per_regular / (that + t0.walk_in_visits)` = café 0.68, restaurant 0.50, bakery 0.62 | derived from the template's own defaults |
| `visits_per_regular` | `t0.visits_per_regular` | template |
| `customers` (regulars) | `V x r / visits_per_regular` | arithmetic |
| `walk_in_visits` | `V x (1 - r)` | arithmetic |
| `avg_ticket` | `P` | owner |
| `staff_fte` | `S` (part-timers: "count two part-timers as one") | owner |
| `fixed_costs` | `R + other`, **other = one third of rent** (utilities, insurance, fees) | **my assumption, unsourced, needs your OK (Q4)** |
| `marketing` | `t0.marketing / t0 monthly sales x owner's monthly sales` (same share of sales as the template) | derived from template |
| `cash` | **two months of the business's monthly costs** | **my assumption, needs your OK (Q3)** |
| `wage_per_fte`, `cogs_ratio`, `churn_rate`, `seats`, `open_days` | template defaults | template (café sourced; restaurant/bakery estimates) |

Rejected input: D, P <= 0; S, R < 0 (friendly message). Not rejected but warned: if the engine's month 1
shows a loss, the screen says "With these numbers you'd lose about X a month. Is that right?".
`assumed_fields` is stored on the snapshot, so the "what we assumed" note, the "How did we work this out?"
page and the thesis data all come from one source. As today, wage/marketing/cash defaults are US-dollar
scale; for other currencies the existing highlight notice appears on those assumed lines.

### 2.3 Sample business
"Try a sample café/restaurant/bakery" -> `POST /sample_business {industry}` creates a business named
"Sample café" with the template's default numbers, flagged `is_sample` and labelled as a sample everywhere
("an example, not a real business"). It lands on Today.

### 2.4 Today (`/today`)
- **Coach first, unasked:** 2-4 sentences, shown at once from rule-based text built from engine facts; the
  existing background AI job may replace it ("Updated with more detail"), same grounding + claim checks.
  Coach switched off (`COACH_ENABLED=false`): the sentences and Ask link are hidden, tiles and chart stay.
- **Three tiles:** (1) *What you keep each month* (median month-1 profit, bad to good case); (2) *Your safety
  net* (cash now, lowest point, "runs out in N of 10 futures" only if N > 0); (3) **proposal:** *Your quietest
  point* = the month of lowest cash, from `key_moments`, instead of busiest/quietest month (Q2).
- **Month-by-month line:** 12 months, median line with the bad-to-good band, from a baseline-only run.
- **"Ask a question"** link opens `AskCoach` in a dialog. The three chip questions stay AI-free.
- Backend: `GET /businesses/{id}/today` (idempotent; reuses the latest `kind='today'` run while the
  snapshot is unchanged), returns tiles, band arrays, month labels (reusing `interpret/months.py`), the
  rule-based note and `run_id` for the existing coach polling.

### 2.5 Tour
Three skippable steps in one dialog (what Today shows, how to try a change, where the journal is).
Focus-trapped, Esc skips, "Don't show again". Remembered in `localStorage` (convenience) and logged as an event.

### 2.6 Navigation
`AppNav`: **Today / Try a change / My journal / Advanced** (on the start page the bar offers How it works / What you get / Get started instead). Advanced is a menu: Compare, Scenario builder,
Run history, Full business setup. On phones: bottom tab bar with the three main items plus "More".

### 2.7 Phase 1 data/API
- Migration #1: `ui_events`; `businesses.is_sample`, `setup_source`, `participant_code`, `study_condition`;
  `business_snapshots.assumed_fields`; `simulation_runs.kind` (`compare` default).
- Endpoints: `GET /config`, `POST /industries/{id}/quick_baseline`, `POST /sample_business`,
  `GET /businesses/{id}/today`, `POST /events` (batch, fire and forget). `POST /businesses` gains optional
  `setup_source` and `assumed_fields`.
- Engine: `quickstart.py`, `build_today_facts`, `coach/template.py` today note, claim check for the today note.

## 3. PHASE 2: try a change with live feedback

- **Tiles** (photos from `decisionTypeImage`): change prices, hire someone, run a promotion, change hours,
  add to the menu, "say it in your own words" (existing `DescribeBox`). **Big purchase is cut from v1** (needs
  amount, loan months, rate, capacity: not a one-slider card); it stays reachable by typing it in words.
- **Slider cards** (each maps to one `Decision` in the engine's own units, validated against
  `DECISIONS_JSON_SCHEMA` + `Decision.validate`; the mapping is a tested pure function, never AI):
  price `percent` -20..+30; hire `fte` +0.5..+3; promotion = extra marketing spend per month (`marketing`,
  `absolute`/`percent`, to be fixed when building); hours = days a week -> `hours` days per month; menu
  `percent` on the average sale (with the optional cost share). Start-month choice uses the existing month rule
  ("March 2027 (month 6)").
- **Live result** (`POST /businesses/{id}/preview_change`): stateless, writes nothing except an optional event.
  Request: decision(s), horizon 12, fixed seed (same as the later saved run), 1,000 iterations. Response:
  extra profit a month (profit difference over 12 months / 12), the catch (regulars end vs "if you change
  nothing"), `beats_change_nothing_of_10` shown as **10 dots plus text "ahead in 7 of 10 futures"**, month
  arrays for the chart, the plain sentence from `describe_decision`, one rule-based coach sentence. Frontend:
  250 ms debounce plus `AbortController` so stale replies are dropped; result region is `aria-live="polite"`
  and announces only when dragging settles. No AI is called while dragging.
- **Golden rule 2, proposed wording:** "The user confirms the parameters *the LLM extracted* before any
  simulation runs. A slider sketch is the user's own input, is labelled 'just a sketch, nothing saved', is
  never stored and never explained by the AI. Anything saved, simulated at full quality or coach-explained
  needs a one-click confirmation of the plain sentence. 'Say it in your own words' still shows **no numbers**
  until the steps are confirmed." Needs your approval (Q1).
- **Confirm step:** the sentence ("Raise prices 10% from March 2027 (month 6)") plus "Yes, that's what I mean".
  On click the frontend uses the **existing** endpoints (create scenario with `confirmed=true`,
  `confirmed_via='try_change'`, then simulate at horizon 12), so the backend safety net is unchanged.
- **Watch the next 12 months** (`/watch/:runId`): Recharts chart with the "change nothing" path, the "this
  change" path and the bad-to-good band; a month dial (native `<input type=range>`, so arrow keys work, with
  `aria-valuetext` "Month 5, July 2027") and a readout of both paths at that month. Then three cards,
  What happens / Why / What could go wrong, from the existing coach summary (`CoachCard` pieces reused).

## 4. PHASE 3: trust and sharing

- **"How did we work this out?"** collapsible page section: plain steps (your numbers -> typical values ->
  1,000 possible futures -> compare with "if you change nothing"), the live list of assumptions with
  "you said" vs "typical", and the limits (uncalibrated marketing effect, US-based defaults).
- **"Share my plan"** (`/plan/:runId/print`): one clean page (change in words, three tiles, chart, why,
  watch-outs, assumptions, "Scenarios, not forecasts. Not financial advice."), print stylesheet, "Print or
  save as PDF" button using the browser. **No server-side PDF library** (no new dependency).
- **Empty states / errors:** one `EmptyState` component and one wording audit across all new screens, all
  through `friendlyError`; no raw status codes.

## 5. PHASE 4: My journal (cut first if time is short)

- Save a plan (a confirmed scenario's full run) to the journal. Tables (migration #2): `plans` (business,
  scenario, run, title, `month1_date`, `predicted` JSON = per-month profit p10/p50/p90, customers p50,
  baseline p50, saved_at) and `plan_checkins` (plan, `calendar_month`, `actual_profit`, optional
  `actual_customers`, entered_at, predicted p10/p50/p90 copied at entry, `within_band`, `abs_error`,
  `pct_error`). Predictions are copied so later engine changes never rewrite history.
- **The reminder:** there are no accounts, email or push. "One month later" = when the person opens the app
  and a month has ended, Today and the journal show "How did October really go?". It cannot ping anyone.
- Predicted vs actual: a plain sentence ("You made about 5,900; we expected 4,800 to 7,300, so it landed
  inside the range") and a small chart. Profit is defined in plain words on the form (sales minus the same
  costs the app uses) with an `InfoTip`.
- Thesis outputs: `GET /journal/accuracy` (per check-in error, % error, coverage of p10-p90, direction) and
  later CSV export.
- **Honest limit:** a study session lasts minutes, but this needs real months to pass. I suggest treating
  prediction accuracy as a pilot/longitudinal measure, and measuring understanding and confidence in the
  session itself. Optional later: "check the model with your last 3 months" (backtest).
- **Logging for the study (all phases):** `ui_events` rows: `screen_view`, `tour_step/skip`, `tile_picked`,
  `slider_settled` (value, start month, engine version, seed, iterations), `decision_confirmed`
  (`confirmed_via`), `plan_saved`, `share_opened`, `print_clicked`, `ask_opened`, `checkin_saved`,
  `error_shown`. Each has `created_at`, `session_id`, `business_id`, `participant_code` (nullable).
  Existing `ai_interactions` is unchanged. No free text goes in events.

## 6. Mobile, keyboard, contrast (every new screen)

- **Phone (360 px):** one column; tiles stack; slider full width with a 44 px thumb; sticky result bar under
  the slider; bottom tab bar; charts keep a minimum height and drop to 2 legend rows; the print page is a
  single A4 column.
- **Keyboard:** everything is a real `button`/`input`; visible focus ring; skip link; focus moves to the page
  heading on route change; tour and Ask dialogs trap focus, Esc closes, focus returns to the opener; dots
  are never colour-only (text "7 of 10"); +/- signs stay on the green/red bars.
- **Contrast:** a pure `contrast.ts` helper plus a Vitest test that checks every token pair used on new
  screens meets 4.5:1 (body) and 3:1 (large text, UI borders); `--muted-2` is the one to verify first.
  Optional (needs your OK, Q10): `vitest-axe` as a dev dependency for automatic accessibility checks.
- Manual pass per phase, on Chrome at 360 px and 1280 px, keyboard only, with screenshots in the PR notes.

## 7. How study mode fits later without a rewrite

Phase 1 already adds: `GET /config`, `businesses.participant_code` and `study_condition`, `ui_events`, and
a single helper `coach_enabled_for(business)` that every coach/ask/today call uses (today it returns the
global `COACH_ENABLED`). The frontend reads `coachEnabled` from one `ConfigProvider`, and every coach-related
element is behind it, so "coach off" is a tested state of every new screen. Later, study mode only adds:
a participant-code entry screen (sets `participant_code`, assigns `study_condition`), a `questionnaire_responses`
table and form pages, a consent screen, and a CSV export that joins `ui_events`, `ai_interactions`,
`decisions.confirmed_via`, `plans` and `plan_checkins`. None of that changes the screens built here.

## 8. Remembering "who am I" (no accounts)

`localStorage` key for the current business id and tour flag, always in try/catch, page works without it.
If it is empty and the server has businesses, `/start` shows "Continue as <name>" first. Clearing browser data
therefore loses only the shortcut, not the data. Real identity arrives with participant codes or later JWT auth.

## 9. Test plan

**Engine (`engine/tests`):** `quick_baseline` invariants per industry (visits in = visits out; regulars share
matches the template; marketing share; rejects bad input; default-like inputs reproduce a profitable month),
`build_today_facts` (rounded, no unsupported keys), 12-month zero-decision runs.
**Backend (`backend/tests`):** quick_baseline endpoint; sample business; `today` (idempotent, reuses run,
coach off, grounding and claim check on the today note, AI mocked, fallback); `preview_change` (writes no
rows, deterministic, **equals the saved run's number for the same seed/iterations**, 422 on invalid
decisions, all six types); events (stored, size limit); plans/check-ins (month alignment, band logic,
accuracy report, copying of predictions); migrations (upgrade a copy of the current DB, data kept); the
existing 393 stay green; `tests/conftest.py` keeps pinning the coach to `template`.
**Frontend (Vitest + Testing Library):** pure libs (slider->Decision mapping for every tile, dots, month
labels, tour state, contrast); components (Start: four questions, no forced 0, warning on loss; Today:
coach-first, tiles, coach-off state; Tour: focus trap, skip, remembered; Try: debounce with fake timers, stale
replies discarded, confirm gating, nothing saved before confirm; Timeline dial by keyboard; Journal; Print
view; empty/error states). The existing 175 stay green. I will report real counts, not estimates.

## 10. Build order and commits (one commit per phase, tests green at each)

0. Mark `redesign-plan.md` superseded; amend `CLAUDE.md` (golden rule 2 wording, if approved).
1. **Commit 1, Phase 1:** engine `quickstart` + today facts (+tests) -> migration #1 + models -> endpoints
   (+tests) -> today note (+tests) -> frontend libs -> Start, Today, Tour, AppNav -> manual run on 3 industries
   and 360 px -> README/CLAUDE.md counts.
2. **Commit 2, Phase 2:** `preview_change` (+tests) -> mappings and hook -> tiles and cards -> confirm ->
   Watch page.
3. **Commit 3, Phase 3:** explanation, print view, empty states.
4. **Commit 4, Phase 4:** migration #2, journal endpoints, UI, accuracy report.
I stop after each commit for your review before starting the next phase.

## 11. Risks, and what I recommend cutting

| Risk | Why | Recommendation |
|---|---|---|
| Trust: four answers -> eight guessed inputs | Restaurant/bakery defaults are uncalibrated; cash and "other fixed costs" are invented rules | Show assumptions prominently, label "typical, not measured", warn on a loss; get Q3/Q4 answered |
| Golden rule 2 | Live simulation before confirmation | Amend wording as in section 3, or drop live preview (then Phase 2 is much weaker) |
| Flat seasonality | Busiest/quietest tile is meaningless | Replace tile (Q2); do not invent seasonal curves |
| Today needs baseline-only coach path | New facts builder, note, claim-check rules | Reuse run/cache/polling; keep rule-based first |
| Journal accuracy within a study | Months must pass; noise; profit definition | Pilot/longitudinal framing; do Phase 4 last |
| No identity | localStorage only | Participant code later; "Continue as" on /start |
| Big purchase card | Needs loan/capacity inputs | **Cut from v1** (use "say it in your own words") |
| PDF | Needs a server library | **Cut:** browser print/save as PDF only |
| Reminders | No email/push | **Cut:** in-app prompt on open only |
| Size | Phase 1 and 2 are the big ones | If time is short: ship Phases 1-2 (+ a small Phase 3 print view), drop Phase 4 |

## 12. Questions for you

- **Q1** May I amend golden rule 2 as worded in section 3 (slider sketches allowed, labelled, never stored)?
- **Q2** Third Today tile: use "lowest cash point" instead of busiest/quietest month (flat seasonality)?
- **Q3** Cash when the owner does not give it: "two months of costs", or add an optional fifth question?
- **Q4** "Other fixed costs = one third of rent": acceptable, or ask a fifth question / choose another rule?
- **Q5** Staff question: count part-timers as half, and does the owner count as staff?
- **Q6** Currency on the start screen: keep it only inside the assumptions note, with US-scale wage/marketing/cash defaults flagged for non-USD?
- **Q7** Journal framed as a pilot/longitudinal measure for the thesis?
- **Q8** Study: do you need a consent screen and a participant-code step in the first release, or later?
- **Q9** Keep old URLs (`/setup`, `/scenarios`, `/compare`, `/history`) under "Advanced" unchanged?
- **Q10** OK to add `vitest-axe` (dev dependency) for accessibility tests?
- **Q11** Pause for your review after every phase commit (my default), or run Phases 1-2 back to back?


## 13. Decisions made on approval (2026-10-03)

- Q1 yes: golden rule 2 amended exactly as in section 3 (recorded in `CLAUDE.md`).
- Q2 yes: the third Today tile is "your lowest cash point". Since a growing business never dips, the tile then says the cash does not drop below today's.
- Q3 yes: cash = two months of costs, shown and editable in "What we assumed"; no fifth question.
- Q4 yes: other fixed costs = one third of rent, shown as a rough rule, recorded in `CLAUDE.md` as an assumption.
- Q8: no consent screen or participant code in this release; study mode stays separate but the code is ready (columns, `coach_enabled_for`, `ui_events`, `/config`).
- Staff are treated as full-time people, and the assumptions note says so. Currency is per business (USD default) with a small "Change currency" link on the start screen.
- Old URLs keep working under "Advanced". `vitest-axe` added as a dev-only dependency. The journal will be labelled a pilot feature. The "big purchase" tile and PDF generation are cut. Pause for review after each phase.
- Phase 1 answers I chose myself (my recommended options): Q5 part-timers count as one full-time person and the owner may count themself; Q6 currency lives in a small link on the start screen; Q7 framing of the journal is left for Phase 4; Q9 old URLs unchanged; Q11 pause after every phase.


## 14. Roadmap status (updated 2026-10-09)

- Phases 1 to 4 (simple start and Today, Try a change and the 12-month view, How we worked it out / share page / empty states, My journal): **built.**
- Visual redesign ("direction B"): **built on every page**, in two steps (step 1: tokens, nav, start page, Try a change; step 2: every other page, one chart colour system, confetti on saving a plan or a journal month, a plain black-and-white print page). It replaces `docs/redesign-plan.md`. The rules are recorded in `CLAUDE.md`.
- Not built: study mode (see `docs/study-mode-plan.md`, waiting for answers to its open questions), reminders by email or push, streaming explanations, accounts.
